-- J17 (W9): worker contract tables and functions - RLS on with SELECT-only grants, deny-all write policies, internal
-- functions (writers, sealer, validator, expiry, guards, producers) closed to every client role, RPCs closed to anon
-- and service_role, every W9 function pinned to `public, pg_temp`, no Realtime publication, no fee / pay amount /
-- signature columns or parameters. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table j17n_tables (t) on commit drop as select unnest(array['contract_acknowledgement_texts', 'contract_problem_term_rules',
  'worker_contracts', 'contract_versions', 'contract_version_clauses', 'contract_version_flags', 'contract_acceptances', 'retained_job_application_records']);
create temporary table j17n_rpcs (sig) on commit drop as select unnest(array['create_worker_contract_draft(uuid, uuid, uuid, text, date, date, jsonb)',
  'save_worker_contract_draft(uuid, integer, text, date, date, jsonb, jsonb, jsonb)', 'send_worker_contract_version(uuid, integer, text, text, integer)',
  'withdraw_worker_contract_version(uuid, uuid)', 'discard_worker_contract_draft(uuid, uuid)', 'create_worker_contract_amendment(uuid, integer, uuid)',
  'activate_worker_contract(uuid, integer)', 'accept_worker_contract_version(uuid, uuid, text, text, text)',
  'decline_worker_contract_version(uuid, uuid, text)', 'terminate_worker_contract(uuid, integer, text)', 'owner_worker_contracts()', 'my_worker_contracts()',
  'owner_contract_eligible_workers()', 'worker_contract_versions(uuid)', 'worker_contract_version_document(uuid)', 'worker_contract_version_clauses(uuid)',
  'worker_contract_flag_notices()', 'worker_contract_version_flags(uuid)', 'worker_contract_version_changes(uuid)', 'worker_contract_acceptances(uuid)',
  'preview_worker_contract_draft(uuid)', 'my_retained_application_records()', 'worker_contract_effective_status(text, date)']);
create temporary table j17n_w9_functions on commit drop as
  select p.oid, p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig, p.proargnames, p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W9:%';
grant all on j17n_tables, j17n_rpcs, j17n_w9_functions to public;

-- ---------- tables ----------
select is((select count(*)::int from pg_class c join j17n_tables x on x.t = c.relname where c.relnamespace = 'public'::regnamespace and c.relrowsecurity),
          8, 'j17_w9_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from information_schema.role_table_grants g join j17n_tables x on x.t = g.table_name
           where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
             and (g.privilege_type <> 'SELECT' or g.grantee <> 'authenticated')), 0, 'j17_w9_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from information_schema.role_table_grants g join j17n_tables x on x.t = g.table_name
           where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'), 8,
          'j17_w9_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies p join j17n_tables x on x.t = p.tablename
           where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(p.qual, p.with_check) = 'false'), 24,
          'j17_w9_write_policies_deny_all');
select is((select count(*)::int from pg_policies p join j17n_tables x on x.t = p.tablename
           where p.schemaname = 'public' and (p.cmd = 'ALL' or (p.cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(p.qual, p.with_check, '') <> 'false'))), 0,
          'j17_w9_write_policies_deny_all');
select is((select count(*)::int from pg_policies p join j17n_tables x on x.t = p.tablename where p.schemaname = 'public' and p.cmd = 'SELECT'
           and not (p.roles = array['authenticated']::name[])), 0, 'j17_w9_write_policies_deny_all');

-- ---------- functions ----------
select is((select count(*)::int from j17n_rpcs r where to_regprocedure('public.' || r.sig) in (select oid from j17n_w9_functions)), 23,
          'j17_w9_internal_functions_not_client_executable');
select is((select count(*)::int from j17n_w9_functions f where f.oid not in (select to_regprocedure('public.' || sig) from j17n_rpcs)), 34,
          'j17_w9_internal_functions_not_client_executable');
select is((select count(*)::int from j17n_w9_functions f, unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
           where f.oid not in (select to_regprocedure('public.' || sig) from j17n_rpcs) and has_function_privilege(r.role_name, f.oid, 'execute')), 0,
          'j17_w9_internal_functions_not_client_executable');
select test_helpers.act_as_service();
select set_config('fx.o1', test_helpers.create_owner('j17n-o1@local.test')::text, true);
select test_helpers.act_as_owner('j17n-o1@local.test');
select is(array[test_helpers.attempt('select public.expire_worker_contracts(null)'), test_helpers.attempt(format('select public.worker_contract_seal_version(%L)', gen_random_uuid())),
                test_helpers.attempt(format('select public.validate_worker_contract_version(%L)', gen_random_uuid())),
                test_helpers.attempt('select * from public.contract_problem_term_matches(''deposit'')'),
                test_helpers.attempt(format('select public.worker_contract_close_open_versions(%L)', gen_random_uuid()))],
          array_fill('42501'::text, array[5]), 'j17_w9_internal_functions_not_client_executable');
select test_helpers.act_as_service();
select is((select count(*)::int from j17n_rpcs r where has_function_privilege('authenticated', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('anon', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('service_role', to_regprocedure('public.' || r.sig), 'execute')), 23, 'j17_w9_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select is(array[test_helpers.attempt('select * from public.owner_worker_contracts()'),
                test_helpers.attempt(format($$ select public.terminate_worker_contract(%L, 1, 'Anonymous ending attempt.') $$, gen_random_uuid())),
                test_helpers.attempt(format($$ select public.create_worker_contract_draft(%L, %L, %L, 'employee', current_date) $$,
                                            gen_random_uuid(), gen_random_uuid(), gen_random_uuid()))],
          array_fill('42501'::text, array[3]), 'j17_w9_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from j17n_w9_functions where not coalesce(proconfig = array['search_path=public, pg_temp'], false)), 0,
          'j17_w9_definer_functions_pin_pg_temp_last');
select is((select array_agg(f.proname::text order by f.proname) from j17n_w9_functions f join j17n_rpcs r on to_regprocedure('public.' || r.sig) = f.oid
           where not f.prosecdef),
          array['my_retained_application_records', 'my_worker_contracts', 'owner_worker_contracts', 'worker_contract_acceptances',
                'worker_contract_effective_status', 'worker_contract_flag_notices', 'worker_contract_version_changes', 'worker_contract_version_clauses',
                'worker_contract_version_document', 'worker_contract_version_flags', 'worker_contract_versions'], 'j17_w9_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables pt join j17n_tables x on x.t = pt.tablename
           where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'), 0, 'j17_w9_tables_not_in_realtime_publication');
select is((select count(*)::int from information_schema.columns c join j17n_tables x on x.t = c.table_name
           where c.table_schema = 'public' and c.column_name ~* '(fee|charge|deduct|price|cost|pay|amount|salary|wage|signature|signed|ip_addr|device|user_agent)')
          + (select count(*)::int from j17n_w9_functions f, unnest(coalesce(f.proargnames, '{}')) arg
             where arg ~* '(fee|charge|deduct|price|cost|amount|salary|wage|signature|signed)'), 0, 'j17_w9_no_fee_signature_or_amount_columns');

select * from finish();
rollback;
