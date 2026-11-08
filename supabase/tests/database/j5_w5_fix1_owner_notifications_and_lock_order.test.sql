-- J5 (W5 fix cycle 1): owner notifications go to the CURRENT owner of the opening's shop, and
-- only when that owner is also the application's owner_id (after a trusted shop transfer nobody
-- is told until the repair realigns owner_id). transition_job_application locks the opening
-- before the application (same order as transition_job_opening + auto-close); behaviour unchanged.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select set_config('fx.a1', test_helpers.create_super_admin('j5f1-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j5f1-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j5f1-o2@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j5f1-w' || n || '@local.test'))) from generate_series(1, 4) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j5f1-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J5F1 opening'))::text, true);
create function pg_temp.notes(p_recipient text, p_category text, p_app text) returns int language sql stable security definer
as $$ select count(*)::int from public.notifications
      where recipient_id = current_setting(p_recipient)::uuid and category = p_category
        and subject_id = current_setting(p_app)::uuid $$;

-- Before any transfer: the owner is notified of a submit.
select test_helpers.act_as(pg_temp.w(1));
select set_config('fx.app1', (public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1')).id::text, true);
select is(pg_temp.notes('fx.o1', 'job_application.submitted', 'fx.app1'), 1, 'j5_fix1_owner_notified_before_transfer');

-- Trusted shop transfer to o2 (owner_id on the opening and applications not realigned).
select test_helpers.act_as_service();
update public.shops set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.s1')::uuid;
select test_helpers.act_as(pg_temp.w(2));
select set_config('fx.app2', (public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1')).id::text, true);
select is(pg_temp.notes('fx.o1', 'job_application.submitted', 'fx.app2'), 0, 'j5_fix1_former_owner_not_notified_of_submit');
select is(pg_temp.notes('fx.o2', 'job_application.submitted', 'fx.app2'), 0, 'j5_fix1_unaligned_new_owner_not_notified_of_submit');
select test_helpers.act_as(pg_temp.w(1));
select public.transition_job_application(current_setting('fx.app1')::uuid, 'submitted', 'withdrawn');
select is(pg_temp.notes('fx.o1', 'job_application.withdrawn', 'fx.app1'), 0, 'j5_fix1_former_owner_not_notified_of_withdraw');
select is(pg_temp.notes('fx.o2', 'job_application.withdrawn', 'fx.app1'), 0, 'j5_fix1_unaligned_new_owner_not_notified_of_withdraw');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events
           where subject_id = current_setting('fx.app1')::uuid and action = 'job_application.status_changed'),
          1, 'j5_fix1_withdraw_still_audited_without_owner_notification');

-- Repair realigns owner_id: the current owner (o2) is notified, the former owner never.
update public.job_openings set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.j1')::uuid;
update public.job_applications set owner_id = current_setting('fx.o2')::uuid where job_opening_id = current_setting('fx.j1')::uuid;
select test_helpers.act_as(pg_temp.w(3));
select set_config('fx.app3', (public.create_job_application(current_setting('fx.j1')::uuid, null, true, 'w5_v1')).id::text, true);
select is(pg_temp.notes('fx.o2', 'job_application.submitted', 'fx.app3'), 1, 'j5_fix1_current_owner_notified_of_submit');
select is(pg_temp.notes('fx.o1', 'job_application.submitted', 'fx.app3'), 0, 'j5_fix1_former_owner_not_notified_of_submit');
select test_helpers.act_as(pg_temp.w(2));
select public.transition_job_application(current_setting('fx.app2')::uuid, 'submitted', 'withdrawn');
select is(pg_temp.notes('fx.o2', 'job_application.withdrawn', 'fx.app2'), 1, 'j5_fix1_current_owner_notified_of_withdraw');
select is(pg_temp.notes('fx.o1', 'job_application.withdrawn', 'fx.app2'), 0, 'j5_fix1_former_owner_not_notified_of_withdraw');

-- Lock order: opening FOR SHARE before the application FOR UPDATE in the transition RPC.
select test_helpers.act_as_service();
select ok(position('for share' in pg_get_functiondef('public.transition_job_application(uuid, text, text, text)'::regprocedure)) > 0
          and position('for share' in pg_get_functiondef('public.transition_job_application(uuid, text, text, text)'::regprocedure))
              < position('for update' in pg_get_functiondef('public.transition_job_application(uuid, text, text, text)'::regprocedure)),
          'j5_fix1_transition_locks_opening_before_application');

-- No behaviour regression after the reorder: owner decision, stale check, unknown id, withdraw
-- of an accepted application after the opening closed.
select test_helpers.act_as_owner('j5f1-o2@local.test');
select public.transition_job_application(current_setting('fx.app3')::uuid, 'submitted', 'under_review');
select throws_ok($$ select public.transition_job_application(current_setting('fx.app3')::uuid, 'submitted', 'rejected') $$,
                 '55000', 'This application changed. Refresh and try again.', 'j5_fix1_stale_check_after_reorder');
select throws_ok($$ select public.transition_job_application(gen_random_uuid(), 'submitted', 'rejected') $$,
                 '42501', 'Job application not found.', 'j5_fix1_unknown_application_after_reorder');
select is((public.transition_job_application(current_setting('fx.app3')::uuid, 'under_review', 'accepted')).status,
          'accepted', 'j5_fix1_owner_accept_after_reorder');
select public.transition_job_opening(current_setting('fx.j1')::uuid, 'published', 'closed');
select test_helpers.act_as(pg_temp.w(3));
select is((public.transition_job_application(current_setting('fx.app3')::uuid, 'accepted', 'withdrawn')).status,
          'withdrawn', 'j5_fix1_worker_withdraw_on_closed_opening_after_reorder');
select test_helpers.act_as_owner('j5f1-o2@local.test');
select throws_ok($$ select public.transition_job_application(current_setting('fx.app2')::uuid, 'withdrawn', 'rejected') $$,
                 '42501', 'This application status change is not allowed.', 'j5_fix1_transition_rules_unchanged_after_reorder');

select * from finish();
rollback;
