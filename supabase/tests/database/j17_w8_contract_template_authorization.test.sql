-- J17 (W8): contract template tables and functions - RLS and privileges, owners read their own templates and the
-- platform standard only, workers / customers / anon read nothing (platform included), super_admin reads the
-- platform standard but no owner template, owners cannot publish, foreign ids return nothing, internal functions
-- closed, anon denied, pinned search_path, no Realtime, no fee or pay amount columns. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17t-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17t-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17t-o2@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j17t-cu@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker_profile(test_helpers.create_worker('j17t-w1@local.test'))::text, true);
create temporary table j17t_ids (label text primary key, id uuid) on commit drop;
grant all on j17t_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17t_ids where label = p_label $$;
insert into j17t_ids values ('p1', test_helpers.latest_platform_contract_version()),
  ('t1', test_helpers.create_test_contract_template('j17t-o1@local.test', 'Owner one template')),
  ('t2', test_helpers.create_test_contract_template('j17t-o2@local.test', 'Owner two template'));
insert into j17t_ids values ('t1v2', test_helpers.save_test_template_version(pg_temp.id('t1'), 'j17t-o1@local.test', '{"schedule": "Mornings."}',
  '[{"section_number": 15, "heading": "Uniform", "body": "The shop lends a uniform."}]'));
insert into j17t_ids select 't2v1', id from public.contract_template_versions where template_id = pg_temp.id('t2');
create temporary table j17t_tables (t) on commit drop as select unnest(array['contract_template_sections', 'contract_template_placeholders',
  'worker_classification_options', 'contract_templates', 'contract_template_versions', 'contract_template_clauses']);
grant all on j17t_tables to public;
create function pg_temp.visible() returns text language plpgsql as $$
declare
  counts text[] := '{}';
  n int;
begin
  select count(*) into n from public.contract_templates; counts := counts || ('templates=' || n);
  select count(*) into n from public.contract_template_versions; counts := counts || ('versions=' || n);
  select count(*) into n from public.contract_template_clauses; counts := counts || ('clauses=' || n);
  return array_to_string(counts, ',');
end $$;
create function pg_temp.expect(p_templates int, p_versions int, p_clauses int) returns text language sql
as $$ select format('templates=%s,versions=%s,clauses=%s', p_templates, p_versions, p_clauses) $$;
select test_helpers.act_as_service();
select set_config('fx.platform_versions', (select count(*) from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
                                          where t.scope = 'platform')::text, true);
select set_config('fx.platform_clauses', (select count(*) from public.contract_template_clauses c join public.contract_template_versions v on v.id = c.version_id
                                         join public.contract_templates t on t.id = v.template_id where t.scope = 'platform')::text, true);
create function pg_temp.pv() returns int language sql stable as $$ select current_setting('fx.platform_versions')::int $$;
create function pg_temp.pc() returns int language sql stable as $$ select current_setting('fx.platform_clauses')::int $$;
create function pg_temp.vc(p_version text) returns int language sql stable security definer
as $$ select count(*)::int from public.contract_template_clauses where version_id = pg_temp.id(p_version) $$;

-- ---------- privileges and RLS ----------
select is((select count(*)::int from pg_class c join j17t_tables x on x.t = c.relname where c.relnamespace = 'public'::regnamespace and c.relrowsecurity),
          6, 'j17_w8_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from information_schema.role_table_grants g join j17t_tables x on x.t = g.table_name
           where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
             and (g.privilege_type <> 'SELECT' or g.grantee <> 'authenticated')), 0, 'j17_w8_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies p join j17t_tables x on x.t = p.tablename
           where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(p.qual, p.with_check) = 'false'), 18,
          'j17_w8_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies p join j17t_tables x on x.t = p.tablename
           where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and coalesce(p.qual, p.with_check, '') <> 'false'), 0,
          'j17_w8_tables_rls_enabled_and_no_client_write_privileges');

-- ---------- per-audience reads ----------
select test_helpers.act_as_owner('j17t-o1@local.test');
select is(pg_temp.visible(), pg_temp.expect(2, pg_temp.pv() + 2, pg_temp.pc() + pg_temp.vc('t1v2') + pg_temp.pc()),
          'j17_owner_reads_only_own_templates_and_the_platform_standard');
select is((select array_agg(template_id) from public.owner_contract_templates()), array[pg_temp.id('t1')],
          'j17_owner_reads_only_own_templates_and_the_platform_standard');
select is((select version_id from public.platform_contract_template_current()), pg_temp.id('p1'),
          'j17_owner_reads_only_own_templates_and_the_platform_standard');
select test_helpers.act_as_owner('j17t-o2@local.test');
select is(pg_temp.visible(), pg_temp.expect(2, pg_temp.pv() + 1, pg_temp.pc() * 2), 'j17_other_owner_cannot_read_or_save_foreign_template');
select throws_ok(format($$ select public.save_owner_contract_template_version(%L, 2, %L, '{"schedule": "Taken over."}', '[]') $$,
                 pg_temp.id('t1'), pg_temp.id('p1')), '42501', 'Contract template not found.', 'j17_other_owner_cannot_read_or_save_foreign_template');
select throws_ok(format($$ select public.rename_owner_contract_template(%L, 'Taken over') $$, pg_temp.id('t1')), '42501', 'Contract template not found.',
                 'j17_other_owner_cannot_read_or_save_foreign_template');
select throws_ok(format($$ select public.set_owner_contract_template_status(%L, 'active', 'archived') $$, pg_temp.id('t1')), '42501',
                 'Contract template not found.', 'j17_other_owner_cannot_read_or_save_foreign_template');
select throws_ok(format($$ select public.create_owner_contract_template('Copy of a foreign version', %L) $$, pg_temp.id('t1v2')), '42501',
                 'Contract template not found.', 'j17_other_owner_cannot_read_or_save_foreign_template');
select is((select count(*)::int from public.contract_template_version_clauses(pg_temp.id('t1v2')))
          + (select count(*)::int from public.preview_contract_template_version(pg_temp.id('t1v2')))
          + (select count(*)::int from public.contract_template_version_diff(pg_temp.id('t1v2')))
          + (select count(*)::int from public.contract_template_version_history(pg_temp.id('t1')))
          + (select count(*)::int from public.contract_template_version_history(gen_random_uuid()))
          + (select count(*)::int from public.contract_template_version_clauses(gen_random_uuid())), 0, 'j17_reads_return_nothing_for_foreign_ids');
select ok((select count(*) from public.contract_template_version_clauses(pg_temp.id('t2v1'))) > 0, 'j17_reads_return_nothing_for_foreign_ids');
select test_helpers.act_as_worker('j17t-w1@local.test');
select is(pg_temp.visible(), pg_temp.expect(0, 0, 0), 'j17_worker_reads_no_contract_template_rows_including_platform');
select is((select count(*)::int from public.platform_contract_template_current()) + (select count(*)::int from public.owner_contract_templates())
          + (select count(*)::int from public.preview_contract_template_version(pg_temp.id('p1'))), 0,
          'j17_worker_reads_no_contract_template_rows_including_platform');
select throws_ok($$ select public.create_owner_contract_template('Worker template', null) $$, '42501', 'Only shop owners can create contract templates.',
                 'j17_worker_reads_no_contract_template_rows_including_platform');
select test_helpers.act_as_customer('j17t-cu@local.test');
select is(pg_temp.visible() || ',' || (select count(*) from public.platform_contract_template_current()), pg_temp.expect(0, 0, 0) || ',0',
          'j17_customer_and_anon_read_no_contract_template_rows');
select throws_ok($$ select public.create_owner_contract_template('Customer template', null) $$, '42501', 'Only shop owners can create contract templates.',
                 'j17_customer_and_anon_read_no_contract_template_rows');
select test_helpers.act_as_anon();
select is((select count(*)::int from j17t_tables where test_helpers.attempt(format('select count(*) from public.%I', t)) = '42501'), 6,
          'j17_customer_and_anon_read_no_contract_template_rows');
select test_helpers.act_as_admin('j17t-a1@local.test');
select is(pg_temp.visible(), pg_temp.expect(1, pg_temp.pv(), pg_temp.pc()), 'j17_super_admin_reads_platform_but_not_owner_templates');
select is((select count(*)::int from public.owner_contract_templates()) + (select count(*)::int from public.contract_template_version_history(pg_temp.id('t1')))
          + (select count(*)::int from public.preview_contract_template_version(pg_temp.id('t1v2'))), 0,
          'j17_super_admin_reads_platform_but_not_owner_templates');
select is((select version_id from public.platform_contract_template_current()), pg_temp.id('p1'), 'j17_super_admin_reads_platform_but_not_owner_templates');
select throws_ok(format($$ select public.save_owner_contract_template_version(%L, 2, %L, '{"schedule": "Admin edit."}', '[]') $$,
                 pg_temp.id('t1'), pg_temp.id('p1')), '42501', 'Contract template not found.', 'j17_super_admin_reads_platform_but_not_owner_templates');
select throws_ok($$ select public.create_owner_contract_template('Admin template', null) $$, '42501', 'Only shop owners can create contract templates.',
                 'j17_super_admin_reads_platform_but_not_owner_templates');
select test_helpers.act_as_owner('j17t-o1@local.test');
select throws_ok($$ select public.publish_platform_contract_template_version(1, '[]') $$, '42501',
                 'Only WashLink administrators can change the standard template.', 'j17_owner_cannot_publish_platform_version');
select throws_ok(format($$ select public.save_owner_contract_template_version(%L, 1, null, '{}', '[]') $$,
                 (select id from public.contract_templates where scope = 'platform')), '42501', 'Contract template not found.',
                 'j17_owner_cannot_publish_platform_version');

-- ---------- functions, pinning, realtime, no amounts ----------
select test_helpers.act_as_service();
create temporary table j17t_rpcs (sig) on commit drop as select unnest(array['create_owner_contract_template(text, uuid)',
  'save_owner_contract_template_version(uuid, integer, uuid, jsonb, jsonb)', 'rename_owner_contract_template(uuid, text)',
  'set_owner_contract_template_status(uuid, text, text)', 'publish_platform_contract_template_version(integer, jsonb)', 'owner_contract_templates()',
  'platform_contract_template_current()', 'contract_template_version_history(uuid)', 'contract_template_version_clauses(uuid)',
  'preview_contract_template_version(uuid)', 'contract_template_version_diff(uuid)', 'render_contract_template_clause(text, jsonb)']);
create temporary table j17t_internal (sig) on commit drop as select unnest(array['contract_template_reference_guard_write()',
  'contract_template_normalize_text(text)', 'contract_templates_guard_write()', 'contract_template_versions_guard_write()',
  'contract_template_clauses_guard_write()', 'contract_template_clause_hash(integer, integer, text, text, text, text)',
  'contract_template_hash_of(text, text, text[])', 'contract_template_version_hash(uuid)', 'contract_template_core_safeguard_keys()',
  'contract_template_core_safeguards()',
  'contract_template_placeholders_in(text)', 'validate_contract_template_version(uuid)', 'contract_template_versions_validate_at_commit()',
  'contract_template_clauses_content_hash(uuid, jsonb)', 'contract_template_insert_version(uuid, uuid, jsonb, integer, integer)',
  'contract_template_latest_platform_version()', 'contract_template_name_or_fail(text)', 'contract_template_assert_active_limit(uuid)',
  'lock_owner_contract_template(uuid)', 'contract_template_checked_shop_terms(jsonb)', 'contract_template_owner_clause_list(uuid, jsonb, jsonb)',
  'contract_template_editable_bodies(uuid)', 'contract_template_shop_terms(uuid)', 'contract_template_changed_by()', 'contract_templates_audit()',
  'contract_template_versions_audit()', 'contract_template_core_text_pin()']);  -- W16 (D-87) adds the core text pin
grant all on j17t_rpcs, j17t_internal to public;
select is((select count(*)::int from j17t_internal where to_regprocedure('public.' || sig) is not null), 27, 'j17_w8_internal_functions_not_client_executable');
select is((select count(*)::int from j17t_internal i, unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
           where has_function_privilege(r.role_name, to_regprocedure('public.' || i.sig), 'execute')), 0, 'j17_w8_internal_functions_not_client_executable');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ 'contract_template'
           and p.oid not in (select to_regprocedure('public.' || sig) from j17t_rpcs union all select to_regprocedure('public.' || sig) from j17t_internal)),
          0, 'j17_w8_internal_functions_not_client_executable');
select test_helpers.act_as_owner('j17t-o1@local.test');
select throws_ok(format($$ select public.contract_template_insert_version(%L, %L, '[]', 0, 0) $$, pg_temp.id('t1'), pg_temp.id('p1')), '42501', null,
                 'j17_w8_internal_functions_not_client_executable');
select test_helpers.act_as_service();
select is((select count(*)::int from j17t_rpcs where to_regprocedure('public.' || sig) is not null
           and has_function_privilege('authenticated', to_regprocedure('public.' || sig), 'execute')
           and not has_function_privilege('anon', to_regprocedure('public.' || sig), 'execute')
           and not has_function_privilege('service_role', to_regprocedure('public.' || sig), 'execute')), 12, 'j17_w8_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select throws_ok($$ select public.create_owner_contract_template('Anon template', null) $$, '42501', null, 'j17_w8_rpcs_denied_to_anon');
select throws_ok($$ select * from public.platform_contract_template_current() $$, '42501', null, 'j17_w8_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from (select to_regprocedure('public.' || sig) f from j17t_rpcs union all select to_regprocedure('public.' || sig) from j17t_internal) x
           join pg_proc p on p.oid = x.f where not coalesce(p.proconfig = array['search_path=public, pg_temp'], false)), 0,
          'j17_w8_definer_functions_pin_pg_temp_last');
select ok((select count(*) from (select to_regprocedure('public.' || sig) f from j17t_rpcs union all select to_regprocedure('public.' || sig) from j17t_internal) x
           join pg_proc p on p.oid = x.f where p.prosecdef) >= 25, 'j17_w8_definer_functions_pin_pg_temp_last');
select is((select array_agg(p.proname::text order by p.proname) from j17t_rpcs r join pg_proc p on p.oid = to_regprocedure('public.' || r.sig)
           where not p.prosecdef), array['contract_template_version_clauses', 'contract_template_version_diff', 'contract_template_version_history',
           'owner_contract_templates', 'platform_contract_template_current', 'preview_contract_template_version', 'render_contract_template_clause'],
          'j17_w8_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables pt join j17t_tables x on x.t = pt.tablename
           where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'), 0, 'j17_w8_tables_not_in_realtime_publication');
select is((select count(*)::int from information_schema.columns c join j17t_tables x on x.t = c.table_name
           where c.table_schema = 'public' and c.column_name ~* '(fee|charge|deduct|price|cost|pay|amount|salary|wage|rate)'), 0,
          'j17_w8_no_fee_or_pay_amount_columns');
select is((select count(*)::int from (select to_regprocedure('public.' || sig) f from j17t_rpcs union all select to_regprocedure('public.' || sig) from j17t_internal) x
           join pg_proc p on p.oid = x.f, unnest(coalesce(p.proargnames, '{}')) arg
           where arg ~* '(fee|charge|deduct|price|cost|pay|amount|salary|wage)'), 0, 'j17_w8_no_fee_or_pay_amount_columns');
select is((select count(*)::int from (select to_regprocedure('public.' || sig) f from j17t_rpcs union all select to_regprocedure('public.' || sig) from j17t_internal) x
           join pg_proc p on p.oid = x.f where p.prosrc ~* '(bookings|shop_pricing|quoted_price)')
          + (select count(*)::int from pg_constraint con join j17t_tables x on con.conrelid = ('public.' || x.t)::regclass
             where con.contype = 'f' and con.confrelid::regclass::text in ('bookings', 'shop_pricing', 'shops')), 0, 'j17_w8_no_fee_or_pay_amount_columns');

select * from finish();
rollback;
