-- J17 roll-up (W13 PLAN section 6 test 1, section 8): database constraints and authorization prevent unauthorized
-- access, checked in ONE place over the whole workforce schema after all 97 migrations. The workforce table list below
-- is explicit; the first test proves it equals every public base table that is not part of the pre-workforce schema
-- (local baseline + the four pre-W2 migrations: profiles, workers, bookings, shops, shop_pricing,
-- shop_verification_documents), so a new table that is not added here fails this file. Per-increment detail stays in
-- j17_authorization_harness and the j17_w<n>_* files. Allow-lists name every grant / function that exists by design;
-- anything new fails. Fix cycle 1 (W13 S2 / S3 / S6 / N1 / N2 / N3) adds: every public sequence, column-level grants,
-- TRUNCATE / REFERENCES / TRIGGER on every public table (pre-workforce included), the pepper and the guard trigger set.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

create temporary table j17r_tables (name text primary key) on commit drop;
insert into j17r_tables values
  ('admin_access_records'), ('certification_platform_reviews'), ('certification_reassessments'), ('certification_review_requests'),
  ('certification_status_events'), ('certifications'), ('contract_acceptances'), ('contract_acknowledgement_texts'),
  ('contract_problem_term_rules'), ('contract_template_clauses'), ('contract_template_placeholders'), ('contract_template_sections'),
  ('contract_template_versions'), ('contract_templates'), ('contract_version_clauses'), ('contract_version_flags'), ('contract_versions'),
  ('job_applications'), ('job_opening_moderation_actions'), ('job_opening_moderation_cases'), ('job_opening_reports'), ('job_openings'),
  ('notification_categories'), ('notifications'), ('retained_job_application_records'), ('roster_link_history'), ('shop_certification_policies'),
  ('training_assessments'), ('training_attendance_records'), ('training_enrollments'), ('training_program_trainers'), ('training_programs'),
  ('training_sessions'), ('worker_classification_options'), ('worker_contract_disputes'), ('worker_contracts'), ('worker_owner_relationships'),
  ('worker_private_contacts'), ('worker_profiles'), ('worker_roster_link_attempts'), ('worker_roster_link_codes'), ('workforce_audit_events'),
  ('workforce_policies'), ('workforce_scheduled_jobs');
create temporary table j17r_views (name text primary key) on commit drop;
insert into j17r_views values ('shop_verification_review_log'), ('training_enrollment_progress');
create function pg_temp.pre_workforce() returns text[] language sql immutable as $$
  select array['bookings', 'profiles', 'shop_pricing', 'shop_verification_documents', 'shops', 'workers'] $$;
create function pg_temp.rels(p_kinds "char"[]) returns setof text language sql stable as $$
  select c.relname::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = any (p_kinds) $$;
-- (role, table, privileges) held by design. Anything else on a workforce table or view fails (D-78: w13b revoked the
-- W2 / W4 leftovers, so there is no exception for TRUNCATE / REFERENCES / TRIGGER and none at all for service_role).
--   authenticated SELECT: every workforce table a client reads (RLS decides the rows; deny-all where no client reads).
--   authenticated INSERT / UPDATE / DELETE, the only justified exceptions: job_openings (W4 owner drafts;
--     SupabaseJobOpeningRepository; RLS + job_openings_guard_write) and worker_profiles / worker_private_contacts (W2 own
--     rows; SupabaseWorkerProfileRepository; RLS + guard triggers). Every other write goes through definer RPCs.
--   service_role: nothing (no frontend, backend, smoke or test path uses the service key on a workforce table).
create temporary table j17r_grants (role_name text, rel text, privs text) on commit drop;
insert into j17r_grants
  select 'authenticated', name, case when name in ('job_openings', 'worker_profiles', 'worker_private_contacts') then 'DELETE INSERT SELECT UPDATE'
                                     when name in ('workforce_scheduled_jobs', 'notification_categories', 'worker_roster_link_codes',
                                                   'worker_roster_link_attempts', 'roster_link_history') then null
                                     else 'SELECT' end
  from j17r_tables
  union all select 'authenticated', 'training_enrollment_progress', 'SELECT';
create function pg_temp.actual_grants(p_role text) returns text language sql stable as $$
  select coalesce(string_agg(x.rel || '=' || x.privs, '; ' order by x.rel), '-') from (
    select r.name as rel, string_agg(p.priv, ' ' order by p.priv) as privs
    from (select name from j17r_tables union all select name from j17r_views) r
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where has_table_privilege(p_role, 'public.' || r.name, p.priv)
    group by r.name) x $$;
create function pg_temp.expected_grants(p_role text) returns text language sql stable as $$
  select coalesce(string_agg(rel || '=' || privs, '; ' order by rel), '-') from j17r_grants where role_name = p_role and privs is not null $$;

-- ---------- the list is complete ----------
select is((select coalesce(string_agg(t, ',' order by t), '-') from pg_temp.rels(array['r', 'p']::"char"[]) t
           where t <> all (pg_temp.pre_workforce()) and t not in (select name from j17r_tables)), '-', 'j17_workforce_table_list_is_complete');
select is((select coalesce(string_agg(name, ',' order by name), '-') from j17r_tables
           where name not in (select t from pg_temp.rels(array['r', 'p']::"char"[]) t)), '-', 'j17_workforce_table_list_is_complete');
select is((select string_agg(t, ',' order by t) from pg_temp.rels(array['v', 'm', 'f']::"char"[]) t),
          (select string_agg(name, ',' order by name) from j17r_views), 'j17_workforce_table_list_is_complete');
select is((select count(*)::int from j17r_tables), 44, 'j17_workforce_table_list_is_complete');

-- ---------- RLS on every workforce table ----------
select is((select coalesce(string_agg(t.name, ',' order by t.name), '-') from j17r_tables t
           join pg_class c on c.oid = ('public.' || t.name)::regclass where not c.relrowsecurity), '-', 'j17_every_workforce_table_has_rls_enabled');
select is((select coalesce(string_agg(v.name, ',' order by v.name), '-') from j17r_views v
           join pg_class c on c.oid = ('public.' || v.name)::regclass
           where not coalesce('security_invoker=true' = any (c.reloptions), false)), '-', 'j17_every_workforce_table_has_rls_enabled');

-- ---------- table privileges: only the allow-listed grants ----------
select is(pg_temp.actual_grants('anon'), '-', 'j17_no_client_role_has_insert_update_delete_on_workforce_tables');
select is(pg_temp.actual_grants('authenticated'), pg_temp.expected_grants('authenticated'),
          'j17_no_client_role_has_insert_update_delete_on_workforce_tables');
select is(pg_temp.actual_grants('public'), '-', 'j17_no_client_role_has_insert_update_delete_on_workforce_tables');
select is(pg_temp.actual_grants('service_role'), '-', 'j17_service_role_has_no_workforce_table_privileges');

-- ---------- sequences (W13 S2): no USAGE / SELECT / UPDATE on ANY public sequence, standalone ones included ----------
-- Allow-list of (role, sequence) pairs held by design. It is EMPTY: every insert that draws an id runs in a definer
-- function or as the table owner. Add a row here only with a comment that names the client path needing it.
create temporary table j17r_sequence_allow (role_name text, seq text) on commit drop;
create function pg_temp.sequence_grants(p_roles text[]) returns text language sql stable as $$
  select coalesce(string_agg(r.role_name || ':' || c.relname || ':' || p.priv, ',' order by r.role_name, c.relname, p.priv), '-')
  from pg_class c cross join unnest(p_roles) r(role_name) cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) p(priv)
  where c.relkind = 'S' and c.relnamespace = 'public'::regnamespace and has_sequence_privilege(r.role_name, c.oid, p.priv)
    and not exists (select 1 from j17r_sequence_allow a where a.role_name = r.role_name and a.seq = c.relname) $$;
select is(pg_temp.sequence_grants(array['anon', 'authenticated', 'public']), '-', 'j17_no_client_role_has_privileges_on_any_public_sequence');
-- service_role: every public sequence except one owned by a pre-workforce table (none exist locally; D-1 / D-10).
select is((select coalesce(string_agg(x, ','), '-') from unnest(string_to_array(pg_temp.sequence_grants(array['service_role']), ',')) x
           where x <> '-' and not exists (select 1 from pg_depend d join pg_class t on t.oid = d.refobjid
                                          where d.objid = ('public.' || split_part(x, ':', 2))::regclass and d.deptype in ('a', 'i')
                                            and t.relname = any (pg_temp.pre_workforce()))),
          '-', 'j17_service_role_has_no_workforce_table_privileges');

-- ---------- column-level grants (W13 S3): none on a workforce table or view ----------
select is((select coalesce(string_agg(r.role_name || ':' || o.name || ':' || p.priv, ',' order by r.role_name, o.name, p.priv), '-')
           from (select name from j17r_tables union all select name from j17r_views) o
           cross join unnest(array['anon', 'authenticated', 'public', 'service_role']) r(role_name)
           cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p(priv)
           where has_any_column_privilege(r.role_name, 'public.' || o.name, p.priv)
             and not has_table_privilege(r.role_name, 'public.' || o.name, p.priv)),
          '-', 'j17_no_column_level_grant_on_workforce_tables');
select is((select coalesce(string_agg(c.relname || '.' || a.attname, ',' order by c.relname, a.attname), '-')
           from pg_attribute a join pg_class c on c.oid = a.attrelid
           where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and not a.attisdropped and a.attacl is not null
             and c.relname in (select name from j17r_tables union all select name from j17r_views)),
          '-', 'j17_no_column_level_grant_on_workforce_tables');

-- ---------- W13 S6: no TRUNCATE / REFERENCES / TRIGGER for client roles on ANY public table (pre-workforce included) ----------
select is((select coalesce(string_agg(r.role_name || ':' || c.relname || ':' || p.priv, ',' order by r.role_name, c.relname, p.priv), '-')
           from pg_class c cross join unnest(array['anon', 'authenticated', 'public']) r(role_name)
           cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
             and has_table_privilege(r.role_name, c.oid, p.priv)),
          '-', 'j17_no_client_role_has_truncate_references_or_trigger_on_any_public_table');

-- ---------- W13 N3: the roster link code pepper stays unreachable, service_role included ----------
select is((select concat_ws(',', has_schema_privilege('service_role', 'washlink_private', 'usage')::text,
                            has_schema_privilege('service_role', 'washlink_private', 'create')::text,
                            has_table_privilege('service_role', 'washlink_private.roster_link_code_pepper', 'select')::text,
                            has_any_column_privilege('service_role', 'washlink_private.roster_link_code_pepper', 'select')::text)),
          'false,false,false,false', 'j17_service_role_cannot_reach_roster_link_code_pepper');
select is((select coalesce(string_agg(r || ':' || p, ',' order by r, p), '-')
           from unnest(array['anon', 'authenticated', 'public', 'service_role']) r
           cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'USAGE']) p
           where case when p = 'USAGE' then has_schema_privilege(r, 'washlink_private', 'usage')
                      else has_table_privilege(r, 'washlink_private.roster_link_code_pepper', p) end),
          '-', 'j17_service_role_cannot_reach_roster_link_code_pepper');

-- ---------- W13 N2: the BEFORE guard trigger set on the three client-writable tables is pinned ----------
-- name:function:tgtype:enabled (tgtype bits ROW 1, BEFORE 2, INSERT 4, DELETE 8, UPDATE 16). Dropping, disabling or
-- re-pointing a guard, or adding a BEFORE trigger, fails here; per-table behaviour stays in j17_w2 / j17_w4 / j17_w14.
select is((select string_agg(c.relname || '.' || t.tgname || ':' || t.tgfoid::regproc::text || ':' || t.tgtype::text || ':' || t.tgenabled::text, ','
                             order by c.relname, t.tgname)
           from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relnamespace = 'public'::regnamespace and c.relname in ('job_openings', 'worker_profiles', 'worker_private_contacts')
             and not t.tgisinternal and (t.tgtype & 2) = 2),
          'job_openings.job_openings_guard_moderation:job_openings_guard_moderation:19:O,'
          || 'job_openings.job_openings_guard_write:job_openings_guard_write:15:O,'
          || 'job_openings.job_openings_guard_write_update:job_openings_guard_write:19:O,'
          || 'job_openings.job_openings_moderation_hold:job_openings_moderation_hold:19:O,'
          || 'job_openings.job_openings_normalize:job_openings_normalize:23:O,'
          || 'worker_private_contacts.worker_private_contacts_stamp:stamp_worker_private_contact:23:O,'
          || 'worker_profiles.worker_profiles_guard_certified_delete:worker_profiles_guard_certified_delete:11:O,'
          || 'worker_profiles.worker_profiles_normalize:normalize_worker_profile:23:O',
          'j17_guard_triggers_on_client_writable_tables_are_pinned');
select is((select string_agg(t.tgname || ':' || (pg_get_triggerdef(t.oid) ~ ' WHEN ')::text, ',' order by t.tgname) from pg_trigger t
           where t.tgrelid = 'public.job_openings'::regclass and t.tgname in ('job_openings_guard_moderation', 'job_openings_guard_write_update')),
          'job_openings_guard_moderation:true,job_openings_guard_write_update:true', 'j17_guard_triggers_on_client_writable_tables_are_pinned');

-- ---------- policies (W13 N1: scope) ----------
-- The first check matches only a USING / WITH CHECK that IS the literal `true`; an expression that is always true in
-- effect (`1 = 1`, `true or ...`) is not detected here. Per-table row checks stay in the j17_w<n>_* files.
select is((select coalesce(string_agg(p.tablename || '.' || p.policyname, ',' order by p.tablename, p.policyname), '-') from pg_policies p
           where p.schemaname = 'public' and p.tablename in (select name from j17r_tables)
             and (btrim(coalesce(p.qual, '')) = 'true' or btrim(coalesce(p.with_check, '')) = 'true')),
          '-', 'j17_no_workforce_policy_qual_is_the_literal_true');
select is((select coalesce(string_agg(p.tablename || '.' || p.policyname, ',' order by p.tablename, p.policyname), '-') from pg_policies p
           where p.schemaname = 'public' and p.tablename in (select name from j17r_tables) and ('anon' = any (p.roles) or 'public' = any (p.roles))
             and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and coalesce(p.qual, p.with_check, '') <> 'false'),
          '-', 'j17_no_anon_or_public_write_policy_on_workforce_tables');

-- ---------- definer functions: search_path pinned, pg_temp last (only the baseline-only signup function is exempt) ----------
select is((select coalesce(string_agg(n.nspname || '.' || p.proname, ',' order by n.nspname, p.proname), '-')
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prosecdef and n.nspname in ('public', 'washlink_private', 'test_helpers')
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) s where s ~ '^search_path=public(, [a-z_]+)*, pg_temp$')),
          'public.handle_new_user', 'j17_every_definer_function_pins_search_path_with_pg_temp_last');
select ok((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef) > 200,
          'j17_every_definer_function_pins_search_path_with_pg_temp_last');

-- ---------- anon executes only the five pre-workforce functions ----------
select is((select string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text) from pg_proc p
           where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
          'can_manage_shop_verification_storage(text),handle_new_user(),is_super_admin(),set_booking_quote_from_shop_pricing(),'
          || 'set_shop_pricing_updated_at()', 'j17_anon_executes_no_workforce_function');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'washlink_private'::regnamespace
             and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'j17_anon_executes_no_workforce_function');

-- ---------- Realtime ----------
select is((select count(*)::int from pg_publication where pubname = 'supabase_realtime' and puballtables), 0,
          'j17_no_workforce_table_in_realtime_publication');
select is((select coalesce(string_agg(tablename, ',' order by tablename), '-') from pg_publication_tables
           where schemaname = 'public' and tablename in (select name from j17r_tables union all select name from j17r_views)),
          '-', 'j17_no_workforce_table_in_realtime_publication');

-- ---------- fixtures for the read checks ----------
create temporary table j17r_ids (label text primary key, id uuid) on commit drop;
grant all on j17r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17r_ids where label = p_label $$;
insert into j17r_ids values ('a1', test_helpers.create_super_admin('j17r-a1@local.test')), ('c1', test_helpers.create_customer('j17r-c1@local.test'));
insert into j17r_ids select 'o' || n, test_helpers.create_owner('j17r-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j17r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j17r-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j17r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j17r_ids values ('k1', test_helpers.create_active_test_contract('j17r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j17r-w1@local.test'));
insert into j17r_ids select 'v' || v.version_number, v.id from public.contract_versions v where v.contract_id = pg_temp.id('k1');
create function pg_temp.contract_rows() returns text language sql stable as $$
  select (select count(*) from public.worker_contracts where id = pg_temp.id('k1')) || ',' ||
         (select count(*) from public.contract_versions where contract_id = pg_temp.id('k1')) || ',' ||
         (select count(*) from public.contract_version_clauses where version_id = pg_temp.id('v1')) || ',' ||
         (select count(*) from public.contract_version_flags where version_id = pg_temp.id('v1')) || ',' ||
         (select count(*) from public.contract_acceptances where contract_id = pg_temp.id('k1')) $$;
select set_config('fx.total', pg_temp.contract_rows(), true);

-- ---------- the raw audit table: no client role reads it ----------
select ok((select count(*) from public.workforce_audit_events) > 0, 'j17_raw_audit_table_unreadable_by_every_client_role');
create function pg_temp.audit_reads() returns text language sql as $$
  select test_helpers.attempt('select 1 from public.workforce_audit_events limit 1') || ':'
         || coalesce((select count(*) from public.workforce_audit_events)::text, '-') $$;
select test_helpers.act_as_admin('j17r-a1@local.test');
select is(pg_temp.audit_reads(), 'succeeded:0', 'j17_raw_audit_table_unreadable_by_every_client_role');
select test_helpers.act_as_owner('j17r-o1@local.test');
select is(pg_temp.audit_reads(), 'succeeded:0', 'j17_raw_audit_table_unreadable_by_every_client_role');
select test_helpers.act_as_worker('j17r-w1@local.test');
select is(pg_temp.audit_reads(), 'succeeded:0', 'j17_raw_audit_table_unreadable_by_every_client_role');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select 1 from public.workforce_audit_events limit 1'), '42501', 'j17_raw_audit_table_unreadable_by_every_client_role');

-- ---------- private contract tables: parties read, non-parties read nothing ----------
select test_helpers.act_as_owner('j17r-o1@local.test');
select ok(split_part(pg_temp.contract_rows(), ',', 1) = '1' and split_part(pg_temp.contract_rows(), ',', 2) <> '0',
          'j17_private_contract_tables_unreadable_by_non_parties');
select test_helpers.act_as_owner('j17r-o2@local.test');
select set_config('fx.other_owner', pg_temp.contract_rows(), true);
select test_helpers.act_as_worker('j17r-w2@local.test');
select set_config('fx.other_worker', pg_temp.contract_rows(), true);
select test_helpers.act_as_customer('j17r-c1@local.test');
select set_config('fx.customer', pg_temp.contract_rows(), true);
select test_helpers.act_as_admin('j17r-a1@local.test');
select set_config('fx.super_admin', pg_temp.contract_rows(), true);
select test_helpers.act_as_service();
select is(current_setting('fx.other_owner') || '|' || current_setting('fx.other_worker') || '|' || current_setting('fx.customer') || '|'
          || current_setting('fx.super_admin'), '0,0,0,0,0|0,0,0,0,0|0,0,0,0,0|0,0,0,0,0', 'j17_private_contract_tables_unreadable_by_non_parties');
select ok(current_setting('fx.total') ~ '^1,[1-9][0-9]*,[1-9][0-9]*,[0-9]+,[1-9][0-9]*$', 'j17_private_contract_tables_unreadable_by_non_parties');

-- ---------- no set_config wrapper ----------
select is((select coalesce(string_agg(p.oid::regprocedure::text, ','), '-') from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and (p.proname ~* '(config|setting)' or p.prosrc ~ 'set_config\(\s*p_' or p.prosrc ~ 'set_config\(\s*\$[0-9]')),
          '-', 'j17_no_set_config_wrapper_exposed');
select test_helpers.act_as_owner('j17r-o1@local.test');
select is(test_helpers.attempt($$select public.set_config('washlink.worker_contract_write', 'x', true)$$), '42883', 'j17_no_set_config_wrapper_exposed');

select * from finish();
rollback;
