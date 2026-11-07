-- J2 (W4) lifecycle: draft -> published <-> paused -> closed -> archived only through
-- transition_job_opening(); closed/archived are read-only; audit rows carry no opening content;
-- W4 enqueues no notifications. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j2l-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j2l-o1@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.today', (now() at time zone 'Asia/Manila')::date::text, true);
select set_config('fx.jm', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Lifecycle main')::text, true);
select set_config('fx.jb', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Lifecycle paused close')::text, true);
select set_config('fx.jd', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Status draft')::text, true);
select set_config('fx.jp', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Status published')::text, true);
select set_config('fx.jq', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Status paused')::text, true);
select set_config('fx.jc', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Status closed')::text, true);
select set_config('fx.ja', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'Status archived')::text, true);
-- Trusted session (fixture): one opening in each status.
update public.job_openings set status = 'published', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.jp')::uuid;
update public.job_openings set status = 'paused', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.jq')::uuid;
update public.job_openings set status = 'closed', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.jc')::uuid;
update public.job_openings set status = 'archived', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.ja')::uuid;

-- ---------- the allowed path ----------
select test_helpers.act_as_owner('j2l-o1@local.test');
select is((select row(status, first_published_at is not null, status_changed_at is not null)::text
           from public.transition_job_opening(current_setting('fx.jm')::uuid, 'draft', 'published')),
          row('published'::text, true, true)::text, 'j2_owner_can_pause_resume_close_archive_own_opening');
select set_config('fx.first_published', (select first_published_at::text from public.job_openings where id = current_setting('fx.jm')::uuid), true);
select is((select status from public.transition_job_opening(current_setting('fx.jm')::uuid, 'published', 'paused')),
          'paused', 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select status from public.transition_job_opening(current_setting('fx.jm')::uuid, 'paused', 'published')),
          'published', 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select first_published_at::text from public.job_openings where id = current_setting('fx.jm')::uuid),
          current_setting('fx.first_published'), 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select status from public.transition_job_opening(current_setting('fx.jm')::uuid, 'published', 'closed')),
          'closed', 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select status from public.transition_job_opening(current_setting('fx.jm')::uuid, 'closed', 'archived')),
          'archived', 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select status from public.transition_job_opening(current_setting('fx.jb')::uuid, 'draft', 'published')),
          'published', 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select status from public.transition_job_opening(current_setting('fx.jb')::uuid, 'published', 'paused')),
          'paused', 'j2_owner_can_pause_resume_close_archive_own_opening');
select is((select status from public.transition_job_opening(current_setting('fx.jb')::uuid, 'paused', 'closed')),
          'closed', 'j2_owner_can_pause_resume_close_archive_own_opening');

-- ---------- every pair outside the matrix (19 of 25), plus unknown words ----------
select is((select count(*)::int
           from (values ('draft', current_setting('fx.jd')), ('published', current_setting('fx.jp')),
                        ('paused', current_setting('fx.jq')), ('closed', current_setting('fx.jc')),
                        ('archived', current_setting('fx.ja'))) as opening(status, id)
           cross join unnest(array['draft', 'published', 'paused', 'closed', 'archived']) as target(to_status)
           where opening.status || '>' || target.to_status <> all (array['draft>published', 'published>paused',
                   'paused>published', 'published>closed', 'paused>closed', 'closed>archived'])),
          19, 'j2_disallowed_transitions_rejected');
select is((select count(*)::int
           from (values ('draft', current_setting('fx.jd')), ('published', current_setting('fx.jp')),
                        ('paused', current_setting('fx.jq')), ('closed', current_setting('fx.jc')),
                        ('archived', current_setting('fx.ja'))) as opening(status, id)
           cross join unnest(array['draft', 'published', 'paused', 'closed', 'archived', 'deleted']) as target(to_status)
           where opening.status || '>' || target.to_status <> all (array['draft>published', 'published>paused',
                   'paused>published', 'published>closed', 'paused>closed', 'closed>archived'])
             and test_helpers.attempt(format('select public.transition_job_opening(%L, %L, %L)',
                                             opening.id, opening.status, target.to_status)) <> '42501'),
          0, 'j2_disallowed_transitions_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jc')::uuid, 'closed', 'published') $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_disallowed_transitions_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jp')::uuid, 'published', 'published') $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_disallowed_transitions_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jd')::uuid, 'draft', 'closed') $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_disallowed_transitions_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.ja')::uuid, 'archived', 'closed') $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_disallowed_transitions_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jd')::uuid, 'draft', null) $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_disallowed_transitions_rejected');
select is((select array_agg(status order by title) from public.job_openings
           where id in (current_setting('fx.jd')::uuid, current_setting('fx.jp')::uuid, current_setting('fx.jq')::uuid,
                        current_setting('fx.jc')::uuid, current_setting('fx.ja')::uuid)),
          array['archived', 'closed', 'draft', 'paused', 'published'], 'j2_disallowed_transitions_rejected');

-- ---------- stale expected status ----------
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jp')::uuid, 'draft', 'published') $$,
                 '55000', 'This job opening changed. Refresh and try again.', 'j2_stale_transition_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jp')::uuid, 'paused', 'published') $$,
                 '55000', 'This job opening changed. Refresh and try again.', 'j2_stale_transition_rejected');
select throws_ok($$ select public.transition_job_opening(current_setting('fx.jp')::uuid, null, 'paused') $$,
                 '55000', 'This job opening changed. Refresh and try again.', 'j2_stale_transition_rejected');

-- ---------- status only through the RPC ----------
select throws_ok($$ update public.job_openings set status = 'paused' where id = current_setting('fx.jp')::uuid $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_status_only_changes_through_transition_rpc');
select throws_ok($$ update public.job_openings set status = 'published' where id = current_setting('fx.jd')::uuid $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_status_only_changes_through_transition_rpc');
select throws_ok($$ update public.job_openings set status = 'draft' where id = current_setting('fx.jc')::uuid $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_status_only_changes_through_transition_rpc');
select is(test_helpers.attempt($$ select set_config('washlink.job_opening_transition', current_setting('fx.jd'), false) $$),
          'succeeded', 'j2_status_only_changes_through_transition_rpc');
select throws_ok($$ update public.job_openings set status = 'closed' where id = current_setting('fx.jp')::uuid $$,
                 '42501', 'This job opening status change is not allowed.', 'j2_status_only_changes_through_transition_rpc');
select set_config('washlink.job_opening_transition', '', false) is not null as flag_reset;
select is((select status from public.job_openings where id = current_setting('fx.jd')::uuid), 'draft',
          'j2_status_only_changes_through_transition_rpc');

-- ---------- closed and archived are read-only ----------
select throws_ok($$ update public.job_openings set title = 'Edited closed' where id = current_setting('fx.jc')::uuid $$,
                 '42501', 'Closed or archived job openings cannot be edited.', 'j2_closed_and_archived_openings_are_read_only');
select throws_ok($$ update public.job_openings set benefits = 'Edited archived' where id = current_setting('fx.ja')::uuid $$,
                 '42501', 'Closed or archived job openings cannot be edited.', 'j2_closed_and_archived_openings_are_read_only');
with deleted as (delete from public.job_openings where id in (current_setting('fx.jc')::uuid, current_setting('fx.ja')::uuid) returning 1)
select is(count(*)::int, 0, 'j2_closed_and_archived_openings_are_read_only') from deleted;
select is((select count(*)::int from public.job_openings
           where id in (current_setting('fx.jc')::uuid, current_setting('fx.ja')::uuid) and benefits is null and title like 'Status %'),
          2, 'j2_closed_and_archived_openings_are_read_only');

-- ---------- published / paused edits keep the required fields ----------
select throws_ok($$ update public.job_openings set description = null where id = current_setting('fx.jp')::uuid $$,
                 '23514', 'Complete the required job opening fields before publishing.', 'j2_published_edit_keeps_required_fields');
select throws_ok($$ update public.job_openings set work_location = '   ' where id = current_setting('fx.jp')::uuid $$,
                 '23514', 'Complete the required job opening fields before publishing.', 'j2_published_edit_keeps_required_fields');
select throws_ok($$ update public.job_openings set openings_count = null where id = current_setting('fx.jq')::uuid $$,
                 '23514', 'Complete the required job opening fields before publishing.', 'j2_published_edit_keeps_required_fields');
select lives_ok($$ update public.job_openings set benefits = 'Free lunch' where id = current_setting('fx.jp')::uuid $$,
                'j2_published_edit_keeps_required_fields');
select is((select row(status, benefits)::text from public.job_openings where id = current_setting('fx.jp')::uuid),
          row('published'::text, 'Free lunch'::text)::text, 'j2_published_edit_keeps_required_fields');

select throws_ok($$ update public.job_openings set application_deadline = current_setting('fx.today')::date - 1
                    where id = current_setting('fx.jp')::uuid $$,
                 '23514', 'The application deadline has passed.', 'j2_published_edit_cannot_set_past_deadline');
select throws_ok($$ update public.job_openings set application_deadline = current_setting('fx.today')::date - 1
                    where id = current_setting('fx.jq')::uuid $$,
                 '23514', 'The application deadline has passed.', 'j2_published_edit_cannot_set_past_deadline');
select lives_ok($$ update public.job_openings set application_deadline = current_setting('fx.today')::date
                   where id = current_setting('fx.jp')::uuid $$, 'j2_published_edit_cannot_set_past_deadline');
select lives_ok($$ update public.job_openings set application_deadline = current_setting('fx.today')::date - 1
                   where id = current_setting('fx.jd')::uuid $$, 'j2_published_edit_cannot_set_past_deadline');

-- ---------- audit: create, transition, update, delete ----------
select lives_ok($$
  insert into public.job_openings (shop_id, title, description, work_location, openings_count, job_type, applicant_requirement)
  values (current_setting('fx.s1')::uuid, 'Zebra audit title', 'Quokka description', 'Wombat street', 2, 'full_time', 'certification_required')
$$, 'j2_audit_written_on_create_transition_update_delete');
select set_config('fx.jx', (select id::text from public.job_openings where title = 'Zebra audit title'), true);
update public.job_openings set title = 'Zebra audit title two', benefits = 'Narwhal benefits draft'
where id = current_setting('fx.jx')::uuid;
select is((select status from public.transition_job_opening(current_setting('fx.jx')::uuid, 'draft', 'published')),
          'published', 'j2_audit_written_on_create_transition_update_delete');
update public.job_openings set benefits = 'Narwhal benefits', compensation_min_amount = 4321, compensation_currency = 'PHP',
       compensation_period = 'month' where id = current_setting('fx.jx')::uuid;
insert into public.job_openings (shop_id, title) values (current_setting('fx.s1')::uuid, 'Zebra draft to delete');
select set_config('fx.jy', (select id::text from public.job_openings where title = 'Zebra draft to delete'), true);
delete from public.job_openings where id = current_setting('fx.jy')::uuid;

select test_helpers.act_as_service();
select is((select array_agg(row(action, payload::text, actor_id = current_setting('fx.o1')::uuid, subject_profile_id::text)::text order by id)
           from public.workforce_audit_events where subject_type = 'job_opening' and subject_id = current_setting('fx.jx')::uuid),
          array[
            row('job_opening.created', jsonb_build_object('shop_id', current_setting('fx.s1'), 'status', 'draft')::text, true, current_setting('fx.o1'))::text,
            row('job_opening.status_changed', jsonb_build_object('shop_id', current_setting('fx.s1'), 'from_status', 'draft',
                'to_status', 'published')::text, true, current_setting('fx.o1'))::text,
            row('job_opening.updated', jsonb_build_object('shop_id', current_setting('fx.s1'), 'status', 'published',
                'changed_fields', jsonb_build_array('benefits', 'compensation_currency', 'compensation_min_amount',
                'compensation_period'))::text, true, current_setting('fx.o1'))::text],
          'j2_audit_written_on_create_transition_update_delete');
select is((select array_agg(row(action, payload::text)::text order by id)
           from public.workforce_audit_events where subject_type = 'job_opening' and subject_id = current_setting('fx.jy')::uuid),
          array[
            row('job_opening.created', jsonb_build_object('shop_id', current_setting('fx.s1'), 'status', 'draft')::text)::text,
            row('job_opening.deleted', jsonb_build_object('shop_id', current_setting('fx.s1'), 'from_status', 'draft',
                'deleted_by', 'owner')::text)::text],
          'j2_audit_written_on_create_transition_update_delete');

select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening' and action = 'job_opening.updated'
             and subject_id in (current_setting('fx.jd')::uuid, current_setting('fx.jy')::uuid)),
          0, 'j2_draft_edits_write_no_audit_event');
select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening' and subject_id = current_setting('fx.jx')::uuid
             and action = 'job_opening.updated'),
          1, 'j2_draft_edits_write_no_audit_event');

-- The amount marker is digits only, so a random UUID in the payload (shop_id) can contain it by
-- chance: UUIDs are removed before that one search. The word markers cannot occur in a UUID.
select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening'
             and (payload::text ilike '%zebra%' or payload::text ilike '%quokka%' or payload::text ilike '%wombat%'
                  or payload::text ilike '%narwhal%'
                  or regexp_replace(payload::text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'g') like '%4321%'
                  or payload::text ilike '%lunch%' or payload::text ilike '%lifecycle%')),
          0, 'j2_audit_payload_has_no_opening_content');
select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening' and subject_id = current_setting('fx.jx')::uuid),
          3, 'j2_audit_payload_has_no_opening_content');

select is((select count(*)::int from public.notifications
           where recipient_id in (current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)
              or subject_type = 'job_opening' or category like 'job_opening%'),
          0, 'w4_job_opening_actions_enqueue_no_notifications');

select * from finish();
rollback;
