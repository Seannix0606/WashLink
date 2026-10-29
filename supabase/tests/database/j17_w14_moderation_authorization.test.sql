-- J17 (W14): authorization of the W14 objects (W14 PLAN P73, P77, P78). RLS on with SELECT-only grants and NO raw read for
-- any client role incl. super_admin, deny-all select and write policies, no direct write for any role (a trusted session
-- without the transaction flag is refused too), internal functions closed to every client role, RPCs closed to anon and
-- service_role, every W14 definer function pinned to `public, pg_temp`, no Realtime publication, every super_admin
-- function refusing owners, workers and customers, no report data in the owner read and no W14 function writing
-- job_applications or opening content. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create temporary table j17m_tables (t) on commit drop as
  select unnest(array['job_opening_moderation_cases', 'job_opening_reports', 'job_opening_moderation_actions', 'admin_access_records']);
create temporary table j17m_rpcs (sig) on commit drop as select unnest(array['job_opening_report_max_open_per_worker()',
  'job_opening_report_max_per_opening()', 'report_job_opening(uuid, text, text)', 'withdraw_job_opening_report(uuid)',
  'moderate_job_opening(uuid, integer, text, text, text, text)', 'submit_job_opening_changes(uuid, text)', 'my_job_opening_reports()',
  'owner_job_opening_moderation()', 'admin_job_opening_moderation_queue(text)', 'admin_job_opening_moderation_case(uuid)',
  'admin_unreviewed_approved_shops()', 'rereview_approved_shop(uuid, text, text)', 'admin_worker_relationships(uuid, text, text)',
  'admin_owner_relationships(uuid, text, text)', 'oversight_flag_open_days()', 'oversight_flag_read_count()', 'my_workforce_activity(bigint, integer)',
  'admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer)', 'admin_oversight_access_flags()',
  'admin_moderation_summary()']);
create temporary table j17m_functions on commit drop as
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc from pg_proc p
  where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W14:%';
grant all on j17m_tables, j17m_rpcs, j17m_functions to public;

-- ---------- fixtures ----------
create temporary table j17m_ids (label text primary key, id uuid) on commit drop;
grant all on j17m_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17m_ids where label = p_label $$;
insert into j17m_ids values ('a1', test_helpers.create_super_admin('j17m-a1@local.test'));
insert into j17m_ids values ('cu', test_helpers.create_customer('j17m-cu@local.test'));
insert into j17m_ids values ('o1', test_helpers.create_owner('j17m-o1@local.test'));
insert into j17m_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17m-w1@local.test')));
insert into j17m_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j17m_ids values ('j1', test_helpers.publish_job_opening(test_helpers.create_job_opening(pg_temp.id('s1'), 'Local test reported opening')));
insert into j17m_ids values ('r1', test_helpers.report_test_job_opening(pg_temp.id('j1'), 'j17m-w1@local.test'));
insert into j17m_ids values ('c1', (select case_id from public.job_opening_reports where id = pg_temp.id('r1')));
select test_helpers.act_as_admin('j17m-a1@local.test');
select (public.moderate_job_opening(pg_temp.id('c1'), 1, 'pause', 'age_requirement', 'Remove the age limit from this posting, please.', null)).status;
select public.admin_owner_relationships(pg_temp.id('o1'), 'policy_monitoring', 'Local test lookup for the authorization file') is not null as looked_up;
select test_helpers.act_as_service();
create function pg_temp.writes() returns text[] language sql as $$
  select array[
    test_helpers.attempt(format($i$ insert into public.job_opening_moderation_cases (job_opening_id, opening_title_snapshot) values (%L, 'Forged') $i$, pg_temp.id('j1'))),
    test_helpers.attempt(format($i$ update public.job_opening_moderation_cases set status = 'lifted' where id = %L $i$, pg_temp.id('c1'))),
    test_helpers.attempt('delete from public.job_opening_moderation_cases'),
    test_helpers.attempt(format($i$ insert into public.job_opening_reports (case_id, job_opening_id, reporter_id, category, statement, reported_snapshot,
      opening_status_at_report) values (%L, %L, %L, 'other', 'A forged local test report statement', '{}', 'published') $i$, pg_temp.id('c1'), pg_temp.id('j1'), pg_temp.id('w1'))),
    test_helpers.attempt(format($i$ update public.job_opening_reports set statement = 'An edited local test report statement' where id = %L $i$, pg_temp.id('r1'))),
    test_helpers.attempt('delete from public.job_opening_reports'),
    test_helpers.attempt(format($i$ insert into public.job_opening_moderation_actions (case_id, action) values (%L, 'lifted') $i$, pg_temp.id('c1'))),
    test_helpers.attempt($i$ update public.job_opening_moderation_actions set action = 'lifted' $i$),
    test_helpers.attempt('delete from public.job_opening_moderation_actions'),
    test_helpers.attempt(format($i$ insert into public.admin_access_records (access_kind, subject_profile_id, purpose, note)
      values ('owner_relationships', %L, 'policy_monitoring', 'A forged local test access record') $i$, pg_temp.id('o1'))),
    test_helpers.attempt($i$ update public.admin_access_records set row_count = 9 $i$),
    test_helpers.attempt('delete from public.admin_access_records')] $$;
create function pg_temp.admin_calls() returns text[] language sql as $$
  select array[
    test_helpers.attempt(format('select public.moderate_job_opening(%L, 2, %L, null, null, null)', pg_temp.id('c1'), 'lift')),
    test_helpers.attempt(format('select public.admin_job_opening_moderation_case(%L)', pg_temp.id('c1'))),
    test_helpers.attempt(format('select public.rereview_approved_shop(%L, %L)', pg_temp.id('s1'), 'confirm_approval')),
    test_helpers.attempt(format('select public.admin_worker_relationships(%L, %L, %L)', pg_temp.id('w1'), 'policy_monitoring', 'A note that is long enough here')),
    test_helpers.attempt(format('select public.admin_owner_relationships(%L, %L, %L)', pg_temp.id('o1'), 'policy_monitoring', 'A note that is long enough here')),
    test_helpers.attempt('select * from public.admin_workforce_audit_log()'),
    (select count(*) from public.admin_job_opening_moderation_queue('active'))::text,
    (select count(*) from public.admin_unreviewed_approved_shops())::text,
    (select count(*) from public.admin_oversight_access_flags())::text,
    (select count(*) from public.admin_moderation_summary())::text,
    ((select count(*) from public.job_opening_moderation_cases) + (select count(*) from public.job_opening_reports)
     + (select count(*) from public.job_opening_moderation_actions) + (select count(*) from public.admin_access_records))::text] $$;

-- ---------- tables and policies ----------
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity and relname in (select t from j17m_tables)), 4,
          'j17_w14_tables_rls_enabled_and_no_client_write_privileges');
select is((select array_agg(g.grantee || ':' || g.table_name || ':' || g.privilege_type order by g.table_name) from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name in (select t from j17m_tables) and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
          array['authenticated:admin_access_records:SELECT', 'authenticated:job_opening_moderation_actions:SELECT',
                'authenticated:job_opening_moderation_cases:SELECT', 'authenticated:job_opening_reports:SELECT'],
          'j17_w14_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in (select t from j17m_tables)
           and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') and coalesce(qual, with_check) = 'false' and roles = array['authenticated']::name[]), 16,
          'j17_w14_select_and_write_policies_deny_all');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in (select t from j17m_tables)
           and coalesce(qual, with_check, '') <> 'false'), 0, 'j17_w14_select_and_write_policies_deny_all');

-- ---------- direct writes ----------
select set_config('fx.refused', array_fill('42501'::text, array[12])::text, true);
select test_helpers.act_as_owner('j17m-o1@local.test');
select is(pg_temp.writes(), current_setting('fx.refused')::text[], 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_worker('j17m-w1@local.test');
select is(pg_temp.writes(), current_setting('fx.refused')::text[], 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_admin('j17m-a1@local.test');
select is(pg_temp.writes(), current_setting('fx.refused')::text[], 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('role', 'service_role', true);
select throws_ok('delete from public.job_opening_moderation_cases', '42501', null, 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select throws_ok($$ update public.job_opening_reports set status = 'withdrawn' $$, '42501', null,
                 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select throws_ok($$ insert into public.admin_access_records (access_kind, subject_profile_id, purpose, note)
                    values ('owner_relationships', gen_random_uuid(), 'policy_monitoring', 'A forged local test access record') $$, '42501', null,
                 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select set_config('role', 'none', true);
select test_helpers.act_as_service();
select is(pg_temp.writes(), current_setting('fx.refused')::text[], 'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');
select is((select count(*) || ',' || min(status) || ',' || min(revision) from public.job_opening_moderation_cases where id = pg_temp.id('c1')) || ';'
          || (select count(*) || ',' || min(status) from public.job_opening_reports) || ';' || (select count(*) from public.job_opening_moderation_actions)
          || ';' || (select count(*) from public.admin_access_records), '1,paused_by_washlink,2;1,closed;1;1',
          'j17_w14_direct_writes_refused_for_every_role_including_trusted_insert');

-- ---------- functions ----------
select is((select count(*)::int from j17m_functions), 36, 'j17_w14_internal_functions_not_client_executable');
select is((select count(*)::int from j17m_functions f, unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
           where f.oid not in (select to_regprocedure('public.' || sig) from j17m_rpcs) and has_function_privilege(r.role_name, f.oid, 'execute')), 0,
          'j17_w14_internal_functions_not_client_executable');
select test_helpers.act_as_worker('j17m-w1@local.test');
select is(array[test_helpers.attempt(format('select public.job_opening_moderation_close_reports(%L, %L)', pg_temp.id('c1'), 'no_action')),
                test_helpers.attempt(format('select public.shop_lacks_recorded_super_admin_review(%L)', pg_temp.id('s1'))),
                test_helpers.attempt(format('select public.admin_access_record_lookup(%L, %L, %L, %L, 0)', 'worker_relationships', pg_temp.id('w1'),
                                            'policy_monitoring', 'A note that is long enough here')),
                test_helpers.attempt('select public.shops_zz_rereview_stamp()'), test_helpers.attempt('select public.job_openings_guard_moderation()')],
          array_fill('42501'::text, array[5]), 'j17_w14_internal_functions_not_client_executable');
select test_helpers.act_as_service();
select is((select count(*)::int from j17m_rpcs r where to_regprocedure('public.' || r.sig) in (select oid from j17m_functions)
           and has_function_privilege('authenticated', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('anon', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('service_role', to_regprocedure('public.' || r.sig), 'execute')), 20, 'j17_w14_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select is(array[test_helpers.attempt('select * from public.my_workforce_activity()'), test_helpers.attempt('select * from public.my_job_opening_reports()'),
                test_helpers.attempt(format('select public.report_job_opening(%L, %L, %L)', pg_temp.id('j1'), 'other', 'An anonymous caller reports this')),
                test_helpers.attempt('select * from public.admin_moderation_summary()'), test_helpers.attempt('select * from public.job_opening_reports')],
          array_fill('42501'::text, array[5]), 'j17_w14_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from j17m_functions where not coalesce(proconfig = array['search_path=public, pg_temp'], false)), 0,
          'j17_w14_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from j17m_functions where prosecdef), 32, 'j17_w14_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
           and tablename in (select t from j17m_tables)), 0, 'j17_w14_tables_not_in_realtime_publication');

-- ---------- super_admin functions refuse other roles ----------
select set_config('fx.denied', array['42501', '42501', '42501', '42501', '42501', '42501', '0', '0', '0', '0', '0']::text, true);
select test_helpers.act_as_owner('j17m-o1@local.test');
select is(pg_temp.admin_calls(), current_setting('fx.denied')::text[], 'j17_w14_admin_functions_refuse_owner_worker_customer');
select test_helpers.act_as_worker('j17m-w1@local.test');
select is(pg_temp.admin_calls(), current_setting('fx.denied')::text[], 'j17_w14_admin_functions_refuse_owner_worker_customer');
select test_helpers.act_as_customer('j17m-cu@local.test');
select is(pg_temp.admin_calls(), current_setting('fx.denied')::text[], 'j17_w14_admin_functions_refuse_owner_worker_customer');
select test_helpers.act_as_admin('j17m-a1@local.test');
select is((pg_temp.admin_calls())[7:11], array['1', '0', '0', '1', '0'], 'j17_w14_admin_functions_refuse_owner_worker_customer');

-- ---------- owner read carries no report data ----------
select test_helpers.act_as_service();
select is((select array_to_string(proargnames, ',') from pg_proc where oid = 'public.owner_job_opening_moderation()'::regprocedure),
          'case_id,job_opening_id,status,reason_kind,owner_message,owner_change_note,status_changed_at,can_submit_changes,history', 'j17_w14_owner_reads_no_report_data');
select test_helpers.act_as_owner('j17m-o1@local.test');
select is((select array_agg(distinct k order by k) from public.owner_job_opening_moderation() m, jsonb_array_elements(m.history) h, jsonb_object_keys(h) k),
          array['action', 'created_at', 'owner_message', 'reason_kind'], 'j17_w14_owner_reads_no_report_data');
select is((select count(*)::int from public.owner_job_opening_moderation() m where m::text ~* '(statement|reporter|j17m-w1|Local Test Worker|admin)'), 0,
          'j17_w14_owner_reads_no_report_data');

-- ---------- no W14 function writes job_applications or opening content ----------
select test_helpers.act_as_service();
select is((select count(*)::int from j17m_functions where prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.job_applications'), 0,
          'j17_w14_no_w14_function_writes_job_applications_or_opening_content');
select is((select array_agg(proname::text) from j17m_functions where prosrc ~* '(update|delete\s+from|insert\s+into)\s+public\.job_openings'),
          array['moderate_job_opening'], 'j17_w14_no_w14_function_writes_job_applications_or_opening_content');
select ok((select prosrc ~ 'update public\.job_openings set status = case when p_action = ''pause'' then ''paused'' else ''closed'' end, status_changed_at = now\(\)\s+where id = o\.id returning \* into o;'
           and (select count(*) from regexp_matches(prosrc, 'update public\.job_openings', 'g')) = 1
           from j17m_functions where proname = 'moderate_job_opening'), 'j17_w14_no_w14_function_writes_job_applications_or_opening_content');

select * from finish();
rollback;
