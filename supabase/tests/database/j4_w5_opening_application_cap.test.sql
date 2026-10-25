-- J4 (W5): the per-opening cap of 500 non-draft, non-withdrawn applications. The cap is a literal
-- in job_application_apply_checks (no setting to lower), so this file fills an opening with 499
-- synthetic workers inside the rolled-back transaction, then checks the 500th is accepted, the
-- 501st is refused and a withdrawal frees a slot. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('fx.a1', test_helpers.create_super_admin('j4cap-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j4cap-o1@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J4 cap opening'))::text, true);
select count(test_helpers.create_job_application(current_setting('fx.j1')::uuid,
         test_helpers.create_worker_profile(test_helpers.create_worker('j4cap-w' || n || '@local.test')), 'submitted'))
from generate_series(1, 499) n;
select set_config('fx.late', test_helpers.create_worker_profile(test_helpers.create_worker('j4cap-late1@local.test'))::text, true);
select set_config('fx.late2', test_helpers.create_worker_profile(test_helpers.create_worker('j4cap-late2@local.test'))::text, true);

select is((select count(*)::int from public.job_applications where job_opening_id = current_setting('fx.j1')::uuid), 499, 'j4_opening_cap_setup_499_rows');

select test_helpers.act_as(current_setting('fx.late')::uuid);
select lives_ok($$ select public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1') $$, 'j4_500th_application_accepted');
select test_helpers.act_as(current_setting('fx.late2')::uuid);
select throws_ok($$ select public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1') $$,
                 '23514', 'This job opening is not accepting more applications.', 'j4_501st_application_refused_by_opening_cap');
select throws_ok($$ select public.create_job_application(current_setting('fx.j1')::uuid, null, false, null) $$,
                 '23514', 'This job opening is not accepting more applications.', 'j4_501st_application_refused_by_opening_cap');
select test_helpers.act_as(current_setting('fx.late')::uuid);
select lives_ok($$ select public.transition_job_application(
  (select id from public.job_applications where worker_id = current_setting('fx.late')::uuid), 'submitted', 'withdrawn') $$,
  'j4_withdrawal_frees_a_cap_slot');
select test_helpers.act_as(current_setting('fx.late2')::uuid);
select lives_ok($$ select public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1') $$, 'j4_withdrawal_frees_a_cap_slot');

select * from finish();
rollback;
