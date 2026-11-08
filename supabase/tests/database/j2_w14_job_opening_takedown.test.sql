-- J2 / J3 (W14): WashLink takedown of a reported job opening (W14 PLAN 3.3, 3.4, 4; P72, P74, P75; D-51, D-52). A
-- super_admin pauses (with a hold) or closes with a reason kind and an owner message; the owner edits and asks WashLink to
-- check; WashLink keeps the pause, lifts it or closes; the owner may close at any time. Opening content and application
-- snapshots are never edited; the W4 guard body is unchanged and the trigger order is pinned. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

create temporary table j2t_ids (label text primary key, id uuid) on commit drop;
grant all on j2t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j2t_ids where label = p_label $$;
insert into j2t_ids values ('a1', test_helpers.create_super_admin('j2t-a1@local.test'));
insert into j2t_ids values ('o1', test_helpers.create_owner('j2t-o1@local.test'));
insert into j2t_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j2t-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into j2t_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j2t_ids select 'j' || x, test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test opening ' || x))
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) x;
insert into j2t_ids values ('pa', test_helpers.create_job_application(pg_temp.id('ja'), pg_temp.id('w2')));
insert into j2t_ids values ('pb2', test_helpers.create_job_application(pg_temp.id('jb'), pg_temp.id('w2')));
insert into j2t_ids values ('pb3', test_helpers.create_job_application(pg_temp.id('jb'), pg_temp.id('w3'), 'shortlisted'));
insert into j2t_ids values ('pc', test_helpers.create_job_application(pg_temp.id('jc'), pg_temp.id('w2')));
insert into j2t_ids select 'r' || x, test_helpers.report_test_job_opening(pg_temp.id('j' || x), 'j2t-w1@local.test') from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) x;
insert into j2t_ids select 'c' || x, (select case_id from public.job_opening_reports where id = pg_temp.id('r' || x)) from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) x;
create temporary table j2t_before on commit drop as
  select j.id, (to_jsonb(j) - 'status' - 'status_changed_at' - 'updated_at')::text as content from public.job_openings j
  where j.id in (select id from j2t_ids where label like 'j_');
create temporary table j2t_snapshots on commit drop as select a.id, a.opening_snapshot::text as snap from public.job_applications a
  where a.job_opening_id in (select id from j2t_ids where label like 'j_');
grant all on j2t_before, j2t_snapshots to public;
-- The revision as the caller sees it: super_admin through the admin queue (no raw select, P78); 1 for everyone else.
create function pg_temp.rev(p_case uuid) returns integer language sql stable as $$
  select coalesce((select q.revision from unnest(array['active', 'dismissed', 'lifted', 'closed_by_washlink', 'resolved_owner_closed']) st
                   cross join lateral public.admin_job_opening_moderation_queue(st) q where q.case_id = p_case limit 1),
                  (select c.revision from public.job_opening_moderation_cases c where c.id = p_case), 1) $$;
create function pg_temp.moderate(p_case text, p_action text, p_reason text, p_message text, p_note text default null) returns text language sql as $$
  select test_helpers.attempt(format('select public.moderate_job_opening(%L, %s, %L, %L, %L, %L)', pg_temp.id(p_case), pg_temp.rev(pg_temp.id(p_case)),
                                     p_action, p_reason, p_message, p_note)) $$;
create function pg_temp.state(p_case text) returns text language sql stable as $$
  select c.status || ',' || coalesce(j.status, '-') from public.job_opening_moderation_cases c left join public.job_openings j on j.id = c.job_opening_id
  where c.id = pg_temp.id(p_case) $$;

-- ---------- pause ----------
select test_helpers.act_as_admin('j2t-a1@local.test');
select is((select status || ',' || revision from public.moderate_job_opening(pg_temp.id('ca'), 1, 'pause', 'age_requirement',
           'Your posting sets an age limit. Remove it and ask us to check.', 'The posting asks for applicants aged 18 to 25 only.')),
          'paused_by_washlink,2', 'w14_super_admin_pauses_published_opening_with_reason');
select test_helpers.act_as_service();
select is(pg_temp.state('ca'), 'paused_by_washlink,paused', 'w14_super_admin_pauses_published_opening_with_reason');
select is((select reason_kind || ',' || decided_by::text from public.job_opening_moderation_cases where id = pg_temp.id('ca')),
          'age_requirement,' || pg_temp.id('a1'), 'w14_super_admin_pauses_published_opening_with_reason');
select is((select status || ',' || outcome from public.job_opening_reports where id = pg_temp.id('ra')), 'closed,opening_paused',
          'w14_super_admin_pauses_published_opening_with_reason');
select test_helpers.act_as_owner('j2t-o1@local.test');
select is((select status || ',' || reason_kind || ',' || owner_message || ',' || can_submit_changes::text || ',' || (history -> 0 ->> 'action')
           from public.owner_job_opening_moderation() where case_id = pg_temp.id('ca')),
          'paused_by_washlink,age_requirement,Your posting sets an age limit. Remove it and ask us to check.,false,paused',
          'w14_super_admin_pauses_published_opening_with_reason');

-- ---------- hold ----------
select throws_ok(format('select public.transition_job_opening(%L, %L, %L)', pg_temp.id('ja'), 'paused', 'published'), '23514',
                 'WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.', 'w14_pause_holds_owner_republish_23514');
select is((select status from public.job_openings where id = pg_temp.id('ja')), 'paused', 'w14_pause_holds_owner_republish_23514');

-- ---------- submit changes ----------
select throws_ok(format('select public.submit_job_opening_changes(%L, %L)', pg_temp.id('ca'), 'Removed the age limit'), '23514',
                 'Edit the job opening before asking WashLink to check it.', 'w14_submit_refused_without_edit');
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('ca')) is not null as backdated;
select test_helpers.act_as_owner('j2t-o1@local.test');
select throws_ok(format('select public.submit_job_opening_changes(%L, %L)', pg_temp.id('ca'), 'Removed the age limit'), '23514',
                 'Edit the job opening before asking WashLink to check it.', 'w14_submit_refused_without_edit');
update public.job_openings set description = 'Open to every adult applicant' where id = pg_temp.id('ja');
select throws_ok(format('select public.submit_job_opening_changes(%L, %L)', pg_temp.id('ca'), repeat('n', 501)), '23514',
                 'Write at most 500 characters.', 'w14_owner_edits_and_submits_changes');
select is((select status || ',' || revision from public.submit_job_opening_changes(pg_temp.id('ca'), 'Removed the age limit')),
          'changes_submitted,3', 'w14_owner_edits_and_submits_changes');
select is((select owner_change_note || ',' || (history -> 1 ->> 'action') from public.owner_job_opening_moderation() where case_id = pg_temp.id('ca')),
          'Removed the age limit,changes_submitted', 'w14_owner_edits_and_submits_changes');
select throws_ok(format('select public.transition_job_opening(%L, %L, %L)', pg_temp.id('ja'), 'paused', 'published'), '23514', null,
                 'w14_owner_edits_and_submits_changes');

-- ---------- keep the pause with a new reason ----------
select test_helpers.act_as_service();
insert into j2t_ids values ('ra2', test_helpers.report_test_job_opening(pg_temp.id('ja'), 'j2t-w2@local.test', 'misleading_terms',
                                                                        'The applied posting still looks misleading to me'));
select test_helpers.act_as_admin('j2t-a1@local.test');
select is(pg_temp.moderate('ca', 'keep_paused', 'misleading_terms', 'The pay shown is still unclear. Show the daily rate.'), 'succeeded',
          'w14_pause_kept_with_new_reason');
select test_helpers.act_as_service();
select is((select status || ',' || reason_kind || ',' || owner_message from public.job_opening_moderation_cases where id = pg_temp.id('ca')),
          'paused_by_washlink,misleading_terms,The pay shown is still unclear. Show the daily rate.', 'w14_pause_kept_with_new_reason');
select is((select string_agg(action, ',' order by created_at, id) from public.job_opening_moderation_actions where case_id = pg_temp.id('ca')),
          'paused,changes_submitted,pause_kept', 'w14_pause_kept_with_new_reason');
select is((select outcome from public.job_opening_reports where id = pg_temp.id('ra2')), 'opening_paused', 'w14_pause_kept_with_new_reason');

-- ---------- lift, then the owner resumes through W4 (verification re-checked) ----------
select test_helpers.backdate_test_moderation_case(pg_temp.id('ca')) is not null as backdated;
select test_helpers.act_as_owner('j2t-o1@local.test');
update public.job_openings set compensation_details = 'Daily rate shown at the interview' where id = pg_temp.id('ja');
select lives_ok(format('select public.submit_job_opening_changes(%L)', pg_temp.id('ca')), 'w14_super_admin_lifts_then_owner_resumes_with_verification_check');
select test_helpers.act_as_admin('j2t-a1@local.test');
select is(pg_temp.moderate('ca', 'lift', null, null), 'succeeded', 'w14_super_admin_lifts_then_owner_resumes_with_verification_check');
select test_helpers.act_as_service();
select is(pg_temp.state('ca'), 'lifted,paused', 'w14_super_admin_lifts_then_owner_resumes_with_verification_check');
update public.shops set is_active = false where id = pg_temp.id('s1');
select test_helpers.act_as_owner('j2t-o1@local.test');
select throws_ok(format('select public.transition_job_opening(%L, %L, %L)', pg_temp.id('ja'), 'paused', 'published'), '42501',
                 'Only a verified shop can publish job openings.', 'w14_super_admin_lifts_then_owner_resumes_with_verification_check');
select test_helpers.act_as_service();
update public.shops set is_active = true where id = pg_temp.id('s1');
select test_helpers.act_as_owner('j2t-o1@local.test');
select is((public.transition_job_opening(pg_temp.id('ja'), 'paused', 'published')).status, 'published',
          'w14_super_admin_lifts_then_owner_resumes_with_verification_check');

-- ---------- close: W5 auto-close, snapshots and content unchanged ----------
select test_helpers.act_as_admin('j2t-a1@local.test');
select is(pg_temp.moderate('cb', 'close', 'worker_fee_or_deposit', 'Workers may not be asked to pay a deposit to apply here.'), 'succeeded',
          'w14_super_admin_closes_opening_and_w5_auto_closes_applications');
select test_helpers.act_as_service();
select is(pg_temp.state('cb'), 'closed_by_washlink,closed', 'w14_super_admin_closes_opening_and_w5_auto_closes_applications');
select is((select string_agg(status, ',' order by id) from public.job_applications where job_opening_id = pg_temp.id('jb')), 'closed,closed',
          'w14_super_admin_closes_opening_and_w5_auto_closes_applications');
select is((select outcome from public.job_opening_reports where id = pg_temp.id('rb')), 'opening_closed',
          'w14_super_admin_closes_opening_and_w5_auto_closes_applications');
select is((select count(*)::int from j2t_snapshots s join public.job_applications a on a.id = s.id where a.opening_snapshot::text = s.snap), 4,
          'w14_application_snapshots_unchanged_after_takedown');
select is((select count(*)::int from j2t_before b join public.job_openings j on j.id = b.id
           where (to_jsonb(j) - 'status' - 'status_changed_at' - 'updated_at')::text = b.content and j.id <> pg_temp.id('ja')), 5,
          'w14_opening_content_unchanged_after_takedown');
select is((select count(*)::int from public.workforce_audit_events where action = 'job_opening.updated' and subject_id = pg_temp.id('jb')), 0,
          'w14_opening_content_unchanged_after_takedown');

-- ---------- owner close resolves the case ----------
select test_helpers.act_as_admin('j2t-a1@local.test');
select is(pg_temp.moderate('cc', 'pause', 'other', 'Please describe the duties of this opening in more detail.'), 'succeeded',
          'w14_owner_close_resolves_case');
select test_helpers.act_as_service();
insert into j2t_ids values ('rc2', test_helpers.report_test_job_opening(pg_temp.id('jc'), 'j2t-w2@local.test', 'other',
                                                                        'This paused posting still has unclear duties'));
select test_helpers.act_as_owner('j2t-o1@local.test');
select is((public.transition_job_opening(pg_temp.id('jc'), 'paused', 'closed')).status, 'closed', 'w14_owner_close_resolves_case');
select test_helpers.act_as_service();
select is(pg_temp.state('cc') || ';' || (select string_agg(action, ',' order by created_at, id) from public.job_opening_moderation_actions where case_id = pg_temp.id('cc'))
          || ';' || (select outcome from public.job_opening_reports where id = pg_temp.id('rc2')),
          'resolved_owner_closed,closed;paused,owner_closed;opening_closed', 'w14_owner_close_resolves_case');

-- ---------- dismiss, stale revision, unavailable action ----------
select test_helpers.act_as_admin('j2t-a1@local.test');
select is(array[pg_temp.moderate('cd', 'dismiss', null, null), pg_temp.moderate('cd', 'dismiss', null, null, 'too short')], array['23514', '23514'],
          'w14_dismiss_needs_admin_note');
select throws_ok(format('select public.moderate_job_opening(%L, 1, %L, null, null, null)', pg_temp.id('cd'), 'dismiss'), '23514',
                 'Write an internal note of 20 to 1000 characters.', 'w14_dismiss_needs_admin_note');
select is(pg_temp.moderate('cd', 'dismiss', null, null, 'The posting follows the rules after a full read.'), 'succeeded', 'w14_dismiss_needs_admin_note');
select test_helpers.act_as_service();
select is(pg_temp.state('cd') || ',' || (select outcome from public.job_opening_reports where id = pg_temp.id('rd')), 'dismissed,published,no_action',
          'w14_dismiss_needs_admin_note');
select test_helpers.act_as_owner('j2t-o1@local.test');
select is((select count(*)::int from public.owner_job_opening_moderation() where case_id in (pg_temp.id('cd'), pg_temp.id('ce'))), 0,
          'w14_dismiss_needs_admin_note');
select test_helpers.act_as_admin('j2t-a1@local.test');
select throws_ok(format('select public.moderate_job_opening(%L, 7, %L, %L, %L, null)', pg_temp.id('ce'), 'pause', 'other', 'A message that is long enough here'),
                 '55000', 'This case changed. Refresh and try again.', 'w14_moderate_stale_revision_55000');
select throws_ok(format('select public.moderate_job_opening(%L, %s, %L, %L, %L, null)', pg_temp.id('ce'), pg_temp.rev(pg_temp.id('ce')), 'lift', 'other',
                        'A message that is long enough here'), '23514', 'This action is not available for this case.', 'w14_action_not_available_23514');
select is(array[pg_temp.moderate('ca', 'pause', 'other', 'A message that is long enough here'), pg_temp.moderate('ce', 'archive', 'other', 'A message that is long enough here'),
                pg_temp.moderate('ce', 'pause', 'not_a_reason', 'A message that is long enough here'), pg_temp.moderate('ce', 'pause', 'other', 'short')],
          array['23514', '22023', '22023', '23514'], 'w14_action_not_available_23514');

-- ---------- removed opening: only dismiss ----------
select test_helpers.act_as_service();
delete from public.job_openings where id = pg_temp.id('je');
select test_helpers.act_as_admin('j2t-a1@local.test');
select throws_ok(format('select public.moderate_job_opening(%L, %s, %L, %L, %L, null)', pg_temp.id('ce'), pg_temp.rev(pg_temp.id('ce')), 'pause', 'other',
                        'A message that is long enough here'), '23514', 'This job opening no longer exists.', 'w14_removed_opening_only_dismiss');
select is(pg_temp.moderate('ce', 'dismiss', null, null, 'The posting was removed by its owner already.'), 'succeeded', 'w14_removed_opening_only_dismiss');

-- ---------- authorization ----------
select test_helpers.act_as_owner('j2t-o1@local.test');
select throws_ok(format('select public.moderate_job_opening(%L, %s, %L, %L, %L, null)', pg_temp.id('cf'), 1, 'close', 'other',
                        'A message that is long enough here'), '42501', 'Only a platform administrator can moderate job openings.', 'w14_non_admin_cannot_moderate');
select test_helpers.act_as_worker('j2t-w1@local.test');
select is(pg_temp.moderate('cf', 'close', 'other', 'A message that is long enough here'), '42501', 'w14_non_admin_cannot_moderate');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('a1'), 'role', 'authenticated')::text, true);
select set_config('washlink.job_opening_moderation', pg_temp.id('jf')::text, true);
select is(array[test_helpers.attempt(format($$ update public.job_openings set status = 'closed' where id = %L $$, pg_temp.id('jf'))),
                (select set_config('washlink.job_opening_moderation_case', pg_temp.id('cf')::text, true) is not null)::text,
                test_helpers.attempt(format($$ update public.job_openings set status = 'closed', title = 'Edited by an admin' where id = %L $$, pg_temp.id('jf'))),
                test_helpers.attempt(format($$ delete from public.job_openings where id = %L $$, pg_temp.id('jf')))],
          array['42501', 'true', '42501', '42501'], 'w14_moderation_flag_without_case_refused_42501');
select set_config('washlink.job_opening_moderation', '', true);
select set_config('washlink.job_opening_moderation_case', '', true);
select test_helpers.act_as_service();
select is(pg_temp.state('cf'), 'open,published', 'w14_moderation_flag_without_case_refused_42501');

-- ---------- W4 body and trigger order pinned ----------
select is((select md5(prosrc) || ',' || md5(pg_get_functiondef(oid)) from pg_proc where oid = 'public.job_openings_guard_write()'::regprocedure),
          'c02f116816ef3ccbb87d2b3a7579c316,c27f3310d727483c36deee39382374e5', 'w14_w4_guard_body_unchanged_and_trigger_order');
select is((select array_agg(tgname::text || ':' || tgtype || ':' || tgfoid::regprocedure::text order by tgname) from pg_trigger
           where tgrelid = 'public.job_openings'::regclass and not tgisinternal and (tgtype & 2) = 2),
          array['job_openings_guard_moderation:19:job_openings_guard_moderation()', 'job_openings_guard_write:15:job_openings_guard_write()',
                'job_openings_guard_write_update:19:job_openings_guard_write()', 'job_openings_moderation_hold:19:job_openings_moderation_hold()',
                'job_openings_normalize:23:job_openings_normalize()'], 'w14_w4_guard_body_unchanged_and_trigger_order');
select is((select array_agg(tgname::text order by tgname) from pg_trigger where tgrelid = 'public.shops'::regclass and not tgisinternal
           and (tgtype & 2) = 2 and (tgtype & 16) = 16), array['shops_prevent_owner_verification_mutation', 'shops_zz_rereview_stamp'],
          'w14_w4_guard_body_unchanged_and_trigger_order');

-- ---------- super_admin still cannot edit or transition directly ----------
select test_helpers.act_as_admin('j2t-a1@local.test');
with updated as (update public.job_openings set title = 'Admin edit', status = 'closed' where id = pg_temp.id('jf') returning 1)
select is(count(*)::int, 0, 'w14_super_admin_still_cannot_edit_or_transition_directly') from updated;
select throws_ok(format('select public.transition_job_opening(%L, %L, %L)', pg_temp.id('jf'), 'published', 'closed'), '42501', 'Job opening not found.',
                 'w14_super_admin_still_cannot_edit_or_transition_directly');

select * from finish();
rollback;
