-- J17 (W7): certification tables and functions - RLS and privileges, per-audience reads (worker own, issuing
-- current owner, other owners only current certificates inside the W5 window), no reasons / statements / contact
-- data for others, internal functions closed, anon denied, pinned search_path, no Realtime, no fee or booking
-- path (P35). Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17c-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17c-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17c-o2@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j17c-cu@local.test')::text, true);
select count(test_helpers.create_worker_profile(test_helpers.create_worker('j17c-w' || n || '@local.test'))) from generate_series(1, 2) n;
create function pg_temp.w(n int) returns uuid language sql stable security definer
as $$ select id from auth.users where email = 'j17c-w' || n || '@local.test' $$;
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_verified_shop(current_setting('fx.o2')::uuid, current_setting('fx.a1')::uuid)::text, true);
create temporary table j17c_ids (label text primary key, id uuid) on commit drop;
grant all on j17c_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j17c_ids where label = p_label $$;
insert into j17c_ids values ('c1', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(1), 'j17c-o1@local.test')),
  ('c1x', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(1), 'j17c-o1@local.test')),
  ('c2', test_helpers.issue_test_certification(current_setting('fx.s1')::uuid, pg_temp.w(2), 'j17c-o1@local.test')),
  ('job', test_helpers.publish_job_opening(test_helpers.create_job_opening(current_setting('fx.s2')::uuid, 'J17C opening')));
select test_helpers.act_as_owner('j17c-o1@local.test');
select (public.transition_certification(pg_temp.id('c1x'), 'active', 'suspended', 'Reason BADGER kept from other owners')).status as c1x;
select (public.set_shop_certification_validity(current_setting('fx.s1')::uuid, 6)).validity_months as validity;
select test_helpers.act_as(pg_temp.w(1));
insert into j17c_ids select 'r1', id from public.request_certification_review(pg_temp.id('c1x'), 'Statement OTTER kept from other owners.');
insert into j17c_ids select 'app', id from public.create_job_application(pg_temp.id('job'), null, true, 'w5_v1');
create temporary table j17c_tables (t) on commit drop as select unnest(array['shop_certification_policies', 'certifications',
  'certification_status_events', 'certification_review_requests', 'certification_reassessments']);
grant all on j17c_tables to public;
create function pg_temp.visible() returns text language plpgsql as $$
declare
  counts text[] := '{}';
  table_name text;
  n int;
begin
  for table_name in select t from j17c_tables order by t loop
    execute format('select count(*) from public.%I', table_name) into n;
    counts := counts || (table_name || '=' || n);
  end loop;
  return array_to_string(counts, ',');
end $$;

-- ---------- privileges and RLS ----------
select test_helpers.act_as_service();
select is((select count(*)::int from pg_class c join j17c_tables x on x.t = c.relname where c.relnamespace = 'public'::regnamespace and c.relrowsecurity),
          5, 'j17_w7_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from information_schema.role_table_grants g join j17c_tables x on x.t = g.table_name
           where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
             and (g.privilege_type <> 'SELECT' or g.grantee <> 'authenticated')), 0, 'j17_w7_tables_rls_enabled_and_no_client_write_privileges');
select is((select count(*)::int from pg_policies p join j17c_tables x on x.t = p.tablename
           where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
             and coalesce(p.qual, p.with_check) = 'false'), 15, 'j17_w7_tables_rls_enabled_and_no_client_write_privileges');

-- ---------- per-audience reads ----------
select test_helpers.act_as(pg_temp.w(1));
-- Review polish: the worker reads no raw W7 rows (actor / approver / assessor ids); only the w7g read functions.
select is(pg_temp.visible(), 'certification_reassessments=0,certification_review_requests=0,certification_status_events=0,certifications=0,shop_certification_policies=0',
          'j17_worker_reads_only_own_certifications');
select is((select count(*)::int from public.my_certifications()), 2, 'j17_worker_reads_only_own_certifications');
select test_helpers.act_as(pg_temp.w(2));
select is((select array_agg(certification_id) from public.my_certifications()), array[pg_temp.id('c2')], 'j17_worker_reads_only_own_certifications');
select throws_ok(format('select * from public.certification_history(%L)', pg_temp.id('c1x')), '42501', 'Certification not found.',
                 'j17_worker_reads_only_own_certifications');
select test_helpers.act_as_owner('j17c-o1@local.test');
select is(pg_temp.visible(), 'certification_reassessments=0,certification_review_requests=1,certification_status_events=4,certifications=3,shop_certification_policies=1',
          'j17_issuing_owner_reads_only_own_shop_certifications');
select is((select count(*)::int from public.owner_certifications(current_setting('fx.s1')::uuid)), 3, 'j17_issuing_owner_reads_only_own_shop_certifications');
select is((select open_review_request_id from public.owner_certifications(current_setting('fx.s1')::uuid) limit 1), pg_temp.id('r1'),
          'j17_issuing_owner_reads_only_own_shop_certifications');
select test_helpers.act_as_owner('j17c-o2@local.test');
select is(pg_temp.visible(), 'certification_reassessments=0,certification_review_requests=0,certification_status_events=0,certifications=0,shop_certification_policies=0',
          'j17_issuing_owner_reads_only_own_shop_certifications');
select throws_ok(format('select * from public.owner_certifications(%L)', current_setting('fx.s1')), '42501', 'Shop not found.',
                 'j17_issuing_owner_reads_only_own_shop_certifications');
select throws_ok(format('select * from public.certification_history(%L)', pg_temp.id('c1x')), '42501', 'Certification not found.',
                 'j17_reasons_and_statements_not_visible_to_other_owners');
select is((select array_agg(certification_id) from public.applicant_verified_certifications(pg_temp.id('app'))), array[pg_temp.id('c1')],
          'j17_other_owner_sees_only_current_certs_inside_w5_window');
select is((select count(*)::int from public.my_certifications()), 0, 'j17_reasons_and_statements_not_visible_to_other_owners');
select is((select status from public.transition_job_application(pg_temp.id('app'), 'submitted', 'rejected')), 'rejected',
          'j17_other_owner_sees_only_current_certs_inside_w5_window');
select throws_ok(format('select * from public.applicant_verified_certifications(%L)', pg_temp.id('app')), '42501', 'Job application not found.',
                 'j17_other_owner_sees_only_current_certs_inside_w5_window');
select test_helpers.act_as_service();
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) arg where p.oid = 'public.applicant_verified_certifications(uuid)'::regprocedure
           and arg ~* '(reason|statement|status|history|comment)'), 0, 'j17_reasons_and_statements_not_visible_to_other_owners');
create function pg_temp.as_reader(p_who text) returns text language plpgsql as $$
begin
  if p_who = 'customer' then perform test_helpers.act_as_customer('j17c-cu@local.test');
  else perform test_helpers.act_as_admin('j17c-a1@local.test'); end if;
  return pg_temp.visible() || ',mine=' || (select count(*) from public.my_certifications());
end $$;
select is((select array_agg(pg_temp.as_reader(x) order by x) from unnest(array['admin', 'customer']) x),
          array_fill('certification_reassessments=0,certification_review_requests=0,certification_status_events=0,certifications=0,shop_certification_policies=0,mine=0'::text, array[2]),
          'j17_customer_anon_super_admin_read_no_certification_rows');
select test_helpers.act_as_anon();
select is((select count(*)::int from j17c_tables where test_helpers.attempt(format('select count(*) from public.%I', t)) = '42501'), 5,
          'j17_customer_anon_super_admin_read_no_certification_rows');

-- ---------- columns, functions, pinning, realtime, P35 ----------
select test_helpers.act_as_service();
create temporary table j17c_rpcs (sig) on commit drop as select unnest(array['issue_certification(uuid, uuid, text)',
  'set_shop_certification_validity(uuid, integer)', 'record_certification_reassessment(uuid, boolean[], text, text, text)',
  'renew_certification(uuid, uuid, text)', 'transition_certification(uuid, text, text, text)', 'request_certification_review(uuid, text)',
  'withdraw_certification_review(uuid)', 'decide_certification_review(uuid, text, text)', 'my_certifications()', 'certification_history(uuid)',
  'owner_certifications(uuid)', 'certifiable_enrollments(uuid)', 'certification_effective_status(text, timestamptz, timestamptz)',
  'certification_issuer_attestation_version()', 'is_current_certification_shop_owner(uuid)', 'can_read_certification(uuid)']);
create temporary table j17c_internal (sig) on commit drop as select unnest(array['shop_certification_validity_months(uuid)',
  'certification_renewal_window_open(timestamptz, timestamptz)', 'worker_holds_current_certification(uuid, timestamptz)',
  'worker_has_live_certification_for_program(uuid, uuid)', 'current_training_assessment_id(uuid)', 'certification_evidence_snapshot(uuid, uuid)',
  'certification_shop_verification_snapshot(uuid)', 'lock_certification_for_owner(uuid)', 'certification_actor_display_name(uuid, text)',
  'lock_certification_training(uuid, uuid)', 'certification_reason_or_fail(text)', 'certification_payload(public.certifications)',
  'enqueue_certification_expiry_notices(timestamptz)', 'insert_certification(public.training_enrollments, public.training_programs, public.training_assessments, public.certifications, uuid, jsonb)',
  'certifications_guard_write()', 'certifications_normalize()', 'certification_status_events_guard_write()', 'shop_certification_policies_guard_write()',
  'certification_review_requests_guard_write()', 'certification_reassessments_guard_write()', 'certifications_audit()',
  'certification_review_requests_audit()', 'certification_reassessments_audit()', 'shop_certification_policies_audit()',
  'training_evidence_flag_certifications()']);
grant all on j17c_rpcs, j17c_internal to public;
select is((select count(*)::int from information_schema.columns c join j17c_tables x on x.t = c.table_name
           where c.table_schema = 'public' and c.column_name ~* '(contact|phone|e_?mail|address)'), 0, 'j17_w7_reads_have_no_contact_columns');
select is((select count(*)::int from j17c_rpcs r, pg_proc p, unnest(coalesce(p.proargnames, '{}')) arg
           where p.oid = to_regprocedure('public.' || r.sig) and arg ~* '(contact|phone|e_?mail|address|headline)'), 0, 'j17_w7_reads_have_no_contact_columns');
select is((select count(*)::int from j17c_rpcs r where position('worker_private_contacts' in pg_get_functiondef(to_regprocedure('public.' || r.sig))) > 0),
          0, 'j17_w7_reads_have_no_contact_columns');
select is((select count(*)::int from j17c_internal where to_regprocedure('public.' || sig) is not null), 25, 'j17_w7_internal_functions_not_client_executable');
select is((select count(*)::int from j17c_internal i, unnest(array['anon', 'authenticated', 'service_role']) r(role_name)
           where has_function_privilege(r.role_name, to_regprocedure('public.' || i.sig), 'execute')), 0, 'j17_w7_internal_functions_not_client_executable');
select is((select count(*)::int from j17c_rpcs where to_regprocedure('public.' || sig) is not null
           and has_function_privilege('authenticated', to_regprocedure('public.' || sig), 'execute')
           and not has_function_privilege('anon', to_regprocedure('public.' || sig), 'execute')
           and not has_function_privilege('service_role', to_regprocedure('public.' || sig), 'execute')), 16, 'j17_w7_rpcs_denied_to_anon');
select test_helpers.act_as_anon();
select throws_ok(format('select public.issue_certification(%L, gen_random_uuid(), %L)', gen_random_uuid(), 'w7_issuer_v1'), '42501', null,
                 'j17_w7_rpcs_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int from (select to_regprocedure('public.' || sig) f from j17c_rpcs union all select to_regprocedure('public.' || sig) from j17c_internal) x
           join pg_proc p on p.oid = x.f where p.prosecdef and not coalesce(p.proconfig = array['search_path=public, pg_temp'], false)), 0,
          'j17_w7_definer_functions_pin_pg_temp_last');
select ok((select count(*) from (select to_regprocedure('public.' || sig) f from j17c_rpcs union all select to_regprocedure('public.' || sig) from j17c_internal) x
           join pg_proc p on p.oid = x.f where p.prosecdef) >= 30, 'j17_w7_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_publication_tables pt join j17c_tables x on x.t = pt.tablename
           where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'), 0, 'j17_w7_tables_not_in_realtime_publication');
select is((select count(*)::int from information_schema.columns c join j17c_tables x on x.t = c.table_name
           where c.table_schema = 'public' and c.column_name ~* '(fee|charge|deduct|price|cost|payment)')
          + (select count(*)::int from pg_proc p, unnest(coalesce(p.proargnames, '{}')) arg
             where p.pronamespace = 'public'::regnamespace and p.proname ~ 'certif' and arg ~* '(fee|charge|deduct|price|cost|payment)')
          + (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ 'certif'
             and p.prosrc ~* '(bookings|shop_pricing|quoted_price)')
          + (select count(*)::int from pg_constraint con join j17c_tables x on con.conrelid = ('public.' || x.t)::regclass
             where con.contype = 'f' and con.confrelid::regclass::text in ('bookings', 'shop_pricing')), 0,
          'j17_w7_no_fee_columns_parameters_or_booking_references');

select * from finish();
rollback;
