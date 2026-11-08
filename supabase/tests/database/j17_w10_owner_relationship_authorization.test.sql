-- J17 (W10): owner relationship and workforce policy authorization (P55, P61; D-38). RLS on with SELECT-only grants,
-- deny-all write policies, no direct write for any role (a trusted session cannot insert or edit a relationship),
-- internal functions closed to every client role, RPCs closed to anon and service_role, every W10 function pinned to
-- `public, pg_temp`, no Realtime publication; the other owner / worker, super_admin and customers read nothing; the
-- owner read has no progress or other-owner data. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create temporary table j17w_rpcs (sig) on commit drop as select unnest(array['set_workforce_policy_value(text, integer, integer, text)',
  'my_owner_relationship_progress()', 'my_owner_relationships()', 'owner_worker_relationships()']);
create temporary table j17w_functions on commit drop as
  select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p
  where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W10:%';
grant all on j17w_rpcs, j17w_functions to public;

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17w-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j17w-cu@local.test')::text, true);
create temporary table j17w_ids (label text primary key, id uuid) on commit drop;
grant all on j17w_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17w_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.reads() returns text language sql as $$
  select format('table=%s,progress=%s,mine=%s,owner=%s', (select count(*) from public.worker_owner_relationships),
                (select count(*) from public.my_owner_relationship_progress()), (select count(*) from public.my_owner_relationships()),
                (select count(*) from public.owner_worker_relationships())) $$;
create function pg_temp.writes() returns text[] language sql as $$
  select array[test_helpers.attempt(format($i$ insert into public.worker_owner_relationships (worker_id, owner_id, owner_name_snapshot, worker_name_snapshot,
                 status, status_reason, qualifying_contract_count, first_accepted_at) values (%L, %L, 'X', 'X', 'active', 'contract_active', 1, now()) $i$,
                 pg_temp.id('w2'), pg_temp.id('o2'))),
               test_helpers.attempt('update public.worker_owner_relationships set qualifying_contract_count = 5 where status = ''active'''),
               test_helpers.attempt('delete from public.worker_owner_relationships'),
               test_helpers.attempt('insert into public.workforce_policies (policy_key, integer_value, default_value, description) values (''minimum_distinct_owners'', 1, 3, ''A forged local test policy row.'')'),
               test_helpers.attempt('update public.workforce_policies set integer_value = 1'),
               test_helpers.attempt('delete from public.workforce_policies')] $$;
insert into j17w_ids select 'o' || n, test_helpers.create_owner('j17w-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j17w_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j17w-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j17w_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 2) n;
select test_helpers.create_active_test_contract('j17w-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17w-w1@local.test'),
       test_helpers.create_active_test_contract('j17w-o2@local.test', pg_temp.id('s2'), pg_temp.id('w1'), 'j17w-w1@local.test');

-- ---------- tables and policies ----------
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
           and relname in ('workforce_policies', 'worker_owner_relationships')), 2, 'j17_w10_tables_rls_enabled_and_no_client_write_privileges');
select is((select array_agg(g.grantee || ':' || g.table_name || ':' || g.privilege_type order by g.table_name) from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name in ('workforce_policies', 'worker_owner_relationships')
             and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
          array['authenticated:worker_owner_relationships:SELECT', 'authenticated:workforce_policies:SELECT'],
          'j17_w10_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('workforce_policies', 'worker_owner_relationships')
           and cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(qual, with_check) = 'false' and roles = array['authenticated']::name[]), 6,
          'j17_w10_write_policies_deny_all');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('workforce_policies', 'worker_owner_relationships')
           and (cmd = 'ALL' or (cmd <> 'SELECT' and coalesce(qual, with_check, '') <> 'false') or (cmd = 'SELECT' and roles <> array['authenticated']::name[]))),
          0, 'j17_w10_write_policies_deny_all');

-- ---------- direct writes ----------
select test_helpers.act_as_owner('j17w-o1@local.test');
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w10_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_worker('j17w-w1@local.test');
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w10_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_admin('j17w-a1@local.test');
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w10_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('role', 'service_role', true);
select throws_ok('delete from public.worker_owner_relationships', '42501', null, 'j17_w10_direct_writes_refused_for_every_role_including_trusted_insert');
select set_config('role', 'none', true);
select test_helpers.act_as_service();
select is((pg_temp.writes())[1:3], array_fill('42501'::text, array[3]), 'j17_w10_direct_writes_refused_for_every_role_including_trusted_insert');
select is((select count(*)::int || ',' || sum(revision) from public.worker_owner_relationships), '2,4',
          'j17_w10_direct_writes_refused_for_every_role_including_trusted_insert');

-- ---------- functions ----------
select is((select count(*)::int from j17w_functions), 16, 'j17_w10_internal_functions_not_client_executable');
select is((select count(*)::int from j17w_functions f, unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
           where f.oid not in (select to_regprocedure('public.' || sig) from j17w_rpcs) and has_function_privilege(r.role_name, f.oid, 'execute')), 0,
          'j17_w10_internal_functions_not_client_executable');
select is((select count(*)::int from j17w_rpcs r where to_regprocedure('public.' || r.sig) in (select oid from j17w_functions)
           and has_function_privilege('authenticated', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('anon', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('service_role', to_regprocedure('public.' || r.sig), 'execute')), 4, 'j17_w10_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select is(array[test_helpers.attempt('select * from public.my_owner_relationship_progress()'), test_helpers.attempt('select * from public.owner_worker_relationships()'),
                test_helpers.attempt('select * from public.worker_owner_relationships'), test_helpers.attempt('select * from public.workforce_policies')],
          array_fill('42501'::text, array[4]), 'j17_w10_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from j17w_functions where not prosecdef or not coalesce(proconfig = array['search_path=public, pg_temp'], false)), 0,
          'j17_w10_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
           and tablename in ('workforce_policies', 'worker_owner_relationships')), 0, 'j17_w10_tables_not_in_realtime_publication');

-- ---------- reads ----------
select test_helpers.act_as_worker('j17w-w2@local.test');
select is(pg_temp.reads(), 'table=0,progress=1,mine=0,owner=0', 'j17_w10_other_owner_and_worker_read_nothing');
select test_helpers.act_as_owner('j17w-o1@local.test');
select is(pg_temp.reads() || ',' || (select string_agg(worker_name || ':' || status || ':' || contracts_with_you_count, ';') from public.owner_worker_relationships())
          || ',' || (select count(*) from public.worker_owner_relationships where owner_id <> pg_temp.id('o1')),
          'table=0,progress=0,mine=0,owner=1,Local Test Worker:active:1,0', 'j17_w10_other_owner_and_worker_read_nothing');
select is(test_helpers.attempt('select counts_toward_goal, qualifying_contract_count from public.worker_owner_relationships')
          || ',' || (select count(*) from public.worker_owner_relationships), 'succeeded,0',
          'j17_w10_owner_direct_select_of_relationships_returns_nothing');
select test_helpers.act_as_service();
select is((select array_agg(a order by a) from pg_proc p, unnest(p.proargnames) a where p.oid = 'public.owner_worker_relationships()'::regprocedure),
          array['contracts_with_you_count', 'first_accepted_at', 'relationship_id', 'status', 'status_changed_at', 'status_reason', 'worker_id', 'worker_name'],
          'j17_w10_owner_read_has_no_progress_or_other_owner_columns');
select test_helpers.act_as_admin('j17w-a1@local.test');
select is(pg_temp.reads() || ';' || (select count(*) from public.workforce_policies), 'table=0,progress=0,mine=0,owner=0;1',
          'j17_w10_super_admin_and_customer_read_no_relationships');
select test_helpers.act_as_customer('j17w-cu@local.test');
select is(pg_temp.reads(), 'table=0,progress=0,mine=0,owner=0', 'j17_w10_super_admin_and_customer_read_no_relationships');

-- ---------- workforce_policies: super_admin-only select (P61); workers read the minimum through the RPC ----------
select is((select count(*)::int from public.workforce_policies), 0, 'j17_w10_owner_worker_customer_cannot_select_workforce_policies');
select test_helpers.act_as_owner('j17w-o1@local.test');
select is((select count(*)::int from public.workforce_policies), 0, 'j17_w10_owner_worker_customer_cannot_select_workforce_policies');
select test_helpers.act_as_service();
select set_config('fx.minimum', (select integer_value from public.workforce_policies)::text, true);   -- trusted writes() above may change it
select test_helpers.act_as_worker('j17w-w1@local.test');
select is((select count(*)::int from public.workforce_policies) || ',' || (select minimum_distinct_owners from public.my_owner_relationship_progress()),
          '0,' || current_setting('fx.minimum'), 'j17_w10_owner_worker_customer_cannot_select_workforce_policies');
select test_helpers.act_as_service();
select is((select count(*)::int from unnest(array['public.worker_contracts', 'public.workforce_policies', 'public.worker_owner_relationships']) t,
             unnest(array['INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege('service_role', t, p)), 0,
          'j17_w10_service_role_has_no_write_privileges');

select * from finish();
rollback;
