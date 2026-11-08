-- J18 (W6): existing flows keep working with training rows present. The C7 booking gate blocks
-- only a same-owner trainee who is mid-way through required training (assign or start); other
-- roster rows, other owners' trainees and finished / left / cancelled / invited enrollments are
-- unaffected; quotes, ratings, the W5 application flow and shop / account deletion still work.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18w6-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j18w6-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j18w6-o2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j18w6-c1@local.test')::text, true);
select set_config('fx.by', test_helpers.create_customer('j18w6-by@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j18w6-' || l || '@local.test')))
from unnest(array['a', 'b', 'c', 'd', 'e', 'f', 'n', 'g']) l;
create function pg_temp.u(p_label text) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j18w6-' || p_label || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j18w6_ids (label text primary key, id uuid) on commit drop;
grant all on j18w6_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18w6_ids where label = p_label $$;
insert into j18w6_ids select 'r' || l, test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, pg_temp.u(l))
from unnest(array['a', 'b', 'c', 'd', 'e', 'f', 'n']) l;
insert into j18w6_ids values ('ru', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid));
insert into j18w6_ids select 'b' || n, test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)
from generate_series(1, 9) n;
insert into j18w6_ids values ('p', test_helpers.create_training_program(current_setting('fx.s1')::uuid)),
                             ('q', test_helpers.create_training_program(current_setting('fx.s2')::uuid));
insert into j18w6_ids select 'd' || n, test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() - n) from generate_series(1, 3) n;
select count(test_helpers.add_training_session(pg_temp.id('p'), test_helpers.manila_today() + n)) from generate_series(1, 3) n;
select test_helpers.add_training_session(pg_temp.id('q'), test_helpers.manila_today() + 1), test_helpers.open_training_program(pg_temp.id('p')),
       test_helpers.open_training_program(pg_temp.id('q'));
insert into j18w6_ids select 'e' || l, test_helpers.create_accepted_enrollment(pg_temp.id('p'), pg_temp.u(l)) from unnest(array['a', 'b', 'c', 'd']) l;
insert into j18w6_ids values ('ee', test_helpers.create_accepted_enrollment(pg_temp.id('q'), pg_temp.u('e')));
insert into public.training_enrollments (program_id, shop_id, owner_id, worker_id, shop_name_snapshot, program_title_snapshot, owner_display_name_snapshot)
select id, shop_id, owner_id, pg_temp.u('f'), 'Shop', title, 'Owner' from public.training_programs where id = pg_temp.id('p');
-- eb completes, ec withdraws, ed is cancelled by the owner (through the RPCs).
select test_helpers.act_as_owner('j18w6-o1@local.test');
select count(public.record_training_attendance(pg_temp.id('eb'), pg_temp.id('d' || n), 'present')) from generate_series(1, 3) n;
select count(public.record_training_assessment(pg_temp.id('eb'), array[true, true], 'passed'));
select count(public.cancel_training_enrollment(pg_temp.id('ed'), 'Shop paused this training run'));
select test_helpers.act_as(pg_temp.u('c'));
select count(public.withdraw_from_training(pg_temp.id('ec')));
create function pg_temp.assign(p_roster text, p_booking text) returns text language sql as $$
  select test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id(p_roster), pg_temp.id(p_booking))) $$;
create function pg_temp.assigned(p_booking text) returns uuid language sql stable security definer
as $$ select assigned_worker_id from public.bookings where id = pg_temp.id(p_booking) $$;

-- ---------- assignment gate ----------
select test_helpers.act_as_owner('j18w6-o1@local.test');
select is(pg_temp.assign('rn', 'b1'), 'succeeded', 'j18_booking_assignment_unchanged_for_roster_worker_without_training');
select is(pg_temp.assign('ru', 'b2'), 'succeeded', 'j18_booking_assignment_unchanged_for_roster_worker_without_training');
select is(pg_temp.assigned('b1'), pg_temp.id('rn'), 'j18_booking_assignment_unchanged_for_roster_worker_without_training');
select is(pg_temp.assign('ra', 'b3'), '23514', 'j7_trainee_not_assignable_to_customer_bookings');
select is(pg_temp.assign('rb', 'b3'), 'succeeded', 'j18_assignment_allowed_after_completion_withdrawal_or_cancellation');
select is(pg_temp.assign('rc', 'b4'), 'succeeded', 'j18_assignment_allowed_after_completion_withdrawal_or_cancellation');
select is(pg_temp.assign('rd', 'b5'), 'succeeded', 'j18_assignment_allowed_after_completion_withdrawal_or_cancellation');
select is(pg_temp.assign('rf', 'b6'), 'succeeded', 'j18_assignment_allowed_after_completion_withdrawal_or_cancellation');
select is(pg_temp.assign('re', 'b7'), 'succeeded', 'j18_other_owners_training_does_not_block_assignment');
select is(pg_temp.assign('ra', 'b8'), '23514', 'j7_trainee_not_assignable_to_customer_bookings');
select ok(pg_temp.assigned('b8') is null, 'j7_trainee_not_assignable_to_customer_bookings');

-- ---------- starting a booking during training ----------
select test_helpers.act_as_service();
update public.bookings set booking_status = 'accepted', assigned_worker_id = pg_temp.id('ra') where id = pg_temp.id('b9');
update public.bookings set booking_status = 'accepted' where id = pg_temp.id('b3');
select test_helpers.act_as(pg_temp.u('a'));
select throws_ok($$ update public.bookings set booking_status = 'in_progress' where id = pg_temp.id('b9') $$, '23514',
                 'You are in required training with this shop and cannot start customer bookings until the training ends.',
                 'j18_assigned_trainee_cannot_start_booking_during_training');
select test_helpers.act_as(pg_temp.u('b'));
select lives_ok($$ update public.bookings set booking_status = 'in_progress' where id = pg_temp.id('b3') $$,
                'j18_assigned_trainee_cannot_start_booking_during_training');
select test_helpers.act_as_owner('j18w6-o1@local.test');
select count(public.cancel_training_enrollment(pg_temp.id('ea'), 'Trainee moved to another branch'));
select test_helpers.act_as(pg_temp.u('a'));
select lives_ok($$ update public.bookings set booking_status = 'in_progress' where id = pg_temp.id('b9') $$,
                'j18_assigned_trainee_cannot_start_booking_during_training');
select test_helpers.act_as_service();
select is((select booking_status::text from public.bookings where id = pg_temp.id('b9')), 'in_progress', 'j18_assigned_trainee_cannot_start_booking_during_training');

-- ---------- quotes, ratings, W5 flow ----------
select test_helpers.act_as_customer('j18w6-c1@local.test');
select lives_ok(format($$ insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
                         values ('J18 W6', %L, 'Sedan', 'Basic Wash', 'Test address', now() + interval '2 days', %L) $$,
                       current_setting('fx.c1'), current_setting('fx.s1')), 'j18_booking_quote_and_rating_unchanged_with_training_rows');
select test_helpers.act_as_service();
select is((select quoted_price from public.bookings where customer_name = 'J18 W6'), 250.00::numeric, 'j18_booking_quote_and_rating_unchanged_with_training_rows');
update public.bookings set booking_status = 'completed' where id = pg_temp.id('b1');
select test_helpers.act_as_customer('j18w6-c1@local.test');
select lives_ok($$ update public.bookings set customer_rating_stars = 5 where id = pg_temp.id('b1') $$, 'j18_booking_quote_and_rating_unchanged_with_training_rows');
select test_helpers.act_as_service();
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J18W6 opening'))::text, true);
select test_helpers.act_as(pg_temp.u('g'));
select set_config('fx.app_g', (public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1')).id::text, true);
select test_helpers.act_as_owner('j18w6-o1@local.test');
select count(public.transition_job_application(current_setting('fx.app_g')::uuid, 'submitted', 'under_review'));
select is((public.transition_job_application(current_setting('fx.app_g')::uuid, 'under_review', 'accepted')).status, 'accepted',
          'j18_w5_application_flow_unchanged');
select is((public.invite_to_training(pg_temp.id('p'), current_setting('fx.app_g')::uuid)).status, 'invited', 'j18_w5_application_flow_unchanged');

-- ---------- shop and account deletion still succeed ----------
select test_helpers.act_as_owner('j18w6-o2@local.test');
select lives_ok(format('delete from public.shops where id = %L', current_setting('fx.s2')), 'j18_shop_and_account_deletion_still_succeed_with_training');
select test_helpers.act_as_service();
select is((select count(*)::int from public.shops where id = current_setting('fx.s2')::uuid), 0, 'j18_shop_and_account_deletion_still_succeed_with_training');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', current_setting('fx.by'), 'role', 'authenticated')::text, true);
select lives_ok(format('delete from auth.users where id = %L', current_setting('fx.o1')), 'j18_shop_and_account_deletion_still_succeed_with_training');
select test_helpers.act_as_service();
select is((select count(*)::int from public.shops where owner_id = current_setting('fx.o1')::uuid)
          + (select count(*)::int from public.workers where owner_id = current_setting('fx.o1')::uuid), 0,
          'j18_shop_and_account_deletion_still_succeed_with_training');

select * from finish();
rollback;
