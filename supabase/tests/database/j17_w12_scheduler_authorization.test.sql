-- J17 (W12): authorization of the W12 objects (W12 PLAN 3.2..3.6, P84, P85). Both tables have RLS on, deny-all policies
-- and no privilege for anon, authenticated or service_role; every internal W12 function (registry and state guards,
-- try-lock, batches, pending backlog, runner) is closed to every client role; the job status read is super_admin only
-- and returns counts only (no ids or names); every W12 definer function pins `public, pg_temp`; no migration created
-- pg_cron or a cron job (registration is a human step); the job state guard refuses direct writes, also from a trusted
-- session, except the runbook change of enabled / batch_size (and the runner flag needs a trusted session, fix cycle 1
-- N2). Local Docker stack only; backdating is a TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temporary table j17a_internal (sig) on commit drop as select unnest(array[
  'notification_categories_guard_write()', 'notifications_guard_registered_category()', 'workforce_scheduled_jobs_guard_write()',
  'worker_owner_pair_try_lock(uuid, uuid)', 'expire_worker_contracts_batch(uuid, integer)', 'refresh_worker_owner_relationships_batch(uuid, uuid, integer)',
  'workforce_scheduled_job_pending(text)', 'run_workforce_scheduled_job(text)']);
create temporary table j17a_functions on commit drop as
  select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p
  where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W12:%';
grant all on j17a_internal, j17a_functions to public;

-- ---------- fixtures ----------
create temporary table j17a_ids (label text primary key, id uuid) on commit drop;
grant all on j17a_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17a_ids where label = p_label $$;
insert into j17a_ids values ('a1', test_helpers.create_super_admin('j17a-a1@local.test'));
insert into j17a_ids values ('cu', test_helpers.create_customer('j17a-cu@local.test'));
insert into j17a_ids values ('o1', test_helpers.create_owner('j17a-o1@local.test'));
insert into j17a_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17a-w1@local.test')));
insert into j17a_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j17a_ids values ('k1', test_helpers.create_active_test_contract('j17a-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17a-w1@local.test',
                                                                            test_helpers.manila_today()));
select test_helpers.backdate_test_worker_contract(pg_temp.id('k1'), 2);
create function pg_temp.admin_rows() returns text language sql as $$
  select coalesce(string_agg(j.job_key || ':' || coalesce(j.pending_count::text, 'null'), ',' order by j.job_key), '-') from public.admin_workforce_scheduled_jobs() j $$;

-- ---------- tables ----------
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relrowsecurity
           and c.relname in ('notification_categories', 'workforce_scheduled_jobs')), 2, 'j17_w12_tables_rls_enabled_no_client_privileges');
select is((select count(*)::int from unnest(array['notification_categories', 'workforce_scheduled_jobs']) t, unnest(array['anon', 'authenticated', 'service_role']) r,
                  unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
           where has_table_privilege(r, 'public.' || t, p)), 0, 'j17_w12_tables_rls_enabled_no_client_privileges');
select is((select string_agg(tablename || ':' || cmd || ':' || coalesce(qual, with_check), ',' order by tablename, cmd) from pg_policies
           where schemaname = 'public' and tablename in ('notification_categories', 'workforce_scheduled_jobs')),
          'notification_categories:DELETE:false,notification_categories:INSERT:false,notification_categories:SELECT:false,notification_categories:UPDATE:false,'
          || 'workforce_scheduled_jobs:DELETE:false,workforce_scheduled_jobs:INSERT:false,workforce_scheduled_jobs:SELECT:false,workforce_scheduled_jobs:UPDATE:false',
          'j17_w12_tables_rls_enabled_no_client_privileges');
select test_helpers.act_as_admin('j17a-a1@local.test');
select is(test_helpers.attempt('select count(*) from public.workforce_scheduled_jobs') || ','
          || test_helpers.attempt($$ update public.workforce_scheduled_jobs set enabled = false $$), '42501,42501',
          'j17_w12_tables_rls_enabled_no_client_privileges');
select test_helpers.act_as_service();

-- ---------- internal functions ----------
select is((select count(*)::int from j17a_internal), (select count(*)::int from j17a_functions where proname <> 'admin_workforce_scheduled_jobs'),
          'j17_w12_internal_functions_not_client_executable');
select is((select count(*)::int from j17a_internal i, unnest(array['public', 'anon', 'authenticated', 'service_role']) r
           where r <> 'public' and has_function_privilege(r, 'public.' || i.sig, 'execute')), 0, 'j17_w12_internal_functions_not_client_executable');
select is((select count(*)::int from j17a_internal i, aclexplode(coalesce((select p.proacl from pg_proc p where p.oid = ('public.' || i.sig)::regprocedure),
                                                                           acldefault('f', (select p.proowner from pg_proc p where p.oid = ('public.' || i.sig)::regprocedure)))) a
           where a.grantee = 0), 0, 'j17_w12_internal_functions_not_client_executable');
select test_helpers.act_as_owner('j17a-o1@local.test');
select is(array[test_helpers.attempt($$ select public.run_workforce_scheduled_job('worker_contract_expiry') $$),
                test_helpers.attempt('select public.expire_worker_contracts_batch(null, 25)'),
                test_helpers.attempt('select public.refresh_worker_owner_relationships_batch(null, null, 50)'),
                test_helpers.attempt(format('select public.worker_owner_pair_try_lock(%L, %L)', pg_temp.id('w1'), pg_temp.id('o1'))),
                test_helpers.attempt($$ select public.workforce_scheduled_job_pending('worker_contract_expiry') $$)],
          array['42501', '42501', '42501', '42501', '42501'], 'j17_w12_internal_functions_not_client_executable');
select test_helpers.act_as_service();
select is(x.status_unchanged, true, 'j17_w12_internal_functions_not_client_executable')
from (select (select status from public.worker_contracts where id = pg_temp.id('k1')) = 'active' as status_unchanged) x;

-- ---------- the job status read: super_admin only, counts only ----------
select test_helpers.act_as_admin('j17a-a1@local.test');
select is(pg_temp.admin_rows(), 'certification_expiry_notices:0,owner_relationship_refresh:null,worker_contract_expiry:1',
          'j17_w12_admin_scheduled_jobs_super_admin_only');
select test_helpers.act_as_owner('j17a-o1@local.test');
select is(pg_temp.admin_rows(), '-', 'j17_w12_admin_scheduled_jobs_super_admin_only');
select test_helpers.act_as_worker('j17a-w1@local.test');
select is(pg_temp.admin_rows(), '-', 'j17_w12_admin_scheduled_jobs_super_admin_only');
select test_helpers.act_as_customer('j17a-cu@local.test');
select is(pg_temp.admin_rows(), '-', 'j17_w12_admin_scheduled_jobs_super_admin_only');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.admin_workforce_scheduled_jobs()'), '42501', 'j17_w12_admin_scheduled_jobs_super_admin_only');
select test_helpers.act_as_service();
select is(array[has_function_privilege('authenticated', 'public.admin_workforce_scheduled_jobs()', 'execute'),
                has_function_privilege('anon', 'public.admin_workforce_scheduled_jobs()', 'execute'),
                has_function_privilege('service_role', 'public.admin_workforce_scheduled_jobs()', 'execute')], array[true, false, false],
          'j17_w12_admin_scheduled_jobs_super_admin_only');
select is(pg_get_function_result('public.admin_workforce_scheduled_jobs()'::regprocedure),
          'TABLE(job_key text, enabled boolean, batch_size integer, last_started_at timestamp with time zone, last_finished_at timestamp with time zone, '
          || 'last_outcome text, last_processed_count integer, last_changed_count integer, last_skipped_locked_count integer, '
          || 'last_pass_completed_at timestamp with time zone, run_count bigint, pending_count integer, last_skipped_failed_count integer, '
          || 'last_failed_sqlstates text[])', 'j17_w12_admin_read_has_no_ids_or_names');
select is((select count(*)::int from unnest(regexp_split_to_array(pg_get_function_result('public.admin_workforce_scheduled_jobs()'::regprocedure), ',\s*')) c
           where c ~* '(uuid|_id\M|name|email|phone|cursor)'), 0, 'j17_w12_admin_read_has_no_ids_or_names');

-- ---------- definer functions pin public, pg_temp ----------
select is((select count(*)::int from j17a_functions), 9, 'j17_w12_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from j17a_functions where not prosecdef or proconfig is distinct from array['search_path=public, pg_temp']), 0,
          'j17_w12_definer_functions_pin_pg_temp_last');

-- ---------- no migration created pg_cron or a cron job ----------
select is((select count(*)::int from pg_extension where extname = 'pg_cron') + (case when to_regclass('cron.job') is null then 0 else 1 end), 0,
          'j17_w12_no_migration_creates_extension_or_cron_job');

-- ---------- the job state guard ----------
select is(array[test_helpers.attempt($$ update public.workforce_scheduled_jobs set last_outcome = 'completed', run_count = 99 where job_key = 'worker_contract_expiry' $$),
                test_helpers.attempt($$ update public.workforce_scheduled_jobs set cursor_worker_id = gen_random_uuid(), cursor_owner_id = gen_random_uuid() $$),
                test_helpers.attempt($$ insert into public.workforce_scheduled_jobs (job_key, batch_size) values ('worker_contract_expiry', 5) $$),
                test_helpers.attempt('delete from public.workforce_scheduled_jobs'), test_helpers.attempt('truncate public.workforce_scheduled_jobs'),
                test_helpers.attempt($$ update public.workforce_scheduled_jobs set job_key = 'worker_contract_expiry' where job_key = 'certification_expiry_notices' $$)],
          array['42501', '42501', '42501', '42501', '42501', '42501'], 'j17_w12_state_guard_refuses_direct_update');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('a1'), 'role', 'authenticated')::text, true);
select is(test_helpers.attempt($$ update public.workforce_scheduled_jobs set enabled = false where job_key = 'worker_contract_expiry' $$), '42501',
          'j17_w12_state_guard_refuses_direct_update');
-- Fix cycle 1 N2: the runner flag alone is not enough; the runner path also needs a trusted session.
select set_config('washlink.scheduled_job_state_write', 'worker_contract_expiry', true);
select is(test_helpers.attempt($$ update public.workforce_scheduled_jobs set run_count = 99 where job_key = 'worker_contract_expiry' $$), '42501',
          'j17_w12_state_guard_runner_flag_requires_trusted_session');
select set_config('washlink.scheduled_job_state_write', '', true);
select test_helpers.act_as_service();
select is(test_helpers.attempt($$ update public.workforce_scheduled_jobs set enabled = false, batch_size = 10 where job_key = 'worker_contract_expiry' $$),
          'succeeded', 'j17_w12_state_guard_refuses_direct_update');
select is((select enabled || ':' || batch_size || ':' || run_count from public.workforce_scheduled_jobs where job_key = 'worker_contract_expiry'),
          'false:10:0', 'j17_w12_state_guard_refuses_direct_update');

select * from finish();
rollback;
