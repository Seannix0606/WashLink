-- J5 (W5): every application action writes one audit event (ids and status words only) and the
-- right party gets one in-app notification per event, without cover notes, opening content, pay,
-- names or contact data (P23). Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j5n-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j5n-o1@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j5n-w' || n || '@local.test'))) from generate_series(1, 5) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j5n-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
update public.shops set name = 'J5N Sparkle Wash' where id = current_setting('fx.s1')::uuid;
update public.shops set verification_status = 'approved', verification_reviewed_by = current_setting('fx.a1')::uuid,
  verification_reviewed_at = now() where id = current_setting('fx.s1')::uuid;
select set_config('fx.jn', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J5N Wash attendant'))::text, true);
update public.job_openings set other_terms = 'Secret terms seven', compensation_min_amount = 650, compensation_currency = 'PHP',
  compensation_period = 'day' where id = current_setting('fx.jn')::uuid;
select set_config('fx.ju', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Call 0917 555 1234 now'))::text, true);
select set_config('fx.jr', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'J5N Removed opening'))::text, true);
create function pg_temp.audits(p_app uuid) returns text[] language sql stable security definer
as $$ select coalesce(array_agg(action || coalesce(':' || (payload ->> 'changed_by'), '') || coalesce(':' || (payload ->> 'deleted_by'), '')
                                order by id), '{}')
      from public.workforce_audit_events where subject_type = 'job_application' and subject_id = p_app $$;
create function pg_temp.notes(p_recipient uuid) returns text[] language sql stable security definer
as $$ select coalesce(array_agg(category || '|' || title || '|' || body order by split_part(idempotency_key, ':', 3)::bigint, id), '{}')
      from public.notifications where recipient_id = p_recipient and category like 'job_%' $$;
select set_config('fx.events_before', (select count(*) from public.workforce_audit_events)::text, true);

-- ---------- draft, submit, owner decisions, withdraw ----------
select test_helpers.act_as(pg_temp.w(1));
select set_config('fx.app1', (select id from public.create_job_application(current_setting('fx.jn')::uuid, 'My cover note text', false))::text, true);
select lives_ok($$ select public.update_job_application_draft(current_setting('fx.app1')::uuid, 'My cover note text, edited',
                   (select updated_at from public.job_applications where id = current_setting('fx.app1')::uuid)) $$,
                'j5_draft_actions_write_no_notification');
select is(pg_temp.audits(current_setting('fx.app1')::uuid), array['job_application.created:worker'], 'j5_draft_actions_write_no_notification');
select is(pg_temp.notes(current_setting('fx.o1')::uuid), '{}'::text[], 'j5_draft_actions_write_no_notification');
select is((select status from public.transition_job_application(current_setting('fx.app1')::uuid, 'draft', 'submitted', 'w5_v1')),
          'submitted', 'j5_owner_notified_on_submit_and_withdraw');
select is(pg_temp.notes(current_setting('fx.o1')::uuid),
          array['job_application.submitted|New job application|J5N Wash attendant has a new application.'],
          'j5_owner_notified_on_submit_and_withdraw');

select test_helpers.act_as_owner('j5n-o1@local.test');
select is((select count(public.transition_job_application(current_setting('fx.app1')::uuid, f, t))::int
           from (values (1, 'submitted', 'under_review'), (2, 'under_review', 'shortlisted'), (3, 'shortlisted', 'accepted')) v(n, f, t)),
          3, 'j5_worker_notified_on_owner_decision_and_closure');
select is(pg_temp.notes(pg_temp.w(1)),
          array['job_application.status_changed|Application update|J5N Sparkle Wash: your application for J5N Wash attendant is now Under review.',
                'job_application.status_changed|Application update|J5N Sparkle Wash: your application for J5N Wash attendant is now Shortlisted.',
                'job_application.status_changed|Application update|J5N Sparkle Wash: your application for J5N Wash attendant is now Accepted. This is not a contract.'],
          'j5_worker_notified_on_owner_decision_and_closure');

-- an invalid transition writes nothing
select test_helpers.act_as_service();
select set_config('fx.n_before', (select count(*) from public.notifications)::text, true);
select set_config('fx.e_before', (select count(*) from public.workforce_audit_events)::text, true);
select test_helpers.act_as_owner('j5n-o1@local.test');
select is(test_helpers.attempt($$ select public.transition_job_application(current_setting('fx.app1')::uuid, 'accepted', 'withdrawn') $$),
          '42501', 'j5_rejected_transition_writes_no_audit_or_notification');
select test_helpers.act_as(pg_temp.w(1));
select is(test_helpers.attempt($$ select public.transition_job_application(current_setting('fx.app1')::uuid, 'accepted', 'rejected') $$),
          '42501', 'j5_rejected_transition_writes_no_audit_or_notification');
select is(test_helpers.attempt($$ select public.transition_job_application(current_setting('fx.app1')::uuid, 'shortlisted', 'withdrawn') $$),
          '55000', 'j5_rejected_transition_writes_no_audit_or_notification');
select test_helpers.act_as_service();
select is((select count(*)::text from public.notifications) || '/' || (select count(*)::text from public.workforce_audit_events),
          current_setting('fx.n_before') || '/' || current_setting('fx.e_before'), 'j5_rejected_transition_writes_no_audit_or_notification');

select test_helpers.act_as(pg_temp.w(1));
select is((select status from public.transition_job_application(current_setting('fx.app1')::uuid, 'accepted', 'withdrawn')), 'withdrawn',
          'j5_owner_notified_on_submit_and_withdraw');
select is((pg_temp.notes(current_setting('fx.o1')::uuid))[2], 'job_application.withdrawn|Application withdrawn|An applicant withdrew from J5N Wash attendant.',
          'j5_owner_notified_on_submit_and_withdraw');

select test_helpers.act_as(pg_temp.w(2));
select set_config('fx.app2', (select id from public.create_job_application(current_setting('fx.jn')::uuid, 'Second cover note text', true, 'w5_v1'))::text, true);
select test_helpers.act_as_owner('j5n-o1@local.test');
select is((select status from public.transition_job_application(current_setting('fx.app2')::uuid, 'submitted', 'rejected')), 'rejected',
          'j5_worker_notified_on_owner_decision_and_closure');
select is(pg_temp.notes(pg_temp.w(2)),
          array['job_application.status_changed|Application update|J5N Sparkle Wash: your application for J5N Wash attendant is now Not selected.'],
          'j5_worker_notified_on_owner_decision_and_closure');

-- ---------- pause and close ----------
select test_helpers.act_as(pg_temp.w(3));
select set_config('fx.app3', (select id from public.create_job_application(current_setting('fx.jn')::uuid, null, true, 'w5_v1'))::text, true);
select test_helpers.act_as(pg_temp.w(4));
select set_config('fx.app4', (select id from public.create_job_application(current_setting('fx.jn')::uuid, 'Draft only', false))::text, true);
select test_helpers.act_as_owner('j5n-o1@local.test');
select is((select status from public.transition_job_opening(current_setting('fx.jn')::uuid, 'published', 'paused')), 'paused',
          'j5_worker_notified_once_when_opening_paused');
select test_helpers.act_as_service();
select is(pg_temp.notes(pg_temp.w(3)), array['job_opening.paused|Opening paused|J5N Wash attendant at J5N Sparkle Wash is paused. Your application stays open.'],
          'j5_worker_notified_once_when_opening_paused');
select is((select count(*)::int from public.notifications where category = 'job_opening.paused'), 1, 'j5_worker_notified_once_when_opening_paused');
select is((select idempotency_key from public.notifications where category = 'job_opening.paused'),
          (select format('job_opening:%s:%s', subject_id, id) from public.workforce_audit_events
           where subject_id = current_setting('fx.jn')::uuid and action = 'job_opening.status_changed' order by id desc limit 1),
          'j5_worker_notified_once_when_opening_paused');
select test_helpers.act_as_owner('j5n-o1@local.test');
select is((select status from public.transition_job_opening(current_setting('fx.jn')::uuid, 'paused', 'closed')), 'closed',
          'j5_worker_notified_on_owner_decision_and_closure');
select test_helpers.act_as_service();
select is((pg_temp.notes(pg_temp.w(3)))[2], 'job_application.closed|Application closed|J5N Wash attendant at J5N Sparkle Wash has closed, so your application was closed.',
          'j5_worker_notified_on_owner_decision_and_closure');
select is(pg_temp.notes(pg_temp.w(4)), '{}'::text[], 'j5_draft_actions_write_no_notification');
select is(pg_temp.audits(current_setting('fx.app4')::uuid), array['job_application.created:worker', 'job_application.status_changed:opening_closed'],
          'j5_audit_written_for_create_submit_transition_withdraw_close_delete');

-- ---------- unsafe label, cascades, draft delete ----------
select test_helpers.act_as(pg_temp.w(4));
select set_config('fx.app4u', (select id from public.create_job_application(current_setting('fx.ju')::uuid, null, true, 'w5_v1'))::text, true);
select set_config('fx.app4d', (select id from public.create_job_application(current_setting('fx.jr')::uuid, null, false))::text, true);
select lives_ok($$ select public.delete_job_application_draft(current_setting('fx.app4d')::uuid) $$, 'j5_draft_actions_write_no_notification');
select test_helpers.act_as_service();
select is((pg_temp.notes(current_setting('fx.o1')::uuid))[5], 'job_application.submitted|New job application|A job opening has a new application.',
          'j5_unsafe_opening_title_uses_generic_label');
select test_helpers.act_as(pg_temp.w(5));
select set_config('fx.app5', (select id from public.create_job_application(current_setting('fx.jr')::uuid, null, true, 'w5_v1'))::text, true);
select test_helpers.act_as(pg_temp.w(4));
delete from public.worker_profiles where profile_id = auth.uid();
select test_helpers.act_as_owner('j5n-o1@local.test');
delete from public.shops where id = current_setting('fx.s2')::uuid;
select test_helpers.act_as_service();
select is(pg_temp.audits(current_setting('fx.app4u')::uuid),
          array['job_application.submitted:worker', 'job_application.deleted:worker_profile_deleted'],
          'j5_cascade_deletions_audited_and_notify_surviving_party');
select is(pg_temp.audits(current_setting('fx.app5')::uuid),
          array['job_application.submitted:worker', 'job_application.deleted:opening_removed'],
          'j5_cascade_deletions_audited_and_notify_surviving_party');
select is(pg_temp.audits(current_setting('fx.app4d')::uuid), array['job_application.created:worker', 'job_application.deleted:worker'],
          'j5_audit_written_for_create_submit_transition_withdraw_close_delete');
select is((pg_temp.notes(current_setting('fx.o1')::uuid))[7],
          'job_application.removed|Application removed|An application was removed because the applicant deleted their profile.',
          'j5_cascade_deletions_audited_and_notify_surviving_party');
select is(pg_temp.notes(pg_temp.w(5)),
          array['job_application.removed|Application ended|An application ended because the shop or its job opening was removed.'],
          'j5_cascade_deletions_audited_and_notify_surviving_party');
select is(pg_temp.audits(current_setting('fx.app1')::uuid),
          array['job_application.created:worker', 'job_application.submitted:worker', 'job_application.status_changed:owner',
                'job_application.status_changed:owner', 'job_application.status_changed:owner', 'job_application.status_changed:worker'],
          'j5_audit_written_for_create_submit_transition_withdraw_close_delete');

-- ---------- payload and text rules, idempotency ----------
select is((select count(*)::int from public.workforce_audit_events
           where id > current_setting('fx.events_before')::bigint and subject_type = 'job_application'
             and (payload::text ilike '%cover%' or payload::text ilike '%note%' or payload::text like '%Secret%'
                  or payload::text like '%650%' or payload::text like '%J5N%' or payload::text like '%Local Test%'
                  or exists (select 1 from jsonb_object_keys(payload) k
                             where k not in ('job_opening_id', 'shop_id', 'status', 'from_status', 'to_status', 'changed_by', 'deleted_by')))),
          0, 'j5_audit_payload_has_no_cover_note_or_opening_content');
select is((select count(*)::int from public.workforce_audit_events
           where id > current_setting('fx.events_before')::bigint and subject_type = 'job_application'), 19,
          'j5_audit_payload_has_no_cover_note_or_opening_content');
select is((select count(*)::int from public.notifications where category like 'job_%'
           and (title || ' ' || body ilike '%cover note%' or title || ' ' || body like '%Secret%' or title || ' ' || body like '%650%'
                or title || ' ' || body like '%PHP%' or title || ' ' || body like '%Local Test Worker%' or title || ' ' || body like '%@%'
                or title || ' ' || body like '%0917%')),
          0, 'j5_notification_text_has_no_cover_note_pay_name_or_contact');
select is((select count(*)::int from (select recipient_id, idempotency_key from public.notifications where category like 'job_%'
           group by 1, 2 having count(*) > 1) d), 0, 'j5_notifications_idempotent_one_per_event');
select is((select count(*)::int from public.notifications n where n.category like 'job_application.%'
           and not exists (select 1 from public.workforce_audit_events e
                           where n.idempotency_key = format('job_application:%s:%s', e.subject_id, e.id))), 0,
          'j5_notifications_idempotent_one_per_event');
select is((select public.enqueue_notification(n.recipient_id, n.category, 'Repeat', 'Repeat body', n.idempotency_key) = n.id
           from public.notifications n where n.category = 'job_application.withdrawn'), true,
          'j5_notifications_idempotent_one_per_event');
select is((select count(*)::int from public.notifications where category like 'job_%'), 14, 'j5_notifications_idempotent_one_per_event');

select * from finish();
rollback;
