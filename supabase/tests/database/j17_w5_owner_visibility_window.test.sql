-- J17 (W5): the owner-visibility window moves with REAL status changes. An owner reads an
-- applicant profile only while the application is submitted / under_review / shortlisted /
-- accepted, and loses it after reject, withdraw or close. Private contacts are never readable,
-- a worker never sees another worker application, the snapshot stays fixed for a trusted session.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select set_config('fx.a1', test_helpers.create_super_admin('j17vw-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17vw-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17vw-o2@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j17vw-w' || n || '@local.test'))) from generate_series(1, 4) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j17vw-w' || n || '@local.test' $$;
insert into public.worker_private_contacts (profile_id, contact_phone, contact_email, preferred_contact_method)
select pg_temp.w(n), '+63 917 100 000' || n, 'j17vw-w' || n || '-private@local.test', 'phone' from generate_series(1, 4) n;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17VW opening'))::text, true);
create temporary table j17vw_apps (n int primary key, id uuid) on commit drop;
grant all on j17vw_apps to public;
create function pg_temp.app(k int) returns uuid language sql stable as $$ select id from j17vw_apps where n = k $$;
create function pg_temp.visible() returns int[] language sql stable
as $$ select coalesce(array_agg(l.n order by l.n), '{}') from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) p
      join j17vw_apps l on l.id = p.application_id $$;

-- Real applications through the RPC, one per worker (worker 4 stays a draft).
select test_helpers.act_as(pg_temp.w(1));
insert into j17vw_apps select 1, (public.create_job_application(current_setting('fx.j1')::uuid, 'note 1', true, 'w5_v1')).id;
select test_helpers.act_as(pg_temp.w(2));
insert into j17vw_apps select 2, (public.create_job_application(current_setting('fx.j1')::uuid, 'note 2', true, 'w5_v1')).id;
select test_helpers.act_as(pg_temp.w(3));
insert into j17vw_apps select 3, (public.create_job_application(current_setting('fx.j1')::uuid, 'note 3', true, 'w5_v1')).id;
select test_helpers.act_as(pg_temp.w(4));
insert into j17vw_apps select 4, (public.create_job_application(current_setting('fx.j1')::uuid, 'draft 4', false, null)).id;

-- Window opens at submit; the draft never shows.
select test_helpers.act_as_owner('j17vw-o1@local.test');
select is(pg_temp.visible(), array[1, 2, 3], 'j17_owner_window_opens_at_submit_and_never_for_drafts');
select is((select count(*)::int from public.job_applications where status = 'draft'), 0, 'j17_owner_window_opens_at_submit_and_never_for_drafts');

-- Moves inside the window keep access.
select public.transition_job_application(pg_temp.app(1), 'submitted', 'under_review');
select is(pg_temp.visible(), array[1, 2, 3], 'j17_owner_window_stays_open_through_review_shortlist_accept');
select public.transition_job_application(pg_temp.app(1), 'under_review', 'shortlisted');
select is(pg_temp.visible(), array[1, 2, 3], 'j17_owner_window_stays_open_through_review_shortlist_accept');
select public.transition_job_application(pg_temp.app(1), 'shortlisted', 'accepted');
select is(pg_temp.visible(), array[1, 2, 3], 'j17_owner_window_stays_open_through_review_shortlist_accept');

-- Reject closes the window for that applicant only.
select public.transition_job_application(pg_temp.app(2), 'submitted', 'rejected');
select is(pg_temp.visible(), array[1, 3], 'j17_owner_loses_applicant_profile_after_reject');
select is((select count(*)::int from public.job_applications where id = pg_temp.app(2)), 1, 'j17_owner_loses_applicant_profile_after_reject');
select throws_ok($$ select * from public.applicant_verified_certifications(pg_temp.app(2)) $$,
                 '42501', 'Job application not found.', 'j17_owner_loses_applicant_profile_after_reject');

-- Withdraw by the worker closes it.
select test_helpers.act_as(pg_temp.w(3));
select public.transition_job_application(pg_temp.app(3), 'submitted', 'withdrawn');
select test_helpers.act_as_owner('j17vw-o1@local.test');
select is(pg_temp.visible(), array[1], 'j17_owner_loses_applicant_profile_after_withdraw');
select throws_ok($$ select * from public.applicant_verified_certifications(pg_temp.app(3)) $$,
                 '42501', 'Job application not found.', 'j17_owner_loses_applicant_profile_after_withdraw');

-- Submit the draft (visible), then close the opening: it is hidden, the accepted one stays.
select test_helpers.act_as(pg_temp.w(4));
select public.transition_job_application(pg_temp.app(4), 'draft', 'submitted', 'w5_v1');
select test_helpers.act_as_owner('j17vw-o1@local.test');
select is(pg_temp.visible(), array[1, 4], 'j17_owner_loses_applicant_profile_after_opening_close');
select public.transition_job_opening(current_setting('fx.j1')::uuid, 'published', 'closed');
select is(pg_temp.visible(), array[1], 'j17_owner_loses_applicant_profile_after_opening_close');
select is((select status from public.job_applications where id = pg_temp.app(4)), 'closed', 'j17_owner_loses_applicant_profile_after_opening_close');
select is((select status from public.job_applications where id = pg_temp.app(1)), 'accepted', 'j17_owner_loses_applicant_profile_after_opening_close');

-- Private contacts never, at any stage; worker_profiles not widened.
select is((select count(*)::int from public.worker_private_contacts), 0, 'j17_owner_never_reads_private_contacts_at_any_stage');
select is((select count(*)::int from public.worker_profiles), 0, 'j17_owner_never_reads_private_contacts_at_any_stage');
select is((select count(*)::int from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) p
           where to_jsonb(p)::text ~* '(j17vw-w[0-9]-private|917 100)'), 0, 'j17_owner_never_reads_private_contacts_at_any_stage');
select test_helpers.act_as_owner('j17vw-o2@local.test');
select throws_ok($$ select * from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid) $$,
                 '42501', 'Job opening not found.', 'j17_other_owner_never_reads_applicant_profiles');

-- A worker never sees another worker application, before or after status changes.
select test_helpers.act_as(pg_temp.w(2));
select is((select array_agg(l.n order by l.n) from public.job_applications a join j17vw_apps l on l.id = a.id), array[2],
          'j17_worker_never_sees_another_workers_application_after_status_changes');
select test_helpers.act_as(pg_temp.w(1));
select is((select array_agg(l.n order by l.n) from public.job_applications a join j17vw_apps l on l.id = a.id), array[1],
          'j17_worker_never_sees_another_workers_application_after_status_changes');

-- Snapshot immutable for a trusted session even after the status changed.
select test_helpers.act_as_service();
select throws_ok(format($$ update public.job_applications set opening_snapshot = '{"title":"x"}' where id = %L $$, pg_temp.app(1)),
                 '42501', 'The application snapshot cannot be changed.', 'j17_snapshot_immutable_for_trusted_session_after_decision');

select * from finish();
rollback;
