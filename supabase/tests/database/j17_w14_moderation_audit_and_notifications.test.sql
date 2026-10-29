-- J17 / spec I (W14): audit producers and notifications for job opening reports and moderation cases (W14 PLAN 3.9, D-53,
-- D-58). One audit action per transition; payloads without statements, messages, notes, titles or names; fixed-text
-- notifications, one per event, to the owner (paused / closed / pause kept / lifted) and to each reporter (report
-- closed); nothing for submissions, withdrawals, changes submitted, case views, lookups or log searches; a refused action
-- writes nothing. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temporary table j6m_ids (label text primary key, id uuid) on commit drop;
grant all on j6m_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j6m_ids where label = p_label $$;
insert into j6m_ids values ('a1', test_helpers.create_super_admin('j6m-a1@local.test'));
insert into j6m_ids values ('o1', test_helpers.create_owner('j6m-o1@local.test'));
insert into j6m_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j6m-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j6m_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j6m_ids select 'j' || x, test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test opening ' || x))
  from unnest(array['a', 'b', 'c', 'd']) x;
create function pg_temp.notes() returns integer language sql stable as $$ select count(*)::int from public.notifications
  where recipient_id in (select id from j6m_ids) $$;
create function pg_temp.events() returns integer language sql stable as $$ select count(*)::int from public.workforce_audit_events
  where action like 'job_opening_report.%' or action like 'job_opening_moderation.%' $$;
create function pg_temp.case_of(p_report text) returns uuid language sql stable as $$
  select case_id from public.job_opening_reports where id = pg_temp.id(p_report) $$;

-- ---------- reports: no notification ----------
insert into j6m_ids values ('ra', test_helpers.report_test_job_opening(pg_temp.id('ja'), 'j6m-w1@local.test', 'other', 'Statement alpha about this local posting'));
insert into j6m_ids values ('ra2', test_helpers.report_test_job_opening(pg_temp.id('ja'), 'j6m-w2@local.test', 'other', 'Statement bravo about this local posting'));
insert into j6m_ids values ('rb', test_helpers.report_test_job_opening(pg_temp.id('jb'), 'j6m-w1@local.test', 'other', 'Statement charlie about this posting'));
insert into j6m_ids values ('rc', test_helpers.report_test_job_opening(pg_temp.id('jc'), 'j6m-w1@local.test', 'other', 'Statement delta about this local posting'));
insert into j6m_ids values ('rd', test_helpers.report_test_job_opening(pg_temp.id('jd'), 'j6m-w1@local.test', 'other', 'Statement echo about this local posting'));
insert into j6m_ids select 'c' || x, pg_temp.case_of('r' || x) from unnest(array['a', 'b', 'c', 'd']) x;
select test_helpers.act_as_worker('j6m-w2@local.test');
select (public.withdraw_job_opening_report(pg_temp.id('ra2'))).status;
select test_helpers.act_as_admin('j6m-a1@local.test');
select public.admin_job_opening_moderation_case(pg_temp.id('ca')) is not null as viewed;
select public.admin_owner_relationships(pg_temp.id('o1'), 'moderation_follow_up', 'Checking the owner of a reported posting.') is not null as looked_up;
select count(*) from public.admin_workforce_audit_log('job_opening_moderation.');
select test_helpers.act_as_service();
select is(pg_temp.notes(), 0, 'w14_reporter_and_case_views_notify_nobody');

-- ---------- transitions ----------
select test_helpers.act_as_admin('j6m-a1@local.test');
select (public.moderate_job_opening(pg_temp.id('ca'), 1, 'pause', 'other', 'Owner message alpha: please describe duties.', 'Admin note alpha for this local case')).status;
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('ca')) is not null as backdated;
select set_config('fx.before_submit', pg_temp.notes()::text, true);
select test_helpers.act_as_owner('j6m-o1@local.test');
update public.job_openings set description = 'Duties: washing and drying cars' where id = pg_temp.id('ja');
select (public.submit_job_opening_changes(pg_temp.id('ca'), 'Owner change note alpha')).status;
select test_helpers.act_as_service();
select is(pg_temp.notes(), current_setting('fx.before_submit')::int, 'w14_reporter_and_case_views_notify_nobody');
select test_helpers.act_as_admin('j6m-a1@local.test');
select (public.moderate_job_opening(pg_temp.id('ca'), 3, 'keep_paused', 'misleading_terms', 'Owner message bravo: add the daily rate.', null)).status;
select test_helpers.act_as_service();
select test_helpers.backdate_test_moderation_case(pg_temp.id('ca')) is not null as backdated;
select test_helpers.act_as_owner('j6m-o1@local.test');
update public.job_openings set compensation_details = 'Daily rate shown at the interview' where id = pg_temp.id('ja');
select (public.submit_job_opening_changes(pg_temp.id('ca'))).status;
select test_helpers.act_as_admin('j6m-a1@local.test');
select (public.moderate_job_opening(pg_temp.id('ca'), 5, 'lift', null, null, null)).status;
select (public.moderate_job_opening(pg_temp.id('cb'), 1, 'close', 'worker_fee_or_deposit', 'Owner message charlie: no deposits allowed.', null)).status;
select (public.moderate_job_opening(pg_temp.id('cc'), 1, 'dismiss', null, null, 'Admin note delta: posting follows the rules.')).status;
select (public.moderate_job_opening(pg_temp.id('cd'), 1, 'pause', 'other', 'Owner message echo: please clarify the schedule.', null)).status;
select test_helpers.act_as_owner('j6m-o1@local.test');
select (public.transition_job_opening(pg_temp.id('jd'), 'paused', 'closed')).status;
select test_helpers.act_as_service();

select is((select string_agg(action || ':' || n, ',' order by action) from (select action, count(*) as n from public.workforce_audit_events
           where action like 'job_opening_moderation.%' and action <> 'job_opening_moderation.case_viewed' group by action) x),
          'job_opening_moderation.changes_submitted:2,job_opening_moderation.closed:1,job_opening_moderation.dismissed:1,job_opening_moderation.lifted:1,'
          || 'job_opening_moderation.opened:4,job_opening_moderation.pause_kept:1,job_opening_moderation.paused:2,job_opening_moderation.resolved_owner_closed:1',
          'w14_audit_actions_for_each_transition');
select is((select string_agg(action || ':' || n, ',' order by action) from (select action, count(*) as n from public.workforce_audit_events
           where action like 'job_opening_report.%' group by action) x),
          'job_opening_report.closed:4,job_opening_report.submitted:5,job_opening_report.withdrawn:1', 'w14_audit_actions_for_each_transition');
select is((select string_agg(e.payload ->> 'outcome', ',' order by e.payload ->> 'outcome') from public.workforce_audit_events e
           where e.action = 'job_opening_report.closed'), 'no_action,opening_closed,opening_paused,opening_paused', 'w14_audit_actions_for_each_transition');
select is((select (payload ->> 'from_status') || '>' || (payload ->> 'to_status') || ',' || (payload ->> 'reason_kind') || ',' || (payload ->> 'report_count')
                  || ',' || (payload ->> 'changed_by') || ',' || (actor_id = pg_temp.id('a1'))::text
           from public.workforce_audit_events where action = 'job_opening_moderation.pause_kept'),
          'changes_submitted>paused_by_washlink,misleading_terms,2,super_admin,true', 'w14_audit_actions_for_each_transition');

-- ---------- payloads ----------
select is((select count(*)::int from public.workforce_audit_events e
           where (e.action like 'job_opening_report.%' or e.action like 'job_opening_moderation.%' or e.action like 'admin_access.%'
                  or e.action = 'workforce_audit.log_searched')
             and e.payload::text ~* '(statement|message|note|alpha|bravo|charlie|delta|echo|Local test|Local Test|duties|daily rate)'), 0,
          'w14_audit_payload_has_no_statements_messages_notes_or_names');
select is((select array_agg(distinct k order by k) from public.workforce_audit_events e, jsonb_object_keys(e.payload) k
           where e.action like 'job_opening_report.%' or e.action like 'job_opening_moderation.%'),
          array['case_id', 'category', 'changed_by', 'from_status', 'job_opening_id', 'outcome', 'reason_kind', 'report_count', 'report_id', 'shop_id',
                'to_status'], 'w14_audit_payload_has_no_statements_messages_notes_or_names');

-- ---------- notifications ----------
select is((select string_agg(n.category || '|' || n.body, ',' order by n.created_at, n.category, n.body) from public.notifications n
           where n.recipient_id = pg_temp.id('o1') and n.category like 'job_opening_moderation.%'),
          'job_opening_moderation.closed|WashLink closed Local test opening b. Open it to read why.,'
          || 'job_opening_moderation.lifted|WashLink lifted the pause on Local test opening a. You can publish it again.,'
          || 'job_opening_moderation.pause_kept|WashLink kept the pause on Local test opening a. Open it to read why.,'
          || 'job_opening_moderation.paused|WashLink paused Local test opening a. Open it to read why and what to change.,'
          || 'job_opening_moderation.paused|WashLink paused Local test opening d. Open it to read why and what to change.',
          'w14_notifications_fixed_text_one_per_event');
select is((select count(*)::int || ',' || count(distinct n.idempotency_key) || ',' || min(n.body) || ',' || min(n.title)
           from public.notifications n where n.recipient_id = pg_temp.id('w1') and n.category = 'job_opening_report.closed'),
          '4,4,WashLink reviewed a job opening you reported.,Report reviewed', 'w14_notifications_fixed_text_one_per_event');
select is((select count(*)::int from public.notifications n where n.recipient_id = pg_temp.id('w2')), 0, 'w14_notifications_fixed_text_one_per_event');
select is((select count(*)::int from public.notifications n where n.recipient_id in (select id from j6m_ids)
           and (n.body ~* '(alpha|bravo|charlie|delta|echo|statement|note)' or n.title ~* '(alpha|bravo|charlie|delta|echo)')), 0,
          'w14_notifications_fixed_text_one_per_event');

-- ---------- a refused action writes nothing ----------
select set_config('fx.counts', pg_temp.events() || ',' || pg_temp.notes() || ',' || (select count(*) from public.job_opening_moderation_actions), true);
select test_helpers.act_as_admin('j6m-a1@local.test');
select test_helpers.attempt(format('select public.moderate_job_opening(%L, 1, %L, %L, %L, null)', pg_temp.id('ca'), 'close', 'other', 'A message that is long enough here'));
select test_helpers.attempt(format('select public.moderate_job_opening(%L, 3, %L, %L, %L, null)', pg_temp.id('cd'), 'lift', 'other', 'A message that is long enough here'));
select test_helpers.act_as_worker('j6m-w1@local.test');
select test_helpers.attempt(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('jb'), 'other', 'short'));
select test_helpers.act_as_service();
select is(pg_temp.events() || ',' || pg_temp.notes() || ',' || (select count(*) from public.job_opening_moderation_actions), current_setting('fx.counts'),
          'w14_refused_action_writes_nothing');

select * from finish();
rollback;
