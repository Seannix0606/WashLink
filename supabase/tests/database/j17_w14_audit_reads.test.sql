-- J17 (W14): redacted per-user activity, the audited admin audit log and the N6 long-open dispute flag (W14 PLAN 3.8,
-- P76, P77; D-53, D-54). my_workforce_activity returns only the caller's events (actor, subject profile, sent contract
-- party), labels instead of ids, allow-listed details without uuid values, and never a report to the owner. The admin log
-- is super_admin only and every search is audited. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create temporary table j17a_ids (label text primary key, id uuid) on commit drop;
grant all on j17a_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17a_ids where label = p_label $$;
insert into j17a_ids values ('a1', test_helpers.create_super_admin('j17a-a1@local.test'));
insert into j17a_ids select 'o' || n, test_helpers.create_owner('j17a-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j17a_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j17a-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into j17a_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j17a_ids values ('s2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')));
select test_helpers.act_as_owner('j17a-o1@local.test');
insert into public.job_openings (shop_id, owner_id, title) values (pg_temp.id('s1'), pg_temp.id('o1'), 'Local test owner one draft');
select test_helpers.act_as_owner('j17a-o2@local.test');
insert into public.job_openings (shop_id, owner_id, title) values (pg_temp.id('s2'), pg_temp.id('o2'), 'Local test owner two draft');
select test_helpers.act_as_admin('j17a-a1@local.test');
update public.shops set verification_status = 'changes_requested', verification_notes = 'Please upload a clearer permit photo' where id = pg_temp.id('s2');
update public.shops set verification_status = 'approved' where id = pg_temp.id('s2');
select test_helpers.act_as_service();
insert into j17a_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test reported opening')));
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w1')) is not null as applied;
insert into j17a_ids values ('k1', test_helpers.create_test_contract_draft('j17a-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k1'), 'j17a-o1@local.test') is not null as filled;
create function pg_temp.actions() returns text language sql stable as $$
  select coalesce(string_agg(distinct a.action, ',' order by a.action), '-') from public.my_workforce_activity(null, 100) a $$;

-- ---------- own events only ----------
select test_helpers.act_as_owner('j17a-o1@local.test');
select ok(pg_temp.actions() like '%job_opening.created%', 'w14_activity_returns_own_actor_and_subject_events_only');
select test_helpers.act_as_service();
create temporary table j17a_seen (who text, event_id bigint) on commit drop;
grant all on j17a_seen to public;
select test_helpers.act_as_owner('j17a-o1@local.test');
insert into j17a_seen select 'o1', a.event_id from public.my_workforce_activity(null, 100) a;
select test_helpers.act_as_owner('j17a-o2@local.test');
insert into j17a_seen select 'o2', a.event_id from public.my_workforce_activity(null, 100) a;
select test_helpers.act_as_service();
select is((select count(*)::int from j17a_seen s join public.workforce_audit_events e on e.id = s.event_id
           where e.actor_id is distinct from pg_temp.id(s.who) and e.subject_profile_id is distinct from pg_temp.id(s.who)
             and not exists (select 1 from public.worker_contracts c where c.id = e.subject_id and c.owner_id = pg_temp.id(s.who))), 0,
          'w14_activity_returns_own_actor_and_subject_events_only');
select is((select count(*)::int from j17a_seen s join public.workforce_audit_events e on e.id = s.event_id
           where s.who = 'o1' and e.subject_profile_id = pg_temp.id('o2')), 0, 'w14_activity_returns_own_actor_and_subject_events_only');
select ok((select count(*) from j17a_seen where who = 'o2') > 0 and (select count(*) from j17a_seen where who = 'o1') > 0,
          'w14_activity_returns_own_actor_and_subject_events_only');

-- ---------- contract events: the worker only once sent ----------
select test_helpers.act_as_worker('j17a-w1@local.test');
select is((select count(*)::int from public.my_workforce_activity(null, 100) where subject_type = 'worker_contract'), 0,
          'w14_activity_includes_contract_events_for_sent_party_only');
select test_helpers.act_as_service();
select test_helpers.send_test_contract(pg_temp.id('k1'), 'j17a-o1@local.test') is not null as sent;
select test_helpers.accept_test_contract(pg_temp.id('k1'), 'j17a-w1@local.test') is not null as accepted;
select test_helpers.act_as_worker('j17a-w1@local.test');
select ok((select count(*) from public.my_workforce_activity(null, 100) where subject_type = 'worker_contract') >= 2,
          'w14_activity_includes_contract_events_for_sent_party_only');
select test_helpers.act_as_worker('j17a-w2@local.test');
select is((select count(*)::int from public.my_workforce_activity(null, 100) where subject_type = 'worker_contract'), 0,
          'w14_activity_includes_contract_events_for_sent_party_only');

-- ---------- labels, ids and details ----------
select test_helpers.act_as_worker('j17a-w1@local.test');
select ok((select array_agg(distinct actor_label) from public.my_workforce_activity(null, 100)) @> array['you', 'shop_owner'], 'w14_activity_actor_labels');
select test_helpers.act_as_owner('j17a-o1@local.test');
select ok((select array_agg(distinct actor_label) from public.my_workforce_activity(null, 100)) @> array['you', 'worker', 'washlink_system'],
          'w14_activity_actor_labels');
select test_helpers.act_as_owner('j17a-o2@local.test');
select ok((select array_agg(distinct actor_label) from public.my_workforce_activity(null, 100)) @> array['you', 'washlink'], 'w14_activity_actor_labels');
select is((select array_agg(distinct actor_label) <@ array['you', 'washlink', 'washlink_system', 'shop_owner', 'worker', 'someone']
           from public.my_workforce_activity(null, 100)), true, 'w14_activity_actor_labels');
select test_helpers.act_as_service();
select is((select array_to_string(proargnames, ',') from pg_proc where oid = 'public.my_workforce_activity(bigint, integer)'::regprocedure),
          'p_before_id,p_limit,event_id,created_at,action,subject_type,actor_label,details', 'w14_activity_never_returns_ids');
create temporary table j17a_details (details jsonb) on commit drop;
grant all on j17a_details to public;
select test_helpers.act_as_owner('j17a-o1@local.test');
insert into j17a_details select details from public.my_workforce_activity(null, 100);
select test_helpers.act_as_worker('j17a-w1@local.test');
insert into j17a_details select details from public.my_workforce_activity(null, 100);
select test_helpers.act_as_service();
select is((select count(*)::int from j17a_details d, jsonb_each_text(d.details) k
           where k.value ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), 0, 'w14_activity_never_returns_ids');
select is((select count(*)::int from j17a_details d, jsonb_object_keys(d.details) k
           where k not in ('from_status', 'to_status', 'status', 'decision', 'result', 'category', 'reason_kind', 'basis', 'resolution_kind',
                           'changed_by', 'deleted_by', 'ended_by', 'party_role', 'version_number', 'version_kind', 'scope', 'purpose',
                           'access_kind', 'outcome')), 0, 'w14_activity_details_allow_list_only');
select ok((select count(*) from j17a_details where details ? 'to_status') > 0, 'w14_activity_details_allow_list_only');
select test_helpers.act_as_owner('j17a-o1@local.test');
select throws_ok('select * from public.my_workforce_activity(null, 101)', '22023', 'Choose a page size between 1 and 100.', 'w14_activity_details_allow_list_only');

-- ---------- reports stay hidden from the owner ----------
select test_helpers.act_as_service();
insert into j17a_ids values ('r1', test_helpers.report_test_job_opening(pg_temp.id('j1'), 'j17a-w3@local.test'));
select test_helpers.act_as_admin('j17a-a1@local.test');
select public.admin_job_opening_moderation_case((select case_id from public.admin_job_opening_moderation_queue('open') limit 1)) is not null as viewed;
select test_helpers.act_as_owner('j17a-o1@local.test');
select ok(pg_temp.actions() not like '%job_opening_report%' and pg_temp.actions() not like '%job_opening_moderation%',
          'w14_activity_hides_reports_from_owner');
select test_helpers.act_as_worker('j17a-w3@local.test');
select is((select actor_label || ',' || (details ->> 'category') from public.my_workforce_activity(null, 100) where action = 'job_opening_report.submitted'),
          'you,age_requirement', 'w14_activity_hides_reports_from_owner');

-- ---------- admin log ----------
select test_helpers.act_as_admin('j17a-a1@local.test');
select is((select count(*)::int from public.admin_workforce_audit_log('job_opening.', null, null, pg_temp.id('o1'), null, null, null, null, 2)
           where left(action, 12) = 'job_opening.'), 2, 'w14_admin_log_filters_and_paging');
select set_config('fx.last', (select min(event_id)::text from public.admin_workforce_audit_log('job_opening.', null, null, pg_temp.id('o1'), null, null, null, null, 2)), true);
select ok((select bool_and(event_id < current_setting('fx.last')::bigint) and count(*) >= 1
           from public.admin_workforce_audit_log('job_opening.', null, null, pg_temp.id('o1'), null, null, null, current_setting('fx.last')::bigint, 2)),
          'w14_admin_log_filters_and_paging');
select is(array[test_helpers.attempt($$ select * from public.admin_workforce_audit_log('Job%', null, null, null, null, null, null, null, 10) $$),
                test_helpers.attempt($$ select * from public.admin_workforce_audit_log(null, null, null, null, null, now(), now() - interval '1 day', null, 10) $$),
                test_helpers.attempt($$ select * from public.admin_workforce_audit_log(null, null, null, null, null, null, null, null, 0) $$),
                test_helpers.attempt($$ select * from public.admin_workforce_audit_log(null, null, null, null, null, null, null, null, 201) $$)],
          array_fill('22023'::text, array[4]), 'w14_admin_log_filters_and_paging');
select test_helpers.act_as_service();
select is((select count(*)::int || ',' || max(payload ->> 'result_count') from public.workforce_audit_events
           where action = 'workforce_audit.log_searched' and actor_id = pg_temp.id('a1')), '3,2', 'w14_admin_log_search_is_audited');
select is((select payload -> 'filters' from public.workforce_audit_events where action = 'workforce_audit.log_searched' order by id desc limit 1),
          '["action_prefix", "profile_id", "before_id"]'::jsonb, 'w14_admin_log_search_is_audited');
select test_helpers.act_as_owner('j17a-o1@local.test');
select throws_ok($$ select * from public.admin_workforce_audit_log() $$, '42501', 'Only a platform administrator can read the audit log.',
                 'w14_admin_log_refused_for_non_admin');
select test_helpers.act_as_worker('j17a-w1@local.test');
select is(test_helpers.attempt('select * from public.admin_workforce_audit_log()'), '42501', 'w14_admin_log_refused_for_non_admin');

-- ---------- N6: long-open disputes with repeated case reads ----------
select test_helpers.act_as_service();
insert into j17a_ids values ('k2', test_helpers.create_active_test_contract('j17a-o1@local.test', pg_temp.id('s1'), pg_temp.id('w2'), 'j17a-w2@local.test'));
insert into j17a_ids values ('d1', test_helpers.backdate_test_contract_dispute(test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j17a-w1@local.test'), 31));
insert into j17a_ids values ('d2', test_helpers.raise_test_contract_dispute(pg_temp.id('k2'), 'j17a-w2@local.test'));
select test_helpers.act_as_admin('j17a-a1@local.test');
select count(public.admin_contract_dispute_case(pg_temp.id('d1'))) + count(public.admin_contract_dispute_case(pg_temp.id('d2')))
  from generate_series(1, 4) n;
select is((select count(*)::int from public.admin_oversight_access_flags()), 0, 'w14_n6_flag_long_open_dispute_with_repeated_reads');
select public.admin_contract_dispute_case(pg_temp.id('d1')) is not null and public.admin_contract_dispute_case(pg_temp.id('d2')) is not null as fifth;
select is((select string_agg(dispute_id::text || ',' || opened_days || ',' || case_view_count || ',' || distinct_viewer_count, ';')
           from public.admin_oversight_access_flags()), pg_temp.id('d1') || ',31,5,1', 'w14_n6_flag_long_open_dispute_with_repeated_reads');
select is((select oversight_flag_count from public.admin_moderation_summary()), 1, 'w14_n6_flag_long_open_dispute_with_repeated_reads');
select is((select count(*)::int from public.admin_oversight_access_flags() where dispute_id = pg_temp.id('d2')), 0, 'w14_n6_flag_ignores_closed_or_short_disputes');
select lives_ok(format('select public.close_contract_dispute(%L, %s, %L, %L)', pg_temp.id('d1'),
                       (select revision from public.admin_contract_dispute_queue('open') where dispute_id = pg_temp.id('d1')), 'no_platform_action',
                       'Nothing for WashLink to change on this contract.'), 'w14_n6_flag_ignores_closed_or_short_disputes');
select is((select count(*)::int from public.admin_oversight_access_flags()), 0, 'w14_n6_flag_ignores_closed_or_short_disputes');

select * from finish();
rollback;
