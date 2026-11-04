-- J16 / W16 (PLAN section 5; D-84): holding the training gate after a recorded fail or a removed shop refuses no worker
-- action. The worker can always leave the training, leave the roster, decline or end a contract, apply elsewhere, work for
-- another owner and delete the account. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create temporary table j16w16_ids (label text primary key, id uuid) on commit drop;
grant all on j16w16_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j16w16_ids where label = p_label $$;
create function pg_temp.email(p_tag text) returns text language sql immutable as $$ select 'j16w16-' || p_tag || '@local.test' $$;
create function pg_temp.held(p_row text) returns boolean language sql stable security definer as $$
  select public.roster_worker_in_required_training(pg_temp.id(p_row), pg_temp.id('s_main')) $$;
create function pg_temp.enrollment(p_tag text) returns text language sql stable security definer as $$
  select status from public.training_enrollments where id = pg_temp.id('e_' || p_tag) $$;
-- A trainee of p_tag: own training shop of o1, an open program with 3 past days, a linked roster row and an accepted enrollment.
create function pg_temp.trainee(p_tag text) returns void language plpgsql as $$
begin
  insert into j16w16_ids values ('s_' || p_tag, test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
  insert into j16w16_ids values ('p_' || p_tag, test_helpers.create_training_program(pg_temp.id('s_' || p_tag)));
  perform test_helpers.add_training_session(pg_temp.id('p_' || p_tag), test_helpers.manila_today() - n) from generate_series(1, 3) n;
  perform test_helpers.open_training_program(pg_temp.id('p_' || p_tag));
  insert into j16w16_ids values ('w_' || p_tag, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email(p_tag))));
  insert into j16w16_ids values ('r_' || p_tag, test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('w_' || p_tag)));
  insert into j16w16_ids values ('e_' || p_tag, test_helpers.create_accepted_enrollment(pg_temp.id('p_' || p_tag), pg_temp.id('w_' || p_tag)));
end $$;
create function pg_temp.fail(p_tag text) returns void language plpgsql as $$
declare
  session_ids uuid[];
  session_id uuid;
  items integer;
begin
  select array_agg(s.id) into session_ids from public.training_sessions s where s.program_id = pg_temp.id('p_' || p_tag);
  select cardinality(p.assessment_checklist) into items from public.training_programs p where p.id = pg_temp.id('p_' || p_tag);
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  foreach session_id in array session_ids loop
    perform public.record_training_attendance(pg_temp.id('e_' || p_tag), session_id, 'present');
  end loop;
  perform public.record_training_assessment(pg_temp.id('e_' || p_tag), array_fill(false, array[items]), 'failed', null, 'Did not meet the checklist yet');
  perform test_helpers.act_as_service();
end $$;
create function pg_temp.remove_shop(p_tag text) returns void language plpgsql as $$
begin
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  execute format('delete from public.shops where id = %L', pg_temp.id('s_' || p_tag));
  perform test_helpers.act_as_service();
end $$;

-- ---------- fixtures ----------
insert into j16w16_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1'))), ('c1', test_helpers.create_customer(pg_temp.email('c1'))),
                              ('by', test_helpers.create_customer(pg_temp.email('by'))),
                              ('o1', test_helpers.create_owner(pg_temp.email('o1'))), ('o2', test_helpers.create_owner(pg_temp.email('o2')));
insert into j16w16_ids values ('s_main', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
                              ('s_o2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')));

-- ---------- withdraw in every held state ----------
select pg_temp.trainee('sr');
select pg_temp.remove_shop('sr');
select is(pg_temp.held('r_sr'), true, 'j16_w16_worker_withdraws_after_shop_removed');
select test_helpers.act_as_worker(pg_temp.email('sr'));
select is((public.withdraw_from_training(pg_temp.id('e_sr'))).status, 'withdrawn', 'j16_w16_worker_withdraws_after_shop_removed');
select test_helpers.act_as_service();

select pg_temp.trainee('fa');
select pg_temp.fail('fa');
select is(pg_temp.held('r_fa'), true, 'j16_w16_worker_withdraws_after_failed_assessment');
select test_helpers.act_as_worker(pg_temp.email('fa'));
select is((public.withdraw_from_training(pg_temp.id('e_fa'))).status, 'withdrawn', 'j16_w16_worker_withdraws_after_failed_assessment');
select test_helpers.act_as_service();

select pg_temp.trainee('fs');
select pg_temp.fail('fs');
select pg_temp.remove_shop('fs');
select is(pg_temp.held('r_fs'), true, 'j16_w16_worker_withdraws_after_failed_and_shop_removed');
select test_helpers.act_as_worker(pg_temp.email('fs'));
select is((public.withdraw_from_training(pg_temp.id('e_fs'))).status, 'withdrawn', 'j16_w16_worker_withdraws_after_failed_and_shop_removed');
select test_helpers.act_as_service();

-- ---------- the worker leaves the roster while the gate holds ----------
select pg_temp.trainee('ul');
select pg_temp.fail('ul');
select test_helpers.act_as_worker(pg_temp.email('ul'));
select lives_ok(format('select public.unlink_my_roster_entry(%L)', pg_temp.id('r_ul')), 'j16_w16_worker_unlinks_while_gate_held');
select test_helpers.act_as_service();
select is((select (w.user_id is null)::text || ',' || pg_temp.held('r_ul') from public.workers w where w.id = pg_temp.id('r_ul')), 'true,true', 'j16_w16_worker_unlinks_while_gate_held');

-- ---------- contracts stay the worker's choice ----------
select pg_temp.trainee('dc');
select pg_temp.fail('dc');
select test_helpers.create_accepted_application(pg_temp.id('s_main'), pg_temp.id('w_dc')) is not null as application_dc;
insert into j16w16_ids values ('k_dc', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s_main'), pg_temp.id('w_dc')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k_dc'), pg_temp.email('o1')) is not null as filled_dc;
select test_helpers.send_test_contract(pg_temp.id('k_dc'), pg_temp.email('o1')) is not null as sent_dc;
select test_helpers.act_as_worker(pg_temp.email('dc'));
select is((public.decline_worker_contract_version(pg_temp.id('k_dc'), (select pending_version_id from public.my_worker_contracts()))).status, 'declined',
          'j16_w16_worker_declines_contract_offer_while_gate_held');
select test_helpers.act_as_service();

select pg_temp.trainee('tc');
select pg_temp.remove_shop('tc');
insert into j16w16_ids values ('k_tc', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s_main'), pg_temp.id('w_tc'), pg_temp.email('tc')));
select is(pg_temp.held('r_tc'), true, 'j16_w16_worker_terminates_contract_while_gate_held');
select test_helpers.act_as_worker(pg_temp.email('tc'));
select is((public.terminate_worker_contract(pg_temp.id('k_tc'), (select revision from public.my_worker_contracts() where contract_id = pg_temp.id('k_tc')),
           'Ending this contract for a local test.')).status, 'terminated', 'j16_w16_worker_terminates_contract_while_gate_held');
select test_helpers.act_as_service();

-- ---------- everything outside this owner stays open ----------
select pg_temp.trainee('ap');
select pg_temp.fail('ap');
insert into j16w16_ids values ('j_o2', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s_o2'), 'J16 W16 opening')));
select test_helpers.act_as_worker(pg_temp.email('ap'));
select is((public.create_job_application(pg_temp.id('j_o2'), null, true, 'w5_v1')).status, 'submitted', 'j16_w16_worker_applies_elsewhere_while_gate_held');
select test_helpers.act_as_service();

insert into j16w16_ids values ('r_o2', test_helpers.create_roster_worker(pg_temp.id('o2'), pg_temp.id('w_ap'))),
                              ('b_o2', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s_o2'), 'accepted'));
select test_helpers.act_as_owner(pg_temp.email('o2'));
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('r_o2'), pg_temp.id('b_o2'))), 'succeeded',
          'j16_w16_other_owner_assigns_and_worker_starts_while_gate_held');
select test_helpers.act_as_worker(pg_temp.email('ap'));
select is(test_helpers.attempt(format('update public.bookings set booking_status = %L where id = %L', 'in_progress', pg_temp.id('b_o2'))), 'succeeded',
          'j16_w16_other_owner_assigns_and_worker_starts_while_gate_held');
select test_helpers.act_as_service();
select is((select booking_status || ',' || (assigned_worker_id = pg_temp.id('r_o2'))::text from public.bookings where id = pg_temp.id('b_o2')), 'in_progress,true',
          'j16_w16_other_owner_assigns_and_worker_starts_while_gate_held');

-- ---------- the account can always be deleted (untrusted, like GoTrue) ----------
select pg_temp.trainee('da');
select pg_temp.fail('da');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('by'), 'role', 'authenticated')::text, true);
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('w_da')), 'j16_w16_worker_account_deletion_not_refused');
select test_helpers.act_as_service();
select is((select count(*)::int from public.profiles where id = pg_temp.id('w_da')) || ',' || (select count(*)::int from public.training_enrollments where id = pg_temp.id('e_da'))
           || ',' || (select (user_id is null)::text from public.workers where id = pg_temp.id('r_da')), '0,0,true', 'j16_w16_worker_account_deletion_not_refused');

select * from finish();
rollback;
