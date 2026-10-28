-- W10 (P62, P63; D-39): relationship audit and sync. Each create / status change is audited with ids, status /
-- reason words, counts and changed_by only (no names, reasons or dates); an unchanged refresh writes nothing; no
-- notification is ever written for a relationship; the refresh functions are internal and refuse a past date; the
-- stored rows equal the live derivation after a full refresh; an owner_removed row is terminal. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('w10s-a1@local.test')::text, true);
create temporary table w10s_ids (label text primary key, id uuid) on commit drop;
grant all on w10s_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from w10s_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.trail(p_worker text) returns text[] language sql stable as $$
  select array_agg(replace(action, 'worker_owner_relationship.', '') || ':' || (payload ->> 'to_status') || ':' || (payload ->> 'changed_by') order by id)
  from public.workforce_audit_events where subject_type = 'worker_owner_relationship' and subject_profile_id = pg_temp.id(p_worker) $$;
create function pg_temp.events() returns integer language sql stable
as $$ select count(*)::int from public.workforce_audit_events where subject_type = 'worker_owner_relationship' $$;
insert into w10s_ids select 'o' || n, test_helpers.create_owner('w10s-o' || n || '@local.test') from generate_series(1, 3) n;
insert into w10s_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('w10s-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into w10s_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 3) n;

-- ---------- audit on create and each status change ----------
insert into w10s_ids values ('c1', test_helpers.create_accepted_test_contract('w10s-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'w10s-w1@local.test'));
select test_helpers.act_as_owner('w10s-o1@local.test');
select public.activate_worker_contract(pg_temp.id('c1'), pg_temp.rev('c1'));
select test_helpers.act_as_admin('w10s-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s1');
select test_helpers.act_as_worker('w10s-w1@local.test');
select public.terminate_worker_contract(pg_temp.id('c1'), pg_temp.rev('c1'), 'Ending after the verification lapse.');
select test_helpers.act_as_service();
select is(pg_temp.trail('w1'), array['created:pending_start:worker', 'status_changed:active:owner', 'status_changed:suspended:super_admin',
                                     'status_changed:ended:worker'], 'w10_audit_on_create_and_each_status_change');
select is((select array_agg(row(actor_kind, subject_id = r.id, payload ->> 'from_status', payload ->> 'status_reason', payload ->> 'counts_toward_goal',
                                payload ->> 'qualifying_contract_count')::text order by e.id)
           from public.workforce_audit_events e join public.worker_owner_relationships r on r.worker_id = e.subject_profile_id
           where e.subject_type = 'worker_owner_relationship' and e.subject_profile_id = pg_temp.id('w1')),
          array['(user,t,,contract_accepted_not_started,false,0)', '(user,t,pending_start,contract_active,true,1)',
                '(user,t,active,owner_verification_not_current,false,0)', '(user,t,suspended,contract_terminated,false,0)'],
          'w10_audit_on_create_and_each_status_change');

-- ---------- an unchanged refresh writes nothing ----------
select set_config('fx.events', pg_temp.events()::text, true);
select is(array[public.refresh_worker_owner_relationship(pg_temp.id('w1'), pg_temp.id('o1'))::text,
                public.refresh_worker_owner_relationships()::text, (pg_temp.events() - current_setting('fx.events')::int)::text],
          array['false', '0', '0'], 'w10_unchanged_refresh_writes_no_audit');
select test_helpers.act_as_admin('w10s-a1@local.test');
update public.shops set verification_notes = 'Local test note only.' where id = pg_temp.id('s1');
select test_helpers.act_as_service();
select is(pg_temp.events() - current_setting('fx.events')::int, 0, 'w10_unchanged_refresh_writes_no_audit');

-- ---------- payloads ----------
select is((select count(*)::int from public.workforce_audit_events e, jsonb_object_keys(e.payload) k
           where e.subject_type = 'worker_owner_relationship' and k not in ('relationship_id', 'worker_id', 'owner_id', 'from_status', 'to_status',
             'status_reason', 'counts_toward_goal', 'qualifying_contract_count', 'changed_by', 'deleted_by')), 0,
          'w10_audit_payload_has_no_names_reasons_or_dates');
select is((select count(*)::int from public.workforce_audit_events e where e.subject_type = 'worker_owner_relationship'
           and (e.payload::text ~* '(local test|verification lapse|[0-9]{4}-[0-9]{2}-[0-9]{2})')), 0,
          'w10_audit_payload_has_no_names_reasons_or_dates');

-- ---------- refresh functions: internal, no past date, stored = live ----------
select is((select count(*)::int from unnest(array['public.refresh_worker_owner_relationships(date)', 'public.refresh_worker_owner_relationship(uuid, uuid, date)',
             'public.worker_owner_relationship_derive(uuid, uuid, date)', 'public.worker_distinct_qualifying_owner_count(uuid, date)']) f,
             unnest(array['anon', 'authenticated', 'service_role']) r where has_function_privilege(r, f::regprocedure, 'execute')), 0,
          'w10_refresh_function_internal_and_rejects_past_date');
select throws_ok($$ select public.refresh_worker_owner_relationships(test_helpers.manila_today() - 1) $$, '22023', 'The refresh date cannot be in the past.',
                 'w10_refresh_function_internal_and_rejects_past_date');
select test_helpers.act_as_owner('w10s-o2@local.test');
select is(test_helpers.attempt('select public.refresh_worker_owner_relationships(null)'), '42501', 'w10_refresh_function_internal_and_rejects_past_date');
select test_helpers.act_as_service();
insert into w10s_ids values ('c2', test_helpers.create_active_test_contract('w10s-o2@local.test', pg_temp.id('s2'), pg_temp.id('w2'), 'w10s-w2@local.test',
                                                                           test_helpers.manila_today() + 3));
select set_config('fx.notes', (select count(*) from public.notifications)::text, true);
select is(public.refresh_worker_owner_relationships(test_helpers.manila_today() + 5), 1, 'w10_refresh_all_matches_live_derivation');
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o2')),
          test_helpers.relationship_live(pg_temp.id('w2'), pg_temp.id('o2'), test_helpers.manila_today() + 5), 'w10_refresh_all_matches_live_derivation');
select is((select count(*)::int from public.notifications) - current_setting('fx.notes')::int, 0, 'w10_no_notifications_for_relationship_changes');
select is(public.refresh_worker_owner_relationships(), 1, 'w10_refresh_all_matches_live_derivation');
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o2'))
          || ',' || (select count(*) from public.worker_owner_relationships r
                     where test_helpers.relationship_row(r.worker_id, r.owner_id) <> test_helpers.relationship_live(r.worker_id, r.owner_id)),
          'active,contract_active,1,0', 'w10_refresh_all_matches_live_derivation');
select is((select count(*)::int from public.notifications where category ~ 'relationship' or subject_type ~ 'relationship'
           or idempotency_key ~ 'relationship'), 0, 'w10_no_notifications_for_relationship_changes');

-- ---------- a stale "since" date is null (TEST-ONLY time shift: the end date is moved into the past with the W9
--            W9 guard and the W10 sync trigger skipped for one statement via session_replication_role = replica,
--            superuser, inside this transaction) ----------
set local session_replication_role = replica;
update public.worker_contracts set start_date = test_helpers.manila_today() - 10, end_date = test_helpers.manila_today() - 1
where id = pg_temp.id('c2');
set local session_replication_role = origin;
select test_helpers.act_as_worker('w10s-w2@local.test');
select is((select status || ',' || (status_changed_at is null) from public.my_owner_relationships()), 'ended,true',
          'w10_stale_since_date_is_null');
select test_helpers.act_as_owner('w10s-o2@local.test');
select is((select status || ',' || (status_changed_at is null) from public.owner_worker_relationships()), 'ended,true',
          'w10_stale_since_date_is_null');
select test_helpers.act_as_worker('w10s-w1@local.test');
select is((select status || ',' || (status_changed_at is not null) from public.my_owner_relationships()), 'ended,true',
          'w10_stale_since_date_is_null');
select test_helpers.act_as_service();
select is(split_part(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o2')), ',', 1), 'active', 'w10_stale_since_date_is_null');

-- ---------- owner_removed is terminal ----------
insert into w10s_ids values ('c3', test_helpers.create_active_test_contract('w10s-o3@local.test', pg_temp.id('s3'), pg_temp.id('w3'), 'w10s-w3@local.test'));
insert into w10s_ids values ('rel3', (select id from public.worker_owner_relationships where worker_id = pg_temp.id('w3')));
delete from auth.users where id = pg_temp.id('o3');
select is(pg_temp.trail('w3'), array['created:pending_start:worker', 'status_changed:active:owner', 'owner_removed:owner_removed:trusted_session'],
          'w10_owner_removed_row_is_terminal');
select set_config('washlink.owner_relationship_write', pg_temp.id('w3')::text || ':', true);
select is(array[test_helpers.attempt(format('update public.worker_owner_relationships set status = ''ended'', status_reason = ''contract_terminated'', ended_at = now() where id = %L', pg_temp.id('rel3'))),
                test_helpers.attempt(format('update public.worker_owner_relationships set owner_id = %L where id = %L', pg_temp.id('o1'), pg_temp.id('rel3'))),
                test_helpers.attempt(format('delete from public.worker_owner_relationships where id = %L', pg_temp.id('rel3')))],
          array_fill('42501'::text, array[3]), 'w10_owner_removed_row_is_terminal');
select set_config('washlink.owner_relationship_write', '', true);
select is(public.refresh_worker_owner_relationships() || ',' || (select status || ',' || revision from public.worker_owner_relationships where id = pg_temp.id('rel3')),
          '1,owner_removed,3', 'w10_owner_removed_row_is_terminal');

select * from finish();
rollback;
