-- J7 (W6; closes C6 and the W6 half of C7): required initial training is free to the worker
-- (worker_fee forced to 0 for every session, no fee / charge / deduction path), optional pay and
-- reimbursement are owner-entered with no defaults and stored verbatim, the enrollment records the
-- free-training notice acknowledgement and the agreed terms, and a trainee cannot be assigned to
-- customer bookings during the training. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j7t-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j7t-o1@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j7t-c1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j7t-w' || n || '@local.test'))) from generate_series(1, 2) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j7t-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.r1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.w(1))::text, true);
select set_config('fx.b1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J7 opening'))::text, true);
select set_config('fx.app1', test_helpers.create_job_application(current_setting('fx.j1')::uuid, pg_temp.w(1), 'accepted')::text, true);
create temporary table j7t_ids (label text primary key, id uuid) on commit drop;
grant all on j7t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j7t_ids where label = p_label $$;
insert into j7t_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid));
insert into j7t_ids select 'past' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - n) from generate_series(1, 3) n;
insert into j7t_ids values ('today', test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today()));
select count(test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + n)) from generate_series(1, 3) n;
-- Returns the name of the constraint the statement violates (or the SQLSTATE if none is named).
create function pg_temp.violated(p_sql text) returns text language plpgsql as $$
declare name text;
begin
  execute p_sql;
  return 'succeeded';
exception when others then
  get stacked diagnostics name = constraint_name;
  return sqlstate || ':' || coalesce(name, '');
end $$;

-- ---------- fee forced to zero for every session ----------
select ok(pg_temp.violated(format($$ insert into public.training_programs (shop_id, owner_id, title, worker_fee)
                                      values (%L, %L, 'Fee training', 1.00) $$, current_setting('fx.s1'), current_setting('fx.o1')))
          in ('23514:tp_required_initial_training_is_free', '23514:tp_worker_fee_is_zero'),
          'j7_worker_fee_check_forces_zero_for_required_initial');
select ok(pg_temp.violated(format($$ update public.training_programs set worker_fee = 1.00 where id = %L $$, pg_temp.id('p')))
          in ('23514:tp_required_initial_training_is_free', '23514:tp_worker_fee_is_zero'),
          'j7_worker_fee_check_forces_zero_for_required_initial');
select is(pg_temp.violated(format($$ update public.training_programs set training_kind = 'optional', worker_fee = 5 where id = %L $$, pg_temp.id('p'))),
          '23514:tp_training_kind_check', 'j7_worker_fee_check_forces_zero_for_required_initial');
select is((select array_agg(conname::text order by conname) from pg_constraint
           where conrelid = 'public.training_programs'::regclass and conname in ('tp_required_initial_training_is_free', 'tp_worker_fee_is_zero')),
          array['tp_required_initial_training_is_free', 'tp_worker_fee_is_zero'], 'j7_worker_fee_check_forces_zero_for_required_initial');

-- ---------- no charge path in the schema ----------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(coalesce(p.proargnames, '{}')) arg
           where n.nspname = 'public' and p.proname ~ 'training' and arg ~* '(fee|charge|deduct|price|cost|payment)'),
          0, 'j7_training_rpcs_have_no_fee_charge_or_deduction_parameter');
select is((select array_agg(table_name || '.' || column_name order by table_name, column_name) from information_schema.columns
           where table_schema = 'public' and table_name like 'training\_%' and column_name ~* '(fee|charge|deduct|price|cost|payment)'),
          array['training_programs.worker_fee'], 'j7_training_tables_have_no_charge_or_deduction_columns');
select is((select count(*)::int from pg_constraint con
           where con.contype = 'f' and con.conrelid::regclass::text like 'training\_%'
             and con.confrelid::regclass::text in ('bookings', 'shop_pricing')), 0, 'j7_no_training_foreign_key_to_bookings_or_pricing');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ~ 'training' and p.prosrc ~* 'bookings'),
          array['bookings_guard_training_assignment'], 'j7_only_the_read_only_gate_references_training_and_bookings');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ~ 'training' and p.prosrc ~* '(shop_pricing|quoted_price|insert into public\.bookings|update public\.bookings)'),
          0, 'j7_only_the_read_only_gate_references_training_and_bookings');

-- ---------- pay and reimbursement: optional, no defaults, verbatim ----------
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'training_programs'
           and column_name in ('training_pay_amount', 'training_pay_currency', 'training_pay_period', 'training_pay_details', 'reimbursement_details')
           and column_default is null), 5, 'j7_pay_and_reimbursement_have_no_defaults_and_are_stored_verbatim');
select test_helpers.act_as_owner('j7t-o1@local.test');
insert into j7t_ids select 'draft', (public.create_training_program(current_setting('fx.s1')::uuid, 'Pay test')).id;
select is((select row(training_pay_amount, training_pay_currency, training_pay_period, training_pay_details, reimbursement_details, worker_fee)::text
           from public.training_programs where id = pg_temp.id('draft')), row(null, null, null, null, null, 0.00)::text,
          'j7_pay_and_reimbursement_have_no_defaults_and_are_stored_verbatim');
select throws_ok($$ select public.update_training_program_draft(pg_temp.id('draft'), 'Pay test', null, null, null, 3, null, 350, null, null, null, null,
                    (select updated_at from public.training_programs where id = pg_temp.id('draft'))) $$, '23514', null,
                 'j7_pay_is_optional_and_all_or_nothing');
select lives_ok($$ select public.update_training_program_draft(pg_temp.id('draft'), 'Pay test', null, null, null, 3, null, null, null, null,
                   'Snacks provided on training days', null, (select updated_at from public.training_programs where id = pg_temp.id('draft'))) $$,
                'j7_pay_is_optional_and_all_or_nothing');
select lives_ok($$ select public.update_training_program_draft(pg_temp.id('draft'), 'Pay test', null, null, null, 3, null, 412.50, 'PHP', 'session',
                   '  Allowance:  P412.50 per session, paid Friday ', 'Fare up to P60 back', (select updated_at from public.training_programs where id = pg_temp.id('draft'))) $$,
                'j7_pay_and_reimbursement_have_no_defaults_and_are_stored_verbatim');
select is((select row(training_pay_amount, training_pay_currency, training_pay_period, training_pay_details, reimbursement_details)::text
           from public.training_programs where id = pg_temp.id('draft')),
          row(412.50, 'PHP', 'session', 'Allowance:  P412.50 per session, paid Friday', 'Fare up to P60 back')::text,
          'j7_pay_and_reimbursement_have_no_defaults_and_are_stored_verbatim');

-- ---------- notice acknowledgement and snapshot on the enrollment ----------
select test_helpers.act_as_service();
update public.training_programs set training_pay_amount = 300, training_pay_currency = 'PHP', training_pay_period = 'day',
  reimbursement_details = 'Fare refunded' where id = pg_temp.id('p');
select test_helpers.open_training_program(pg_temp.id('p'));
create temporary table j7t_counts on commit drop as
  select (select count(*) from public.bookings) as bookings, (select count(*) from public.shop_pricing) as prices;
select test_helpers.act_as_owner('j7t-o1@local.test');
insert into j7t_ids select 'e1', (public.invite_to_training(pg_temp.id('p'), current_setting('fx.app1')::uuid)).id;
select test_helpers.act_as(pg_temp.w(1));
select throws_ok($$ select public.respond_to_training_invitation(pg_temp.id('e1'), true) $$, '23514',
                 'Review the free-training notice before enrolling.', 'j7_enrollment_requires_free_training_notice_acknowledgement');
select throws_ok($$ select public.respond_to_training_invitation(pg_temp.id('e1'), true, 'w5_v1') $$, '23514',
                 'Review the free-training notice before enrolling.', 'j7_enrollment_requires_free_training_notice_acknowledgement');
select is(public.training_enrollment_notice_version(), 'w6_v1', 'j7_enrollment_requires_free_training_notice_acknowledgement');
select lives_ok($$ select public.respond_to_training_invitation(pg_temp.id('e1'), true, 'w6_v1',
                   (select schedule_changed_at from public.training_programs where id = pg_temp.id('p'))) $$,
                'j7_enrollment_requires_free_training_notice_acknowledgement');
select is((select row(notice_version, notice_acknowledged_at is not null, terms_snapshot ->> 'worker_fee', terms_snapshot ->> 'training_pay_amount',
                      terms_snapshot ->> 'training_pay_currency', terms_snapshot ->> 'reimbursement_details', terms_snapshot ->> 'training_kind')::text
           from public.training_enrollments where id = pg_temp.id('e1')),
          row('w6_v1', true, '0.00', '300.00', 'PHP', 'Fare refunded', 'required_initial')::text, 'j7_snapshot_records_fee_zero_and_pay_as_entered');

-- ---------- trainee not assignable; flow creates no booking or price rows ----------
select test_helpers.act_as_owner('j7t-o1@local.test');
select throws_ok(format($$ update public.bookings set assigned_worker_id = %L where id = %L $$, current_setting('fx.r1'), current_setting('fx.b1')),
                 '23514', 'This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends.',
                 'j7_trainee_not_assignable_to_customer_bookings');
select count(public.record_training_attendance(pg_temp.id('e1'), pg_temp.id('today'), 'present'));
select test_helpers.act_as_service();
insert into j7t_ids values ('e2', test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.w(2)));
select test_helpers.act_as_owner('j7t-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('e2'), pg_temp.id('past' || n), 'present')) from generate_series(1, 3) n;
select count(public.record_training_assessment(pg_temp.id('e2'), array[true, true], 'passed'));
select test_helpers.act_as_service();
select is((select row((select count(*) from public.bookings) - bookings, (select count(*) from public.shop_pricing) - prices)::text from j7t_counts),
          row(0, 0)::text, 'j7_training_flow_creates_no_booking_or_price_rows');
select ok((select assigned_worker_id from public.bookings where id = current_setting('fx.b1')::uuid) is null, 'j7_training_flow_creates_no_booking_or_price_rows');

select * from finish();
rollback;
