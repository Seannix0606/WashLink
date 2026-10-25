-- J17 (W4): job opening privileges, internal functions, super_admin write denial, search_path
-- pinning, realtime exclusion, the shared verified-shop rule (R-2), cascades and the trusted
-- repair path. Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j17w4-a1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17w4-o1@local.test')::text, true);
select set_config('fx.om', test_helpers.create_owner('j17w4-om@local.test')::text, true);
select set_config('fx.od', test_helpers.create_owner('j17w4-od@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j17w4-w1@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_verified_shop(current_setting('fx.o1')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.j_draft', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17 draft')::text, true);
select set_config('fx.j_pub', test_helpers.create_job_opening(current_setting('fx.s1')::uuid, 'J17 published')::text, true);
update public.job_openings set status = 'published', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.j_pub')::uuid;

-- ---------- table privileges and RLS ----------
select ok((select relrowsecurity from pg_class where oid = 'public.job_openings'::regclass),
          'j17_job_openings_rls_enabled_and_anon_has_no_privileges');
select is((select count(*)::int from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
           where has_table_privilege('anon', 'public.job_openings', p)),
          0, 'j17_job_openings_rls_enabled_and_anon_has_no_privileges');
select is((select array_agg(policyname::text order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'job_openings'),
          array['jo_delete_owner_draft', 'jo_insert_owner', 'jo_select_owner', 'jo_select_published_for_workers',
                'jo_select_super_admin_non_draft', 'jo_update_owner'],
          'j17_job_openings_rls_enabled_and_anon_has_no_privileges');
select test_helpers.act_as_anon();
select is(test_helpers.attempt($$ insert into public.job_openings (shop_id, title) values (gen_random_uuid(), 'Anon draft') $$),
          '42501', 'j17_job_openings_rls_enabled_and_anon_has_no_privileges');

-- ---------- RPC and internal functions ----------
select test_helpers.act_as_service();
select ok(not has_function_privilege('anon', 'public.transition_job_opening(uuid, text, text)', 'execute')
          and has_function_privilege('authenticated', 'public.transition_job_opening(uuid, text, text)', 'execute'),
          'j17_transition_rpc_denied_to_anon');
select test_helpers.act_as_anon();
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_draft')::uuid, 'draft', 'published') $$,
                 '42501', null, 'j17_transition_rpc_denied_to_anon');
select test_helpers.act_as_service();
select is((select count(*)::int
           from unnest(array['public.job_openings_guard_write()', 'public.job_openings_normalize()', 'public.job_openings_audit()']) f
           cross join unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, f, 'execute')),
          0, 'j17_job_opening_internal_functions_not_client_executable');
select is((select count(*)::int
           from unnest(array['public.approved_shop_names_for_owner(uuid)']) f
           cross join unnest(array['anon', 'authenticated']) r
           where has_function_privilege(r, f, 'execute')),
          0, 'j17_job_opening_internal_functions_not_client_executable');
select ok(not has_function_privilege('anon', 'public.shop_has_recorded_verification(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.job_opening_missing_publish_fields(public.job_openings)', 'execute'),
          'j17_job_opening_internal_functions_not_client_executable');

-- ---------- super_admin cannot write ----------
select test_helpers.act_as_admin('j17w4-a1@local.test');
select throws_ok($$ insert into public.job_openings (shop_id, title) values (current_setting('fx.s1')::uuid, 'Admin draft') $$,
                 '42501', 'Only owner accounts can create job openings.', 'j17_super_admin_cannot_write_job_openings');
with updated as (update public.job_openings set benefits = 'Admin edit' where id = current_setting('fx.j_pub')::uuid returning 1)
select is(count(*)::int, 0, 'j17_super_admin_cannot_write_job_openings') from updated;
with deleted as (delete from public.job_openings where id in (current_setting('fx.j_pub')::uuid, current_setting('fx.j_draft')::uuid) returning 1)
select is(count(*)::int, 0, 'j17_super_admin_cannot_write_job_openings') from deleted;
select throws_ok($$ select public.transition_job_opening(current_setting('fx.j_pub')::uuid, 'published', 'closed') $$,
                 '42501', 'Job opening not found.', 'j17_super_admin_cannot_write_job_openings');
select test_helpers.act_as_service();
select is((select count(*)::int from public.job_openings
           where id in (current_setting('fx.j_pub')::uuid, current_setting('fx.j_draft')::uuid) and benefits is null),
          2, 'j17_super_admin_cannot_write_job_openings');

-- ---------- pinning ----------
select is((select count(*)::int from unnest(array[
             'public.shop_has_recorded_verification(uuid)', 'public.is_verified_shop_owner(uuid)',
             'public.approved_shop_names_for_owner(uuid)', 'public.job_opening_missing_publish_fields(public.job_openings)',
             'public.job_openings_normalize()', 'public.job_openings_guard_write()',
             'public.transition_job_opening(uuid, text, text)', 'public.job_openings_audit()']) signature
           join pg_proc p on p.oid = to_regprocedure(signature)
           where p.proconfig = array['search_path=public, pg_temp']),
          8, 'j17_w4_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and p.proname in ('shop_has_recorded_verification', 'is_verified_shop_owner', 'approved_shop_names_for_owner',
                               'job_openings_guard_write', 'transition_job_opening', 'job_openings_audit')),
          6, 'j17_w4_definer_functions_pin_pg_temp_last');
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'washlink_private') and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting
                             where setting like 'search_path=%pg_temp')),
          array['handle_new_user'], 'j17_w4_definer_functions_pin_pg_temp_last');

-- ---------- realtime ----------
select is((select count(*)::int from pg_publication where pubname = 'supabase_realtime' and puballtables),
          0, 'j17_job_openings_not_in_realtime_publication');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_openings'),
          0, 'j17_job_openings_not_in_realtime_publication');

-- ---------- R-2: one verified-shop rule ----------
insert into public.shops (owner_id, name, address, is_active, verification_status, verification_reviewed_by, verification_reviewed_at)
values (current_setting('fx.om')::uuid, 'M1 verified', 'Local test address', true, 'approved', current_setting('fx.a1')::uuid, now()),
       (current_setting('fx.om')::uuid, 'M2 no reviewer', 'Local test address', true, 'approved', null, now()),
       (current_setting('fx.om')::uuid, 'M3 no review time', 'Local test address', true, 'approved', current_setting('fx.a1')::uuid, null),
       (current_setting('fx.om')::uuid, 'M4 inactive', 'Local test address', false, 'approved', current_setting('fx.a1')::uuid, now()),
       (current_setting('fx.om')::uuid, 'M5 pending', 'Local test address', true, 'pending', null, null),
       (current_setting('fx.om')::uuid, 'M6 changes requested', 'Local test address', true, 'changes_requested', current_setting('fx.a1')::uuid, now()),
       (current_setting('fx.om')::uuid, 'M7 rejected', 'Local test address', true, 'rejected', current_setting('fx.a1')::uuid, now());
select is((select array_agg(name order by name) from public.shops
           where owner_id = current_setting('fx.om')::uuid and public.shop_has_recorded_verification(id)),
          array['M1 verified'], 'j17_shared_verified_rule_matches_gate_and_shop_names');
select is(public.approved_shop_names_for_owner(current_setting('fx.om')::uuid), array['M1 verified'],
          'j17_shared_verified_rule_matches_gate_and_shop_names');
select set_config('fx.m_ids', (select string_agg(id::text, ',' order by name) from public.shops
                               where owner_id = current_setting('fx.om')::uuid), true);
select test_helpers.act_as_owner('j17w4-om@local.test');
select is((select count(*)::int from unnest(string_to_array(current_setting('fx.m_ids'), ',')::uuid[]) shop_id
           where public.is_verified_shop_owner(shop_id) is distinct from public.shop_has_recorded_verification(shop_id)),
          0, 'j17_shared_verified_rule_matches_gate_and_shop_names');
select is((select count(*)::int from unnest(string_to_array(current_setting('fx.m_ids'), ',')::uuid[]) shop_id
           where public.is_verified_shop_owner(shop_id)),
          1, 'j17_shared_verified_rule_matches_gate_and_shop_names');

-- Preview and list_my_roster_links name only the shop with a recorded review.
select test_helpers.act_as_service();
select set_config('fx.wm', test_helpers.create_roster_worker(current_setting('fx.om')::uuid)::text, true);
select test_helpers.act_as_owner('j17w4-om@local.test');
select set_config('fx.code', (select link_code from public.create_roster_link_code(current_setting('fx.wm')::uuid)), true);
select test_helpers.act_as_worker('j17w4-w1@local.test');
select is((select owner_shop_names from public.preview_roster_link_code(current_setting('fx.code'))), array['M1 verified'],
          'j17_approved_shop_names_require_recorded_review');
select is((select result from public.accept_roster_link_code(current_setting('fx.code'))), 'linked',
          'j17_approved_shop_names_require_recorded_review');
select is((select owner_shop_names from public.list_my_roster_links() where worker_row_id = current_setting('fx.wm')::uuid),
          array['M1 verified'], 'j17_approved_shop_names_require_recorded_review');

-- ---------- cascades keep the audit trail ----------
select test_helpers.act_as_owner('j17w4-o1@local.test');
select lives_ok($$ delete from public.shops where id = current_setting('fx.s1')::uuid $$, 'j17_shop_deletion_cascades_openings_and_keeps_audit');
select test_helpers.act_as_service();
select is((select count(*)::int from public.job_openings where shop_id = current_setting('fx.s1')::uuid), 0,
          'j17_shop_deletion_cascades_openings_and_keeps_audit');
select is((select array_agg(payload ->> 'deleted_by' order by payload ->> 'from_status') from public.workforce_audit_events
           where action = 'job_opening.deleted'
             and subject_id in (current_setting('fx.j_draft')::uuid, current_setting('fx.j_pub')::uuid)),
          array['shop_deleted', 'shop_deleted'], 'j17_shop_deletion_cascades_openings_and_keeps_audit');
select is((select count(*)::int from public.workforce_audit_events
           where subject_type = 'job_opening' and action = 'job_opening.created'
             and subject_id in (current_setting('fx.j_draft')::uuid, current_setting('fx.j_pub')::uuid)),
          2, 'j17_shop_deletion_cascades_openings_and_keeps_audit');

select set_config('fx.sd', test_helpers.create_verified_shop(current_setting('fx.od')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.jd', test_helpers.create_job_opening(current_setting('fx.sd')::uuid, 'J17 owner deleted')::text, true);
update public.job_openings set status = 'paused', first_published_at = now(), status_changed_at = now()
where id = current_setting('fx.jd')::uuid;
select lives_ok($$ delete from auth.users where id = current_setting('fx.od')::uuid $$, 'j17_owner_account_deletion_cascades_openings');
select is((select count(*)::int from public.job_openings where id = current_setting('fx.jd')::uuid), 0,
          'j17_owner_account_deletion_cascades_openings');
select is((select payload ->> 'deleted_by' from public.workforce_audit_events
           where action = 'job_opening.deleted' and subject_id = current_setting('fx.jd')::uuid),
          'owner_account_deleted', 'j17_owner_account_deletion_cascades_openings');

-- ---------- trusted session repair ----------
select set_config('fx.sr', test_helpers.create_verified_shop(current_setting('fx.om')::uuid, current_setting('fx.a1')::uuid)::text, true);
select set_config('fx.jr', test_helpers.create_job_opening(current_setting('fx.sr')::uuid, 'J17 repair')::text, true);
update public.job_openings set status = 'closed', status_changed_at = now(), first_published_at = now()
where id = current_setting('fx.jr')::uuid;
select lives_ok($$ update public.job_openings set status = 'paused' where id = current_setting('fx.jr')::uuid $$,
                'j17_trusted_session_can_repair_job_opening_status');
select is((select row(actor_kind, actor_id is null, payload ->> 'from_status', payload ->> 'to_status')::text
           from public.workforce_audit_events
           where action = 'job_opening.status_changed' and subject_id = current_setting('fx.jr')::uuid
           order by id desc limit 1),
          row('trusted_session'::text, true, 'closed'::text, 'paused'::text)::text,
          'j17_trusted_session_can_repair_job_opening_status');

select * from finish();
rollback;
