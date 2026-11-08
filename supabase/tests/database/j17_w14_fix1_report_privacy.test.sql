-- J17 (W14 fix cycle 1): report privacy after an owner close / archive (B1, D-53), the per-worker report lock (N2), the
-- log_searched filter values (N4) and "changed since the pause" for submit_job_opening_changes (N5). An owner close of a
-- WashLink-held opening closes the open reports in the OWNER's session (actor = owner); my_workforce_activity must still
-- show job_opening_report.* events only to the reporter (the event's subject profile). Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create temporary table j17f_ids (label text primary key, id uuid) on commit drop;
grant all on j17f_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17f_ids where label = p_label $$;
insert into j17f_ids values ('a1', test_helpers.create_super_admin('j17f-a1@local.test'));
insert into j17f_ids values ('o1', test_helpers.create_owner('j17f-o1@local.test'));
insert into j17f_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j17f-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j17f_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j17f_ids select 'j' || x, test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test fix opening ' || x))
  from unnest(array['a', 'b', 'c', 'd']) x;
-- w2 applied to every opening, so w2 can still report one while it is paused (the report lands on the held case).
select count(test_helpers.create_job_application(pg_temp.id('j' || x), pg_temp.id('w2'))) as applied from unnest(array['a', 'b', 'c', 'd']) x;
insert into j17f_ids select 'r' || x, test_helpers.report_test_job_opening(pg_temp.id('j' || x), 'j17f-w1@local.test') from unnest(array['a', 'b', 'c', 'd']) x;
insert into j17f_ids select 'c' || x, (select case_id from public.job_opening_reports where id = pg_temp.id('r' || x)) from unnest(array['a', 'b', 'c', 'd']) x;
create function pg_temp.report_rows() returns integer language sql stable as $$
  select count(*)::int from public.my_workforce_activity(null, 100) where left(action, 18) = 'job_opening_report' $$;
create function pg_temp.report_case_rows() returns integer language sql stable as $$
  select count(*)::int from public.my_workforce_activity(null, 100)
  where action in ('job_opening_moderation.opened', 'job_opening_moderation.dismissed', 'job_opening_moderation.case_viewed',
                   'job_opening_moderation.deleted') $$;
create function pg_temp.rev(p_case text) returns integer language sql stable as $$
  select q.revision from public.admin_job_opening_moderation_queue('active') q where q.case_id = pg_temp.id(p_case) $$;
create function pg_temp.moderate(p_case text, p_action text) returns text language sql as $$
  select (public.moderate_job_opening(pg_temp.id(p_case), pg_temp.rev(p_case), p_action, 'age_requirement',
                                      'Remove the age limit from this posting, please.', null)).status $$;
select test_helpers.act_as_admin('j17f-a1@local.test');
select pg_temp.moderate(x, 'pause') from unnest(array['ca', 'cb', 'cc', 'cd']) x;
select count(public.admin_job_opening_moderation_case(pg_temp.id(x))) as viewed from unnest(array['ca', 'cb', 'cc']) x;
select test_helpers.act_as_service();
insert into j17f_ids select 'l' || x, test_helpers.report_test_job_opening(pg_temp.id('j' || x), 'j17f-w2@local.test', 'misleading_terms',
                                                                          'The paused posting still reads as misleading to me') from unnest(array['a', 'b', 'c']) x;

-- ---------- B1: paused -> owner close ----------
select test_helpers.act_as_owner('j17f-o1@local.test');
select is((public.transition_job_opening(pg_temp.id('ja'), 'paused', 'closed')).status, 'closed', 'w14_fix1_owner_close_after_pause_hides_reports');
select test_helpers.act_as_service();
select is((select string_agg(e.actor_role || ':' || (e.payload ->> 'category') || ':' || (e.payload ->> 'outcome'), ',') from public.workforce_audit_events e
           where e.action = 'job_opening_report.closed' and e.actor_id = pg_temp.id('o1') and e.payload ->> 'report_id' = pg_temp.id('la')::text),
          'owner:misleading_terms:opening_closed', 'w14_fix1_owner_close_after_pause_hides_reports');   -- the B1 path exists
select test_helpers.act_as_owner('j17f-o1@local.test');
select is(pg_temp.report_rows() || ',' || pg_temp.report_case_rows(), '0,0', 'w14_fix1_owner_close_after_pause_hides_reports');
select is((select count(*)::int from public.my_workforce_activity(null, 100) where action = 'job_opening_moderation.resolved_owner_closed'
           and not (details ? 'report_count')), 1, 'w14_fix1_owner_close_after_pause_hides_reports');
select test_helpers.act_as_worker('j17f-w2@local.test');
select is((select string_agg(action || ':' || actor_label || ':' || coalesce(details ->> 'outcome', '-'), ',' order by event_id)
           from public.my_workforce_activity(null, 100) where left(action, 19) = 'job_opening_report.'),
          repeat('job_opening_report.submitted:you:-,', 3) || 'job_opening_report.closed:shop_owner:opening_closed',
          'w14_fix1_reporter_still_sees_own_report_events');   -- w2's three late reports, then the one the owner close closed
select test_helpers.act_as_worker('j17f-w1@local.test');
select is((select count(*)::int from public.my_workforce_activity(null, 100) where left(action, 19) = 'job_opening_report.'), 8,
          'w14_fix1_reporter_still_sees_own_report_events');   -- 4 submitted + 4 closed by the pause; never w2's

-- ---------- B1: paused -> owner close -> owner archive ----------
select test_helpers.act_as_owner('j17f-o1@local.test');
select is((public.transition_job_opening(pg_temp.id('jb'), 'paused', 'closed')).status || ',' ||
          (public.transition_job_opening(pg_temp.id('jb'), 'closed', 'archived')).status, 'closed,archived', 'w14_fix1_owner_archive_hides_reports');
select is(pg_temp.report_rows() || ',' || pg_temp.report_case_rows(), '0,0', 'w14_fix1_owner_archive_hides_reports');
select test_helpers.act_as_worker('j17f-w2@local.test');
select is((select count(*)::int from public.my_workforce_activity(null, 100) where action = 'job_opening_report.closed'), 2,
          'w14_fix1_owner_archive_hides_reports');

-- ---------- B1: changes_submitted -> owner close ----------
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('cc')) is not null as backdated;
select test_helpers.act_as_owner('j17f-o1@local.test');
update public.job_openings set description = 'Open to every adult applicant' where id = pg_temp.id('jc');
select is((public.submit_job_opening_changes(pg_temp.id('cc'))).status, 'changes_submitted', 'w14_fix1_changes_submitted_close_hides_reports');
select is(pg_temp.report_rows(), 0, 'w14_fix1_changes_submitted_close_hides_reports');
select is((public.transition_job_opening(pg_temp.id('jc'), 'paused', 'closed')).status, 'closed', 'w14_fix1_changes_submitted_close_hides_reports');
select is(pg_temp.report_rows() || ',' || pg_temp.report_case_rows(), '0,0', 'w14_fix1_changes_submitted_close_hides_reports');
select test_helpers.act_as_worker('j17f-w2@local.test');
select is((select count(*)::int from public.my_workforce_activity(null, 100) where action = 'job_opening_report.closed'), 3,
          'w14_fix1_changes_submitted_close_hides_reports');

-- ---------- B1 hardening: a report-revealing case event with the owner as actor stays hidden ----------
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('o1'), 'role', 'authenticated')::text, true);
select public.record_workforce_audit_event('job_opening_moderation.deleted', 'job_opening', pg_temp.id('jd'), pg_temp.id('o1'),
                                           jsonb_build_object('case_id', pg_temp.id('cd'), 'from_status', 'open')) is not null as recorded;
select test_helpers.act_as_owner('j17f-o1@local.test');
select is(pg_temp.report_case_rows(), 0, 'w14_fix1_report_case_events_never_shown_to_owner_actor');

-- ---------- N5: the opening must differ from the last pause snapshot ----------
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('cd')) is not null as backdated;
select test_helpers.act_as_owner('j17f-o1@local.test');
update public.job_openings set description = description where id = pg_temp.id('jd');
select is((select can_submit_changes from public.owner_job_opening_moderation() where case_id = pg_temp.id('cd')), false, 'w14_fix1_noop_edit_does_not_count');
select throws_ok(format('select public.submit_job_opening_changes(%L)', pg_temp.id('cd')), '23514',
                 'Edit the job opening before asking WashLink to check it.', 'w14_fix1_noop_edit_does_not_count');
select test_helpers.act_as_service();
create temporary table j17f_desc on commit drop as select description from public.job_openings where id = pg_temp.id('jd');
grant all on j17f_desc to public;
select test_helpers.act_as_owner('j17f-o1@local.test');
update public.job_openings set description = 'Open to every adult applicant' where id = pg_temp.id('jd');
select is((select can_submit_changes from public.owner_job_opening_moderation() where case_id = pg_temp.id('cd')), true, 'w14_fix1_noop_edit_does_not_count');
select is((public.submit_job_opening_changes(pg_temp.id('cd'))).status, 'changes_submitted', 'w14_fix1_noop_edit_does_not_count');
select test_helpers.act_as_admin('j17f-a1@local.test');
select is(pg_temp.moderate('cd', 'keep_paused'), 'paused_by_washlink', 'w14_fix1_compares_with_last_pause_kept_snapshot');
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('cd')) is not null as backdated;
select test_helpers.act_as_owner('j17f-o1@local.test');
update public.job_openings set title = title where id = pg_temp.id('jd');
select is(test_helpers.attempt(format('select public.submit_job_opening_changes(%L)', pg_temp.id('cd'))), '23514',
          'w14_fix1_compares_with_last_pause_kept_snapshot');
-- Back to the text of the FIRST pause: differs from the pause_kept snapshot, so it counts (the last pause is compared).
update public.job_openings set description = (select description from j17f_desc) where id = pg_temp.id('jd');
select is((public.submit_job_opening_changes(pg_temp.id('cd'))).status, 'changes_submitted', 'w14_fix1_compares_with_last_pause_kept_snapshot');

-- ---------- N2: the open-report limits are counted under a per-worker advisory lock ----------
select test_helpers.act_as_service();
select ok((select strpos(prosrc, 'pg_advisory_xact_lock(hashtextextended(''job_opening_reports:'' || auth.uid()::text, 0))') between 1 and strpos(prosrc, 'r.status = ''open''')
           from pg_proc where oid = 'public.report_job_opening(uuid, text, text)'::regprocedure), 'w14_fix1_report_limits_under_worker_advisory_lock');
select ok(exists (select 1 from pg_locks l, (select hashtextextended('job_opening_reports:' || pg_temp.id('w2')::text, 0) as k) x
                  where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
                    and l.classid = ((x.k >> 32) & 4294967295)::oid and l.objid = (x.k & 4294967295)::oid),
          'w14_fix1_report_limits_under_worker_advisory_lock');

-- ---------- N4: log_searched records the subject id / type and action prefix (enum and uuid values only) ----------
select test_helpers.act_as_admin('j17f-a1@local.test');
select count(*) as searched from public.admin_workforce_audit_log('job_opening_report.', 'job_opening', pg_temp.id('jd'), null, null, null, null, null, 10);
select count(*) as searched from public.admin_workforce_audit_log('zz_free_text_guess', 'zz_not_a_subject_type', null, null, null, null, null, null, 10);
select test_helpers.act_as_service();
select is((select string_agg((payload ->> 'action_prefix') || '|' || (payload ->> 'subject_type') || '|' || coalesce(payload ->> 'subject_id', '-'), ',' order by id)
           from public.workforce_audit_events where action = 'workforce_audit.log_searched' and actor_id = pg_temp.id('a1')),
          'job_opening_report.|job_opening|' || pg_temp.id('jd') || ',unrecognised|unrecognised|-', 'w14_fix1_log_searched_records_filter_values');
select is((select bool_and(public.workforce_audit_payload_is_safe(payload) and not (payload::text ~ 'zz_')) from public.workforce_audit_events
           where action = 'workforce_audit.log_searched' and actor_id = pg_temp.id('a1')), true, 'w14_fix1_log_searched_records_filter_values');

select * from finish();
rollback;
