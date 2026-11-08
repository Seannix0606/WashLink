-- J17 (W14): audited super_admin relationship lookups outside disputes (D-38, D-55; W14 PLAN 3.7, P77, P78). A fixed
-- purpose and a 20..300 note are required; every lookup (unknown ids included) writes an access record and an
-- admin_access.relationships_viewed audit row; the owner lookup carries no worker count, minimum or other owners; the
-- subject sees the lookup in "Your activity"; owners and workers cannot look up; nobody reads the records raw. Local
-- Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temporary table j17l_ids (label text primary key, id uuid) on commit drop;
grant all on j17l_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17l_ids where label = p_label $$;
insert into j17l_ids values ('a1', test_helpers.create_super_admin('j17l-a1@local.test'));
insert into j17l_ids select 'o' || n, test_helpers.create_owner('j17l-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j17l_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17l-w1@local.test')));
insert into j17l_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j17l_ids values ('s2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1')));
insert into j17l_ids values ('k1', test_helpers.create_active_test_contract('j17l-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17l-w1@local.test'));
insert into j17l_ids values ('k2', test_helpers.create_active_test_contract('j17l-o2@local.test', pg_temp.id('s2'), pg_temp.id('w1'), 'j17l-w1@local.test'));
create function pg_temp.lookup(p_kind text, p_id uuid, p_purpose text, p_note text) returns text language sql as $$
  select test_helpers.attempt(format('select public.admin_%s_relationships(%L, %L, %L)', p_kind, p_id, p_purpose, p_note)) $$;
create function pg_temp.records() returns text language sql stable as $$
  select count(*)::text || ',' || (select count(*) from public.workforce_audit_events where action = 'admin_access.relationships_viewed')
  from public.admin_access_records $$;

-- ---------- worker lookup ----------
select test_helpers.act_as_admin('j17l-a1@local.test');
select set_config('fx.w', public.admin_worker_relationships(pg_temp.id('w1'), 'party_support_request', 'The worker asked support about their contracts.')::text, true);
select is((select (x ->> 'found') || ',' || (x ->> 'worker_display_name') || ',' || (x ->> 'distinct_qualifying_owner_count') || ','
                  || jsonb_array_length(x -> 'relationships') || ',' || (x ? 'minimum_distinct_owners')::text
           from (select current_setting('fx.w')::jsonb as x) z), 'true,Local Test Worker,2,2,false', 'w14_worker_lookup_returns_rows_count_and_minimum');
select is((select string_agg(r ->> 'status' || ':' || (r ->> 'counts_toward_goal') || ':' || (r ->> 'qualifying_contract_count') || ':' || (r ->> 'owner_present'), ',')
           from jsonb_array_elements(current_setting('fx.w')::jsonb -> 'relationships') r), 'active:true:1:true,active:true:1:true',
          'w14_worker_lookup_returns_rows_count_and_minimum');
select is((select count(*)::int from jsonb_array_elements(current_setting('fx.w')::jsonb -> 'relationships') r, jsonb_object_keys(r) k
           where k ~ '(text|clause|body|hash|contract_id|worker_id|owner_id)'), 0, 'w14_worker_lookup_returns_rows_count_and_minimum');

-- ---------- owner lookup ----------
select set_config('fx.o', public.admin_owner_relationships(pg_temp.id('o1'), 'policy_monitoring', 'Monthly check of relationships for this owner.')::text, true);
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('fx.o')::jsonb) k),
          array['found', 'owner_display_name', 'relationships'], 'w14_owner_lookup_has_no_worker_counts_or_other_owners');
select is((select string_agg((r ->> 'worker_name_snapshot') || ':' || (r ->> 'status'), ',')
           from jsonb_array_elements(current_setting('fx.o')::jsonb -> 'relationships') r), 'Local Test Worker:active',
          'w14_owner_lookup_has_no_worker_counts_or_other_owners');
select is((select count(*)::int from jsonb_array_elements(current_setting('fx.o')::jsonb -> 'relationships') r, jsonb_object_keys(r) k
           where k in ('owner_name_snapshot', 'distinct_qualifying_owner_count', 'minimum_distinct_owners', 'owner_present')), 0,
          'w14_owner_lookup_has_no_worker_counts_or_other_owners');

-- ---------- purpose and note ----------
select set_config('fx.before', pg_temp.records(), true);
select is(array[pg_temp.lookup('worker', pg_temp.id('w1'), 'curiosity', 'Checking this worker for no particular reason'),
                pg_temp.lookup('worker', pg_temp.id('w1'), null, 'Checking this worker for no particular reason'),
                pg_temp.lookup('worker', pg_temp.id('w1'), 'policy_monitoring', 'too short'),
                pg_temp.lookup('owner', pg_temp.id('o1'), 'policy_monitoring', repeat('n', 301)),
                pg_temp.lookup('owner', pg_temp.id('o1'), 'policy_monitoring', null)],
          array['22023', '22023', '23514', '23514', '23514'], 'w14_lookup_requires_purpose_and_note');
select throws_ok(format('select public.admin_worker_relationships(%L, %L, %L)', pg_temp.id('w1'), 'curiosity', 'Checking this worker for no reason at all'),
                 '22023', 'Choose a purpose for this lookup.', 'w14_lookup_requires_purpose_and_note');
select throws_ok(format('select public.admin_owner_relationships(%L, %L, %L)', pg_temp.id('o1'), 'policy_monitoring', 'short'),
                 '23514', 'Write a note of 20 to 300 characters.', 'w14_lookup_requires_purpose_and_note');
select is(pg_temp.records(), current_setting('fx.before'), 'w14_lookup_requires_purpose_and_note');

-- ---------- unknown ids are recorded too ----------
select is(public.admin_worker_relationships(gen_random_uuid(), 'reported_problem_follow_up', 'Following up an id from a support ticket.'),
          '{"found": false}'::jsonb, 'w14_unknown_id_lookup_still_recorded');
select is(public.admin_worker_relationships(pg_temp.id('o1'), 'reported_problem_follow_up', 'Following up an id from a support ticket.'),
          '{"found": false}'::jsonb, 'w14_unknown_id_lookup_still_recorded');
select is(public.admin_owner_relationships(pg_temp.id('w1'), 'moderation_follow_up', 'Following up an id from a moderation case.'),
          '{"found": false}'::jsonb, 'w14_unknown_id_lookup_still_recorded');

-- ---------- records and audit ----------
select test_helpers.act_as_service();
select is(pg_temp.records(), '5,5', 'w14_every_lookup_records_access_and_audit');
select is((select string_agg(a.access_kind || ':' || a.purpose || ':' || a.row_count || ':' || (a.admin_id = pg_temp.id('a1'))::text, ',' order by a.access_kind, a.purpose)
           from public.admin_access_records a where a.subject_profile_id in (pg_temp.id('w1'), pg_temp.id('o1'))),
          'owner_relationships:moderation_follow_up:0:true,owner_relationships:policy_monitoring:1:true,'
          || 'worker_relationships:party_support_request:2:true,worker_relationships:reported_problem_follow_up:0:true',
          'w14_every_lookup_records_access_and_audit');
select is((select count(*)::int from public.workforce_audit_events e join public.admin_access_records a on a.id::text = e.payload ->> 'access_record_id'
           where e.action = 'admin_access.relationships_viewed' and e.subject_profile_id = a.subject_profile_id and e.actor_id = pg_temp.id('a1')
             and e.payload ->> 'purpose' = a.purpose and (e.payload ->> 'row_count')::int = a.row_count and e.payload ->> 'access_kind' = a.access_kind), 5,
          'w14_every_lookup_records_access_and_audit');
select is((select count(*)::int from public.workforce_audit_events where action = 'admin_access.relationships_viewed' and payload::text ~* 'asked|monthly|ticket|moderation case'), 0,
          'w14_every_lookup_records_access_and_audit');
select test_helpers.act_as_admin('j17l-a1@local.test');
select is((select string_agg(access_purpose || '|' || access_note, ',' order by event_id)
           from public.admin_workforce_audit_log('admin_access.', null, null, pg_temp.id('o1'), null, null, null, null, 10)),
          'policy_monitoring|Monthly check of relationships for this owner.,reported_problem_follow_up|Following up an id from a support ticket.',
          'w14_every_lookup_records_access_and_audit');

-- ---------- the subject sees the lookup ----------
select test_helpers.act_as_worker('j17l-w1@local.test');
select is((select string_agg(actor_label || ':' || (details ->> 'access_kind') || ':' || (details ->> 'purpose'), ',' order by event_id)
           from public.my_workforce_activity(null, 100) where action = 'admin_access.relationships_viewed'),
          'washlink:worker_relationships:washlink_review,washlink:owner_relationships:washlink_review',   -- w1 was also looked up as an owner id (N7: generic purpose)
          'w14_lookup_visible_in_subject_activity');

-- ---------- owners and workers cannot look up; no raw reads ----------
select test_helpers.act_as_owner('j17l-o1@local.test');
select throws_ok(format('select public.admin_worker_relationships(%L, %L, %L)', pg_temp.id('w1'), 'policy_monitoring', 'An owner tries to look up a worker'),
                 '42501', 'Only a platform administrator can look up relationships.', 'w14_owner_worker_cannot_lookup');
select test_helpers.act_as_worker('j17l-w1@local.test');
select is(pg_temp.lookup('owner', pg_temp.id('o1'), 'policy_monitoring', 'A worker tries to look up an owner'), '42501', 'w14_owner_worker_cannot_lookup');
select is((select count(*)::int from public.admin_access_records), 0, 'w14_access_records_deny_raw_select');
select test_helpers.act_as_admin('j17l-a1@local.test');
select is(array[(select count(*) from public.admin_access_records)::text,
                test_helpers.attempt(format($$ insert into public.admin_access_records (access_kind, subject_profile_id, purpose, note)
                                               values ('worker_relationships', %L, 'policy_monitoring', 'A forged local test access record') $$, pg_temp.id('w1'))),
                test_helpers.attempt('delete from public.admin_access_records')],
          array['0', '42501', '42501'], 'w14_access_records_deny_raw_select');
select test_helpers.act_as_service();
select is(array[test_helpers.attempt(format($$ insert into public.admin_access_records (access_kind, subject_profile_id, purpose, note)
                                               values ('worker_relationships', %L, 'policy_monitoring', 'A forged local test access record') $$, pg_temp.id('w1'))),
                test_helpers.attempt($$ update public.admin_access_records set purpose = 'policy_monitoring' $$),
                test_helpers.attempt('delete from public.admin_access_records'), pg_temp.records()],
          array['42501', '42501', '42501', '5,5'], 'w14_access_records_deny_raw_select');

select * from finish();
rollback;
