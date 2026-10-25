-- J17 (W5 fix cycle 1): S-B1 closed drafts and the current-shop-owner rule.
-- A draft (with a cover note) closed by the auto-close keeps submitted_at null: the owner gets no
-- row, no applicant profile, no certifications call and no transition; the worker still sees it,
-- gets no notification for it and may delete it. Owner reads and actions also require the CURRENT
-- shops.owner_id, not only the owner_id copied into job_applications. The 500 cap takes a
-- per-opening advisory lock.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select set_config('fx.a1', test_helpers.create_super_admin('j17f1-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17f1-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17f1-o2@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17f1-w1@local.test'))::text, true);
select set_config('fx.w2', test_helpers.create_worker_profile(test_helpers.create_worker('j17f1-w2@local.test'))::text, true);
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17F1 opening one'))::text, true);
select set_config('fx.j2', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17F1 opening two'))::text, true);

-- Worker 1: a draft with a cover note on opening one; worker 2: a sent application on opening one.
select test_helpers.act_as(current_setting('fx.w1')::uuid);
select set_config('fx.d1', (public.create_job_application(current_setting('fx.j1')::uuid, 'Private draft note J17F1', false, null)).id::text, true);
select test_helpers.act_as(current_setting('fx.w2')::uuid);
select set_config('fx.s2', (public.create_job_application(current_setting('fx.j1')::uuid, 'Sent note', true, 'w5_v1')).id::text, true);

-- The owner closes the opening: both rows become closed, the draft stays never-sent.
select test_helpers.act_as_owner('j17f1-o1@local.test');
select public.transition_job_opening(current_setting('fx.j1')::uuid, 'published', 'closed');
select test_helpers.act_as_service();
select is((select status || ':' || (submitted_at is null)::text || ':' || (closed_at is not null)::text
           from public.job_applications where id = current_setting('fx.d1')::uuid),
          'closed:true:true', 'j17_fix1_auto_close_keeps_draft_as_never_sent_closed_row');
select is((select count(*)::int from public.notifications
           where recipient_id = current_setting('fx.w1')::uuid and category = 'job_application.closed'),
          0, 'j17_fix1_no_closed_notification_for_a_draft');
select is((select count(*)::int from public.notifications
           where recipient_id = current_setting('fx.w2')::uuid and category = 'job_application.closed'),
          1, 'j17_fix1_no_closed_notification_for_a_draft');

-- Owner: 0 rows for the closed draft, no profile, no certifications, no transition.
select test_helpers.act_as_owner('j17f1-o1@local.test');
select is((select count(*)::int from public.job_applications where id = current_setting('fx.d1')::uuid),
          0, 'j17_fix1_owner_never_reads_closed_draft');
select is((select count(*)::int from public.job_applications where cover_note like '%Private draft note%'),
          0, 'j17_fix1_owner_never_reads_closed_draft');
select is((select array_agg(id) from public.job_applications where job_opening_id = current_setting('fx.j1')::uuid),
          array[current_setting('fx.s2')::uuid], 'j17_fix1_owner_never_reads_closed_draft');
select is((select count(*)::int from public.applicant_profiles_for_job_opening(current_setting('fx.j1')::uuid)
           where application_id = current_setting('fx.d1')::uuid),
          0, 'j17_fix1_owner_no_profile_access_for_closed_draft');
select throws_ok($$ select * from public.applicant_verified_certifications(current_setting('fx.d1')::uuid) $$,
                 '42501', 'Job application not found.', 'j17_fix1_owner_no_profile_access_for_closed_draft');
select throws_ok($$ select public.transition_job_application(current_setting('fx.d1')::uuid, 'closed', 'rejected') $$,
                 '42501', 'Job application not found.', 'j17_fix1_owner_cannot_act_on_closed_draft');

-- Worker: still sees the own closed draft with its note; it does not count as "applied".
select test_helpers.act_as(current_setting('fx.w1')::uuid);
select is((select cover_note from public.job_applications where id = current_setting('fx.d1')::uuid),
          'Private draft note J17F1', 'j17_fix1_worker_still_sees_own_closed_draft');
select is(public.worker_has_applied_to_job_opening(current_setting('fx.j1')::uuid), false,
          'j17_fix1_closed_draft_does_not_count_as_applied');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j1')::uuid), 0,
          'j17_fix1_closed_draft_does_not_count_as_applied');
select throws_ok($$ select public.transition_job_application(current_setting('fx.d1')::uuid, 'closed', 'submitted', 'w5_v1') $$,
                 '42501', 'This application status change is not allowed.', 'j17_fix1_closed_draft_cannot_be_sent');
select lives_ok($$ select public.delete_job_application_draft(current_setting('fx.d1')::uuid) $$,
                'j17_fix1_worker_can_delete_own_closed_draft');
select is((select count(*)::int from public.job_applications where id = current_setting('fx.d1')::uuid), 0,
          'j17_fix1_worker_can_delete_own_closed_draft');
select test_helpers.act_as(current_setting('fx.w2')::uuid);
select throws_ok($$ select public.delete_job_application_draft(current_setting('fx.s2')::uuid) $$,
                 '42501', 'Job application not found.', 'j17_fix1_sent_closed_application_cannot_be_deleted');
select is(public.worker_has_applied_to_job_opening(current_setting('fx.j1')::uuid), true,
          'j17_fix1_sent_application_still_counts_as_applied');

-- Current owner rule: worker 2 applies to opening two; the shop then changes hands (trusted repair).
select set_config('fx.s3', (public.create_job_application(current_setting('fx.j2')::uuid, 'Second note', true, 'w5_v1')).id::text, true);
select test_helpers.act_as_service();
update public.shops set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as_owner('j17f1-o1@local.test');
select is((select count(*)::int from public.job_applications), 0, 'j17_fix1_former_owner_loses_reads');
select throws_ok($$ select * from public.applicant_profiles_for_job_opening(current_setting('fx.j2')::uuid) $$,
                 '42501', 'Job opening not found.', 'j17_fix1_former_owner_loses_reads');
select throws_ok($$ select * from public.applicant_verified_certifications(current_setting('fx.s3')::uuid) $$,
                 '42501', 'Job application not found.', 'j17_fix1_former_owner_loses_reads');
select throws_ok($$ select public.transition_job_application(current_setting('fx.s3')::uuid, 'submitted', 'under_review') $$,
                 '42501', 'Job application not found.', 'j17_fix1_former_owner_cannot_act');

-- Helper and lock wiring.
select test_helpers.act_as_service();
select is((select prosecdef and proconfig = array['search_path=public, pg_temp'] from pg_proc
           where oid = 'public.is_current_job_opening_owner(uuid)'::regprocedure), true,
          'j17_fix1_current_owner_helper_is_pinned_definer');
select is(has_function_privilege('anon', 'public.is_current_job_opening_owner(uuid)', 'execute')
          or has_function_privilege('service_role', 'public.is_current_job_opening_owner(uuid)', 'execute'),
          false, 'j17_fix1_current_owner_helper_denied_to_anon');
select ok(position('job_opening_apps:' in pg_get_functiondef('public.job_application_apply_checks(uuid, uuid, uuid)'::regprocedure)) > 0
          and position('job_applications:' in pg_get_functiondef('public.job_application_apply_checks(uuid, uuid, uuid)'::regprocedure))
              < position('job_opening_apps:' in pg_get_functiondef('public.job_application_apply_checks(uuid, uuid, uuid)'::regprocedure)),
          'j17_fix1_cap_check_takes_per_opening_lock_after_worker_lock');

select * from finish();
rollback;
