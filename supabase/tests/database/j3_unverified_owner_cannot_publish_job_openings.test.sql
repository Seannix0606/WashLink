-- J3 (W4, job-opening part; the certification part of J3 is W7): only the owner of a shop
-- with a recorded verification (P15) can publish or resume; losing verification hides
-- published openings from workers. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j3-a1@local.test')::text, true);
select set_config('fx.a2', test_helpers.create_super_admin('j3-a2@local.test')::text, true);
select set_config('fx.c1', test_helpers.create_customer('j3-c1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j3-w1@local.test')::text, true);
select set_config('fx.o_pending', test_helpers.create_owner('j3-pending@local.test')::text, true);
select set_config('fx.o_rejected', test_helpers.create_owner('j3-rejected@local.test')::text, true);
select set_config('fx.o_changes', test_helpers.create_owner('j3-changes@local.test')::text, true);
select set_config('fx.o_noreviewer', test_helpers.create_owner('j3-noreviewer@local.test')::text, true);
select set_config('fx.o_notime', test_helpers.create_owner('j3-notime@local.test')::text, true);
select set_config('fx.o_inactive', test_helpers.create_owner('j3-inactive@local.test')::text, true);
select set_config('fx.o_ok', test_helpers.create_owner('j3-ok@local.test')::text, true);
select set_config('fx.o_other', test_helpers.create_owner('j3-other@local.test')::text, true);

select set_config('fx.s_pending', test_helpers.create_shop(current_setting('fx.o_pending')::uuid, 'pending')::text, true);
select set_config('fx.s_rejected', test_helpers.create_shop(current_setting('fx.o_rejected')::uuid, 'rejected')::text, true);
select set_config('fx.s_changes', test_helpers.create_shop(current_setting('fx.o_changes')::uuid, 'changes_requested')::text, true);
select set_config('fx.s_noreviewer', test_helpers.create_shop(current_setting('fx.o_noreviewer')::uuid, 'approved')::text, true);
update public.shops set verification_reviewed_at = now() where id = current_setting('fx.s_noreviewer')::uuid;
select set_config('fx.s_notime', test_helpers.create_verified_shop(current_setting('fx.o_notime')::uuid, current_setting('fx.a1')::uuid)::text, true);
update public.shops set verification_reviewed_at = null where id = current_setting('fx.s_notime')::uuid;
select set_config('fx.s_inactive', test_helpers.create_verified_shop(current_setting('fx.o_inactive')::uuid, current_setting('fx.a1')::uuid)::text, true);
update public.shops set is_active = false where id = current_setting('fx.s_inactive')::uuid;
select set_config('fx.s_ok', test_helpers.create_verified_shop(current_setting('fx.o_ok')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_pause', test_helpers.create_verified_shop(current_setting('fx.o_ok')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_lose', test_helpers.create_verified_shop(current_setting('fx.o_ok')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_ident', test_helpers.create_verified_shop(current_setting('fx.o_ok')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s_rev', test_helpers.create_verified_shop(current_setting('fx.o_ok')::uuid, current_setting('fx.a2')::uuid)::text, true);
select set_config('fx.s_other', test_helpers.create_verified_shop(current_setting('fx.o_other')::uuid, current_setting('fx.a1')::uuid)::text, true);

select set_config('fx.j_pending', test_helpers.create_job_opening(current_setting('fx.s_pending')::uuid, 'J3 pending')::text, true);
select set_config('fx.j_rejected', test_helpers.create_job_opening(current_setting('fx.s_rejected')::uuid, 'J3 rejected')::text, true);
select set_config('fx.j_changes', test_helpers.create_job_opening(current_setting('fx.s_changes')::uuid, 'J3 changes')::text, true);
select set_config('fx.j_noreviewer', test_helpers.create_job_opening(current_setting('fx.s_noreviewer')::uuid, 'J3 no reviewer')::text, true);
select set_config('fx.j_notime', test_helpers.create_job_opening(current_setting('fx.s_notime')::uuid, 'J3 no time')::text, true);
select set_config('fx.j_inactive', test_helpers.create_job_opening(current_setting('fx.s_inactive')::uuid, 'J3 inactive')::text, true);
select set_config('fx.j_ok', test_helpers.create_job_opening(current_setting('fx.s_ok')::uuid, 'J3 ok')::text, true);
select set_config('fx.j_ok2', test_helpers.create_job_opening(current_setting('fx.s_ok')::uuid, 'J3 ok second')::text, true);
select set_config('fx.j_pause', test_helpers.create_job_opening(current_setting('fx.s_pause')::uuid, 'J3 pause')::text, true);
select set_config('fx.j_lose', test_helpers.create_job_opening(current_setting('fx.s_lose')::uuid, 'J3 lose')::text, true);
select set_config('fx.j_ident', test_helpers.create_job_opening(current_setting('fx.s_ident')::uuid, 'J3 identity')::text, true);
select set_config('fx.j_rev', test_helpers.create_job_opening(current_setting('fx.s_rev')::uuid, 'J3 reviewer')::text, true);
select set_config('fx.today', (now() at time zone 'Asia/Manila')::date::text, true);

-- ---------- unverified shops cannot publish ----------
select test_helpers.act_as_owner('j3-pending@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_pending')::uuid, 'draft', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_pending_shop_owner_cannot_publish');
select test_helpers.act_as_owner('j3-rejected@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_rejected')::uuid, 'draft', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_rejected_shop_owner_cannot_publish');
select test_helpers.act_as_owner('j3-changes@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_changes')::uuid, 'draft', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_changes_requested_shop_owner_cannot_publish');
select test_helpers.act_as_owner('j3-noreviewer@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_noreviewer')::uuid, 'draft', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_approved_without_recorded_review_cannot_publish');
select test_helpers.act_as_owner('j3-notime@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_notime')::uuid, 'draft', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_approved_without_review_time_cannot_publish');
select test_helpers.act_as_owner('j3-inactive@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_inactive')::uuid, 'draft', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_inactive_shop_cannot_publish');

-- ---------- the verified owner can ----------
select test_helpers.act_as_owner('j3-ok@local.test');
select ok(public.is_verified_shop_owner(current_setting('fx.s_ok')::uuid), 'j3_verified_owner_can_publish');
select is((select status from public.transition_job_opening(current_setting('fx.j_ok')::uuid, 'draft', 'published')),
          'published', 'j3_verified_owner_can_publish');
select test_helpers.act_as_worker('j3-w1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j_ok')::uuid), 1,
          'j3_verified_owner_can_publish');

-- ---------- resume needs verification again ----------
select test_helpers.act_as_owner('j3-ok@local.test');
select is((select status from public.transition_job_opening(current_setting('fx.j_pause')::uuid, 'draft', 'published')),
          'published', 'j3_unverified_owner_cannot_resume_paused_opening');
select is((select status from public.transition_job_opening(current_setting('fx.j_pause')::uuid, 'published', 'paused')),
          'paused', 'j3_unverified_owner_cannot_resume_paused_opening');
select test_helpers.act_as_admin('j3-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Local test: retake photo'
where id = current_setting('fx.s_pause')::uuid;
select test_helpers.act_as_owner('j3-ok@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_pause')::uuid, 'paused', 'published') $$,
                 '42501', 'Only a verified shop can publish job openings.', 'j3_unverified_owner_cannot_resume_paused_opening');
select is((select status from public.job_openings where id = current_setting('fx.j_pause')::uuid), 'paused',
          'j3_unverified_owner_cannot_resume_paused_opening');

-- ---------- other roles ----------
select test_helpers.act_as_customer('j3-c1@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published') $$,
                 '42501', 'Job opening not found.', 'j3_non_owner_roles_cannot_publish');
select test_helpers.act_as_worker('j3-w1@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published') $$,
                 '42501', 'Job opening not found.', 'j3_non_owner_roles_cannot_publish');
select test_helpers.act_as_admin('j3-a1@local.test');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published') $$,
                 '42501', 'Job opening not found.', 'j3_non_owner_roles_cannot_publish');
select test_helpers.act_as_anon();
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published') $$,
                 '42501', null, 'j3_non_owner_roles_cannot_publish');
select test_helpers.act_as_owner('j3-other@local.test');
select ok(public.is_verified_shop_owner(current_setting('fx.s_other')::uuid)
          and not public.is_verified_shop_owner(current_setting('fx.s_ok')::uuid), 'j3_non_owner_roles_cannot_publish');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published') $$,
                 '42501', 'Job opening not found.', 'j3_non_owner_roles_cannot_publish');

-- ---------- incomplete / past deadline ----------
select test_helpers.act_as_owner('j3-ok@local.test');
insert into public.job_openings (shop_id, title, description) values (current_setting('fx.s_ok')::uuid, 'J3 incomplete', '   ');
select is((select public.job_opening_missing_publish_fields(j) from public.job_openings j where title = 'J3 incomplete'),
          array['description', 'work_location', 'openings_count', 'job_type', 'applicant_requirement'],
          'j3_cannot_publish_incomplete_opening');
select throws_ok($$ select public.transition_job_opening((select id from public.job_openings where title = 'J3 incomplete'), 'draft', 'published') $$,
                 '23514', 'Complete the required job opening fields before publishing.', 'j3_cannot_publish_incomplete_opening');
update public.job_openings set application_deadline = current_setting('fx.today')::date - 1 where id = current_setting('fx.j_ok2')::uuid;
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published') $$,
                 '23514', 'The application deadline has passed.', 'j3_cannot_publish_with_past_deadline');
update public.job_openings set application_deadline = current_setting('fx.today')::date where id = current_setting('fx.j_ok2')::uuid;
select is((select status from public.transition_job_opening(current_setting('fx.j_ok2')::uuid, 'draft', 'published')),
          'published', 'j3_cannot_publish_with_past_deadline');

-- ---------- no bypass ----------
select test_helpers.act_as_owner('j3-pending@local.test');
select throws_ok($$ update public.job_openings set status = 'published' where id = current_setting('fx.j_pending')::uuid $$,
                 '42501', 'This job opening status change is not allowed.', 'j3_direct_status_update_cannot_bypass_verification');
select throws_ok($$ update public.job_openings set status = 'published', first_published_at = now(), status_changed_at = now()
                    where id = current_setting('fx.j_pending')::uuid $$,
                 '42501', null, 'j3_direct_status_update_cannot_bypass_verification');
select is((select status from public.job_openings where id = current_setting('fx.j_pending')::uuid), 'draft',
          'j3_direct_status_update_cannot_bypass_verification');
select throws_ok($$ insert into public.job_openings (shop_id, title, status) values (current_setting('fx.s_pending')::uuid, 'J3 forged', 'published') $$,
                 '42501', 'Job openings start as drafts.', 'j3_insert_as_published_rejected');
select test_helpers.act_as_owner('j3-ok@local.test');
select throws_ok($$ insert into public.job_openings (shop_id, title, status) values (current_setting('fx.s_ok')::uuid, 'J3 forged', 'published') $$,
                 '42501', 'Job openings start as drafts.', 'j3_insert_as_published_rejected');

-- ---------- losing verification hides published openings from workers ----------
select is((select status from public.transition_job_opening(current_setting('fx.j_lose')::uuid, 'draft', 'published')),
          'published', 'j3_published_opening_hidden_when_shop_loses_verification');
select test_helpers.act_as_admin('j3-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = current_setting('fx.s_lose')::uuid;
select test_helpers.act_as_worker('j3-w1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j_lose')::uuid), 0,
          'j3_published_opening_hidden_when_shop_loses_verification');
select test_helpers.act_as_owner('j3-ok@local.test');
select is((select status from public.job_openings where id = current_setting('fx.j_lose')::uuid), 'published',
          'j3_published_opening_hidden_when_shop_loses_verification');

select is((select status from public.transition_job_opening(current_setting('fx.j_ident')::uuid, 'draft', 'published')),
          'published', 'j3_shop_identity_edit_hides_published_opening_until_rereviewed');
update public.shops set name = 'J3 renamed shop' where id = current_setting('fx.s_ident')::uuid;
select is((select verification_status from public.shops where id = current_setting('fx.s_ident')::uuid), 'pending',
          'j3_shop_identity_edit_hides_published_opening_until_rereviewed');
select test_helpers.act_as_worker('j3-w1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j_ident')::uuid), 0,
          'j3_shop_identity_edit_hides_published_opening_until_rereviewed');
select test_helpers.act_as_admin('j3-a1@local.test');
update public.shops set verification_status = 'approved' where id = current_setting('fx.s_ident')::uuid;
select test_helpers.act_as_worker('j3-w1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j_ident')::uuid), 1,
          'j3_shop_identity_edit_hides_published_opening_until_rereviewed');

select test_helpers.act_as_owner('j3-ok@local.test');
select is((select status from public.transition_job_opening(current_setting('fx.j_rev')::uuid, 'draft', 'published')),
          'published', 'j3_reviewer_deletion_hides_published_opening');
select test_helpers.act_as_service();
delete from auth.users where id = current_setting('fx.a2')::uuid;
select is((select verification_reviewed_by from public.shops where id = current_setting('fx.s_rev')::uuid), null,
          'j3_reviewer_deletion_hides_published_opening');
select test_helpers.act_as_worker('j3-w1@local.test');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.j_rev')::uuid), 0,
          'j3_reviewer_deletion_hides_published_opening');
select test_helpers.act_as_service();
select is((select status from public.job_openings where id = current_setting('fx.j_rev')::uuid), 'published',
          'j3_reviewer_deletion_hides_published_opening');

-- ---------- rejected publishes leave no status event ----------
select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening' and action = 'job_opening.status_changed'
             and subject_id in (current_setting('fx.j_pending')::uuid, current_setting('fx.j_rejected')::uuid,
                                current_setting('fx.j_changes')::uuid, current_setting('fx.j_noreviewer')::uuid,
                                current_setting('fx.j_notime')::uuid, current_setting('fx.j_inactive')::uuid)),
          0, 'j3_rejected_publish_writes_no_status_event');
select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening' and action = 'job_opening.status_changed'
             and subject_id = current_setting('fx.j_pause')::uuid),
          2, 'j3_rejected_publish_writes_no_status_event');
select is((select count(*)::int from public.job_openings
           where id in (current_setting('fx.j_pending')::uuid, current_setting('fx.j_rejected')::uuid,
                        current_setting('fx.j_changes')::uuid, current_setting('fx.j_noreviewer')::uuid,
                        current_setting('fx.j_notime')::uuid, current_setting('fx.j_inactive')::uuid)
             and status = 'draft' and status_changed_at is null and first_published_at is null),
          6, 'j3_rejected_publish_writes_no_status_event');

select * from finish();
rollback;
