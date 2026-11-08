-- J17 (W11): authorization of the WashLink review and reported contract problem objects (W11 PLAN P66, P70, P71). RLS on
-- with SELECT-only grants and NO raw read for any client role incl. super_admin (fix cycle 1 N3: admin reads only through
-- the definer queue / audited case reads), deny-all select and write policies, no direct write for any role (a
-- trusted session without the transaction flag is refused too), internal functions closed to every client role, RPCs
-- closed to anon and service_role, every W11 definer function pinned to `public, pg_temp`, no Realtime publication, and
-- every super_admin function refusing owners, workers and customers. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temporary table j17o_rpcs (sig) on commit drop as select unnest(array['certification_platform_review_owner_decision_days()',
  'open_certification_platform_review(uuid, text, text)', 'withdraw_certification_platform_review(uuid)',
  'decide_certification_platform_review(uuid, integer, text, text)', 'my_certification_platform_reviews()', 'owner_certification_platform_reviews()',
  'admin_certification_platform_review_queue(text)', 'admin_certification_platform_review_case(uuid)', 'raise_contract_dispute(uuid, text, text)',
  'respond_to_contract_dispute(uuid, text)', 'withdraw_contract_dispute(uuid)', 'close_contract_dispute(uuid, integer, text, text)',
  'my_contract_disputes()', 'admin_contract_dispute_queue(text)', 'admin_contract_dispute_case(uuid)',
  'admin_contract_dispute_version_document(uuid, uuid)', 'my_worker_dashboard_summary()', 'owner_dashboard_summary()', 'admin_dashboard_summary()']);
create temporary table j17o_functions on commit drop as
  select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p
  where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W11:%';
grant all on j17o_rpcs, j17o_functions to public;

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17o-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j17o-cu@local.test')::text, true);
create temporary table j17o_ids (label text primary key, id uuid) on commit drop;
grant all on j17o_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17o_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
insert into j17o_ids values ('o1', test_helpers.create_owner('j17o-o1@local.test'));
insert into j17o_ids values ('w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17o-w1@local.test')));
insert into j17o_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1')));
insert into j17o_ids values ('c1', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('w1'), 'j17o-o1@local.test'));
select test_helpers.suspend_test_certification(pg_temp.id('c1'), 'j17o-o1@local.test') is not null as suspended;
insert into j17o_ids values ('r1', test_helpers.request_test_shop_review(pg_temp.id('c1'), 'j17o-w1@local.test'));
select test_helpers.backdate_shop_review_request(pg_temp.id('r1'), 15) is not null as overdue;
select test_helpers.act_as_worker('j17o-w1@local.test');
insert into j17o_ids values ('rv1', (public.open_certification_platform_review(pg_temp.id('c1'), 'suspended', 'Please review the shop decision on my certificate')).id);
select test_helpers.act_as_service();
insert into j17o_ids values ('k1', test_helpers.create_active_test_contract('j17o-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17o-w1@local.test'));
insert into j17o_ids values ('d1', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j17o-w1@local.test'));
create function pg_temp.writes() returns text[] language sql as $$
  select array[test_helpers.attempt(format($i$ insert into public.certification_platform_reviews (certification_id, worker_id, basis, certification_status_at_open,
                 worker_statement) values (%L, %L, 'issuer_unavailable', 'suspended', 'A forged local test review statement') $i$, pg_temp.id('c1'), pg_temp.id('w1'))),
               test_helpers.attempt(format($i$ update public.certification_platform_reviews set status = 'reinstated', decision_reason = 'A forged local test decision reason', decided_at = now() where id = %L $i$, pg_temp.id('rv1'))),
               test_helpers.attempt('delete from public.certification_platform_reviews'),
               test_helpers.attempt(format($i$ insert into public.worker_contract_disputes (contract_id, raised_by_role, category, statement, contract_status_at_raise)
                 values (%L, 'worker', 'other', 'A forged local test dispute statement', 'active') $i$, pg_temp.id('k1'))),
               test_helpers.attempt(format($i$ update public.worker_contract_disputes set status = 'closed', resolution_kind = 'no_platform_action',
                 resolution_note = 'A forged local test closing note here', closed_at = now() where id = %L $i$, pg_temp.id('d1'))),
               test_helpers.attempt('delete from public.worker_contract_disputes')] $$;
create function pg_temp.admin_calls() returns text[] language sql as $$
  select array[test_helpers.attempt(format('select public.admin_certification_platform_review_case(%L)', pg_temp.id('rv1'))),
               test_helpers.attempt(format('select public.decide_certification_platform_review(%L, 1, %L, %L)', pg_temp.id('rv1'), 'reinstate', 'A reason that is long enough here')),
               test_helpers.attempt(format('select public.admin_contract_dispute_case(%L)', pg_temp.id('d1'))),
               test_helpers.attempt(format('select * from public.admin_contract_dispute_version_document(%L, %L)', pg_temp.id('d1'), pg_temp.id('d1'))),
               test_helpers.attempt(format('select public.close_contract_dispute(%L, 1, %L, %L)', pg_temp.id('d1'), 'no_platform_action', 'A note that is long enough here')),
               (select count(*) from public.admin_certification_platform_review_queue('open'))::text,
               (select count(*) from public.admin_contract_dispute_queue('open'))::text,
               (select count(*) from public.admin_dashboard_summary())::text,
               (select count(*) from public.certification_platform_reviews)::text,
               (select count(*) from public.worker_contract_disputes)::text] $$;

-- ---------- tables and policies ----------
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
           and relname in ('certification_platform_reviews', 'worker_contract_disputes')), 2, 'j17_w11_tables_rls_enabled_and_no_client_write_privileges');
select is((select array_agg(g.grantee || ':' || g.table_name || ':' || g.privilege_type order by g.table_name) from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name in ('certification_platform_reviews', 'worker_contract_disputes')
             and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
          array['authenticated:certification_platform_reviews:SELECT', 'authenticated:worker_contract_disputes:SELECT'],
          'j17_w11_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('certification_platform_reviews', 'worker_contract_disputes')
           and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') and coalesce(qual, with_check) = 'false' and roles = array['authenticated']::name[]), 8,
          'j17_w11_write_policies_deny_all');
select is((select count(*)::int from pg_policies where schemaname = 'public'
           and tablename in ('certification_platform_reviews', 'worker_contract_disputes') and coalesce(qual, with_check, '') <> 'false'),
          0, 'j17_w11_write_policies_deny_all');

-- ---------- direct writes ----------
select test_helpers.act_as_owner('j17o-o1@local.test');
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_worker('j17o-w1@local.test');
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_admin('j17o-a1@local.test');
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('role', 'service_role', true);
select throws_ok('delete from public.certification_platform_reviews', '42501', null, 'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');
select throws_ok('update public.worker_contract_disputes set status = ''withdrawn''', '42501', null,
                 'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');
select set_config('role', 'none', true);
select test_helpers.act_as_service();
select is(pg_temp.writes(), array_fill('42501'::text, array[6]), 'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');
select is((select count(*)::int || ',' || min(status) || ',' || min(revision) from public.certification_platform_reviews) || ';'
          || (select count(*)::int || ',' || min(status) || ',' || min(revision) from public.worker_contract_disputes), '1,open,1;1,open,1',
          'j17_w11_direct_writes_refused_for_every_role_including_trusted_insert');

-- ---------- functions ----------
select is((select count(*)::int from j17o_functions), 31, 'j17_w11_internal_functions_not_client_executable');
select is((select count(*)::int from j17o_functions f, unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
           where f.oid not in (select to_regprocedure('public.' || sig) from j17o_rpcs) and has_function_privilege(r.role_name, f.oid, 'execute')), 0,
          'j17_w11_internal_functions_not_client_executable');
select test_helpers.act_as_worker('j17o-w1@local.test');
select is(array[test_helpers.attempt(format('select public.certification_platform_review_basis(%L)', pg_temp.id('c1'))),
                test_helpers.attempt('select public.certifications_platform_review_resolve()')], array['42501', '42501'],
          'j17_w11_internal_functions_not_client_executable');
select test_helpers.act_as_service();
select is((select count(*)::int from j17o_rpcs r where to_regprocedure('public.' || r.sig) in (select oid from j17o_functions)
           and has_function_privilege('authenticated', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('anon', to_regprocedure('public.' || r.sig), 'execute')
           and not has_function_privilege('service_role', to_regprocedure('public.' || r.sig), 'execute')), 19, 'j17_w11_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select is(array[test_helpers.attempt('select * from public.my_contract_disputes()'), test_helpers.attempt('select * from public.my_certification_platform_reviews()'),
                test_helpers.attempt(format('select public.raise_contract_dispute(%L, %L, %L)', pg_temp.id('k1'), 'other', 'An anonymous caller reports this')),
                test_helpers.attempt('select * from public.certification_platform_reviews'), test_helpers.attempt('select * from public.worker_contract_disputes')],
          array_fill('42501'::text, array[5]), 'j17_w11_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from j17o_functions where not coalesce(proconfig = array['search_path=public, pg_temp'], false)), 0,
          'j17_w11_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from j17o_functions where prosecdef), 30, 'j17_w11_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
           and tablename in ('certification_platform_reviews', 'worker_contract_disputes')), 0, 'j17_w11_tables_not_in_realtime_publication');

-- ---------- super_admin functions refuse other roles ----------
select set_config('fx.refused', array['42501', '42501', '42501', '42501', '42501', '0', '0', '0', '0', '0']::text, true);
select test_helpers.act_as_owner('j17o-o1@local.test');
select is(pg_temp.admin_calls(), current_setting('fx.refused')::text[], 'j17_w11_admin_functions_refuse_owner_worker_customer');
select test_helpers.act_as_worker('j17o-w1@local.test');
select is(pg_temp.admin_calls(), current_setting('fx.refused')::text[], 'j17_w11_admin_functions_refuse_owner_worker_customer');
select test_helpers.act_as_customer('j17o-cu@local.test');
select is(pg_temp.admin_calls(), current_setting('fx.refused')::text[], 'j17_w11_admin_functions_refuse_owner_worker_customer');
select test_helpers.act_as_admin('j17o-a1@local.test');
select is((pg_temp.admin_calls())[6:10], array['1', '1', '1', '0', '0'], 'j17_w11_admin_functions_refuse_owner_worker_customer');
select is((select count(*)::int from public.certification_platform_reviews) + (select count(*)::int from public.worker_contract_disputes), 0,
          'j17_w11_super_admin_has_no_raw_select');
select throws_ok($$ select * from public.admin_contract_dispute_queue('everything') $$, '22023', 'Choose a dispute status.',
                 'j17_w11_admin_functions_refuse_owner_worker_customer');

select * from finish();
rollback;
