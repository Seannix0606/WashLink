-- J17 (W3): workforce_audit_events is append-only and server-written (AC5), super_admin read
-- only (AC6), payload rules (AC8), realtime exclusion (AC11) and R-1 search_path pinning (AC4).
-- Local Docker stack only; fixtures are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j17a-c1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17a-o1@local.test')::text, true);
select set_config('fx.w1', test_helpers.create_worker('j17a-w1@local.test')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j17a-admin@local.test')::text, true);
select set_config('fx.s1', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'changes_requested')::text, true);
select set_config('fx.e1', public.record_workforce_audit_event('test.fixture_event', 'shop', gen_random_uuid(), null, '{}'::jsonb)::text, true);
select set_config('fx.e2', public.record_workforce_audit_event('test.fixture_purge', 'shop', gen_random_uuid(), null, '{}'::jsonb)::text, true);

select set_config('fx.insert_sql', $q$insert into public.workforce_audit_events (actor_kind, action, subject_type) values ('system', 'test.forged', 'shop')$q$, true);
select set_config('fx.update_sql', format($q$update public.workforce_audit_events set action = 'test.tampered' where id = %s$q$, current_setting('fx.e1')), true);
select set_config('fx.delete_sql', format('delete from public.workforce_audit_events where id = %s', current_setting('fx.e1')), true);

-- ---------- direct INSERT rejected for every role ----------
select test_helpers.act_as_anon();
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');
select test_helpers.act_as_customer('j17a-c1@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');
select test_helpers.act_as_owner('j17a-o1@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');
select test_helpers.act_as_worker('j17a-w1@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');
select test_helpers.act_as_admin('j17a-admin@local.test');
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');
-- A client that sets the writer flag itself still has no privilege.
select set_config('washlink.audit_writer', 'on', true);
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');
select set_config('washlink.audit_writer', 'off', true);
select test_helpers.act_as_service();
select is(test_helpers.attempt(current_setting('fx.insert_sql')), '42501', 'j17_audit_direct_insert_rejected_for_all_roles');

-- ---------- UPDATE rejected for every role (super_admin and trusted SQL included) ----------
select test_helpers.act_as_anon();
select is(test_helpers.attempt(current_setting('fx.update_sql')), '42501', 'j17_audit_update_rejected_for_all_roles');
select test_helpers.act_as_customer('j17a-c1@local.test');
select is(test_helpers.attempt(current_setting('fx.update_sql')), '42501', 'j17_audit_update_rejected_for_all_roles');
select test_helpers.act_as_owner('j17a-o1@local.test');
select is(test_helpers.attempt(current_setting('fx.update_sql')), '42501', 'j17_audit_update_rejected_for_all_roles');
select test_helpers.act_as_worker('j17a-w1@local.test');
select is(test_helpers.attempt(current_setting('fx.update_sql')), '42501', 'j17_audit_update_rejected_for_all_roles');
select test_helpers.act_as_admin('j17a-admin@local.test');
select is(test_helpers.attempt(current_setting('fx.update_sql')), '42501', 'j17_audit_update_rejected_for_all_roles');
select test_helpers.act_as_service();
select is(test_helpers.attempt(current_setting('fx.update_sql')), '42501', 'j17_audit_update_rejected_for_all_roles');
select is((select action from public.workforce_audit_events where id = current_setting('fx.e1')::bigint),
          'test.fixture_event', 'j17_audit_update_rejected_for_all_roles');

-- ---------- DELETE rejected for every role, and for trusted SQL without the purge flag ----------
select test_helpers.act_as_anon();
select is(test_helpers.attempt(current_setting('fx.delete_sql')), '42501', 'j17_audit_delete_rejected_for_all_roles');
select test_helpers.act_as_customer('j17a-c1@local.test');
select is(test_helpers.attempt(current_setting('fx.delete_sql')), '42501', 'j17_audit_delete_rejected_for_all_roles');
select test_helpers.act_as_owner('j17a-o1@local.test');
select is(test_helpers.attempt(current_setting('fx.delete_sql')), '42501', 'j17_audit_delete_rejected_for_all_roles');
select test_helpers.act_as_worker('j17a-w1@local.test');
select is(test_helpers.attempt(current_setting('fx.delete_sql')), '42501', 'j17_audit_delete_rejected_for_all_roles');
select test_helpers.act_as_admin('j17a-admin@local.test');
select is(test_helpers.attempt(current_setting('fx.delete_sql')), '42501', 'j17_audit_delete_rejected_for_all_roles');
select test_helpers.act_as_service();
select is(test_helpers.attempt(current_setting('fx.delete_sql')), '42501', 'j17_audit_delete_rejected_for_all_roles');
select is((select count(*)::int from public.workforce_audit_events where id = current_setting('fx.e1')::bigint),
          1, 'j17_audit_delete_rejected_for_all_roles');

-- ---------- TRUNCATE ----------
select is(test_helpers.attempt('truncate public.workforce_audit_events'), '42501', 'j17_audit_truncate_rejected');
select test_helpers.act_as_admin('j17a-admin@local.test');
select is(test_helpers.attempt('truncate public.workforce_audit_events'), '42501', 'j17_audit_truncate_rejected');

-- ---------- documented trusted retention path (inside this rolled-back transaction) ----------
select set_config('washlink.audit_retention_purge', 'on', true);
select is(test_helpers.attempt(format('delete from public.workforce_audit_events where id = %s', current_setting('fx.e2'))),
          '42501', 'j17_audit_trusted_retention_purge_path_allows_delete');
select test_helpers.act_as_service();
select is(test_helpers.attempt(format('delete from public.workforce_audit_events where id = %s', current_setting('fx.e2'))),
          'succeeded', 'j17_audit_trusted_retention_purge_path_allows_delete');
select is((select count(*)::int from public.workforce_audit_events where id = current_setting('fx.e2')::bigint),
          0, 'j17_audit_trusted_retention_purge_path_allows_delete');
select set_config('washlink.audit_retention_purge', 'off', true);

-- ---------- the writer function is internal ----------
select test_helpers.act_as_anon();
select is(test_helpers.attempt($$select public.record_workforce_audit_event('test.forged', 'shop', null, null, '{}'::jsonb)$$),
          '42501', 'j17_audit_record_function_not_callable_by_clients');
select test_helpers.act_as_customer('j17a-c1@local.test');
select is(test_helpers.attempt($$select public.record_workforce_audit_event('test.forged', 'shop', null, null, '{}'::jsonb)$$),
          '42501', 'j17_audit_record_function_not_callable_by_clients');
select test_helpers.act_as_admin('j17a-admin@local.test');
select is(test_helpers.attempt($$select public.record_workforce_audit_event('test.forged', 'shop', null, null, '{}'::jsonb)$$),
          '42501', 'j17_audit_record_function_not_callable_by_clients');
select test_helpers.act_as_service();
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('role', 'service_role', true);
select throws_ok($$select public.record_workforce_audit_event('test.forged', 'shop', null, null, '{}'::jsonb)$$,
                 '42501', null, 'j17_audit_record_function_not_callable_by_clients');
select set_config('role', 'none', true);

-- ---------- actor fields are derived ----------
select test_helpers.act_as_service();
select is((select array_to_string(p.proargnames, ',') from pg_proc p
           where p.oid = 'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)'::regprocedure),
          'p_action,p_subject_type,p_subject_id,p_subject_profile_id,p_payload',
          'j17_audit_actor_fields_derived_not_passed');
select is((select jsonb_build_object('actor_id', actor_id, 'actor_role', actor_role, 'actor_kind', actor_kind)
           from public.workforce_audit_events where id = current_setting('fx.e1')::bigint),
          jsonb_build_object('actor_id', null, 'actor_role', null, 'actor_kind', 'trusted_session'),
          'j17_audit_actor_fields_derived_not_passed');
select test_helpers.act_as_owner('j17a-o1@local.test');
select (public.submit_shop_for_verification(current_setting('fx.s1')::uuid)).id is not null as submitted;
select test_helpers.act_as_service();
select is((select jsonb_build_object('actor_id', actor_id, 'actor_role', actor_role, 'actor_kind', actor_kind)
           from public.workforce_audit_events
           where subject_id = current_setting('fx.s1')::uuid and action = 'shop.verification_submitted'),
          jsonb_build_object('actor_id', current_setting('fx.o1')::uuid, 'actor_role', 'owner', 'actor_kind', 'user'),
          'j17_audit_actor_fields_derived_not_passed');

-- ---------- created_at is forced to now() ----------
select set_config('washlink.audit_writer', 'on', true);
insert into public.workforce_audit_events (actor_kind, action, subject_type, created_at)
values ('system', 'test.backdated', 'shop', '2000-01-01T00:00:00Z');
select set_config('washlink.audit_writer', 'off', true);
select is((select created_at from public.workforce_audit_events where action = 'test.backdated'),
          now(), 'j17_audit_created_at_cannot_be_backdated');
select set_config('washlink.audit_writer', 'on', true);
select is(test_helpers.attempt($$insert into public.workforce_audit_events (id, actor_kind, action, subject_type) values (1, 'system', 'test.forged_id', 'shop')$$),
          '428C9', 'j17_audit_created_at_cannot_be_backdated');
select set_config('washlink.audit_writer', 'off', true);

-- ---------- read access: super_admin only ----------
select set_config('fx.total', (select count(*) from public.workforce_audit_events)::text, true);
select test_helpers.act_as_customer('j17a-c1@local.test');
select is((select count(*)::int from public.workforce_audit_events), 0, 'j17_audit_readable_only_by_super_admin');
select test_helpers.act_as_owner('j17a-o1@local.test');
select is((select count(*)::int from public.workforce_audit_events), 0, 'j17_audit_readable_only_by_super_admin');
select test_helpers.act_as_worker('j17a-w1@local.test');
select is((select count(*)::int from public.workforce_audit_events), 0, 'j17_audit_readable_only_by_super_admin');
select test_helpers.act_as_anon();
select is(test_helpers.attempt('select count(*) from public.workforce_audit_events'), '42501', 'j17_audit_readable_only_by_super_admin');
select test_helpers.act_as_admin('j17a-admin@local.test');
select is((select count(*)::int from public.workforce_audit_events), current_setting('fx.total')::int,
          'j17_audit_readable_only_by_super_admin');

-- ---------- payload rules (P13) ----------
select test_helpers.act_as_service();
create function pg_temp.record_payload(p_payload jsonb) returns text language sql as $$
  select test_helpers.attempt(format(
    'select public.record_workforce_audit_event(%L, %L, null, null, %L::jsonb)',
    'test.payload_probe', 'shop', p_payload::text))
$$;
select is(pg_temp.record_payload('{"phone": "x"}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"email": "x"}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"notes": "x"}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"code_hash": "x"}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"meta": {"storage_path": "x"}}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"value": "someone@example.invalid"}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"value": "+63 (912) 345-6789"}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload(jsonb_build_object('value', repeat('a', 200))), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"value": 1000000}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload('{"a": {"b": {"c": {"d": 1}}}}'), '23514', 'j17_audit_payload_rejects_contact_and_free_text');
select is(pg_temp.record_payload(jsonb_build_object('to_status', 'approved', 'reviewed_at', now(),
                                                    'reviewed_by', gen_random_uuid(), 'changed_fields', array['name', 'address'])),
          'succeeded', 'j17_audit_payload_rejects_contact_and_free_text');

-- ---------- realtime ----------
select is((select count(*)::int from pg_publication where pubname = 'supabase_realtime' and puballtables),
          0, 'j17_audit_and_notifications_not_in_realtime_publication');
select is((select count(*)::int from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename in ('workforce_audit_events', 'notifications')),
          0, 'j17_audit_and_notifications_not_in_realtime_publication');

-- ---------- R-1: pg_temp last in every pinned search_path ----------
select is((select count(*)::int from unnest(array[
             'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)', 'public.current_user_profile_role()',
             'public.sanitize_profile_role_on_insert()', 'public.guard_profile_protected_columns()',
             'public.guard_shop_insert()', 'public.prevent_owner_verification_mutation()',
             'public.submit_shop_for_verification(uuid)', 'public.guard_verification_document_write()',
             'public.is_verified_shop_owner(uuid)', 'public.guard_booking_insert()',
             'public.guard_booking_update()', 'public.guard_worker_roster_write()',
             'public.approved_shop_names_for_owner(uuid)', 'public.unlink_my_roster_entry(uuid)',
             'public.list_my_roster_links()', 'public.roster_link_code_hash(text)',
             'public.require_worker_caller()', 'public.roster_link_check_rate_limit(uuid, bytea)',
             'public.create_roster_link_code(uuid)', 'public.preview_roster_link_code(text)',
             'public.accept_roster_link_code(text)', 'public.is_trusted_db_session()',
             'public.profile_protected_column_changes(jsonb, jsonb)',
             'public.normalize_worker_text_list(text[], integer, text)',
             'public.normalize_worker_profile()', 'public.stamp_worker_private_contact()',
             'public.is_super_admin()', 'public.set_booking_quote_from_shop_pricing()']) signature
           join pg_proc p on p.oid = to_regprocedure(signature)
           where p.proconfig = array['search_path=public, pg_temp']),
          28, 'j17_definer_functions_pin_pg_temp_last');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('workforce_audit_payload_is_safe', 'workforce_audit_events_guard_insert',
               'workforce_audit_events_guard_update', 'workforce_audit_events_guard_delete',
               'record_workforce_audit_event', 'notification_text_is_safe', 'notification_safe_label',
               'notifications_guard_insert', 'notifications_guard_update', 'enqueue_notification',
               'mark_notifications_read', 'enqueue_notification_safely', 'audit_shop_verification_change',
               'audit_roster_link_code_issue', 'audit_roster_link_change', 'audit_roster_linked_delete',
               'audit_worker_profile_delete', 'audit_profile_role_change')
             and p.proconfig = array['search_path=public, pg_temp']),
          18, 'j17_definer_functions_pin_pg_temp_last');
select is((select proconfig from pg_proc
           where oid = 'public.can_manage_shop_verification_storage(text)'::regprocedure),
          array['search_path=public, auth, pg_temp'], 'j17_definer_functions_pin_pg_temp_last');
-- Only the baseline-only signup function (production name unknown, D-10 row 17) is exempt
-- (public and washlink_private; the W3a final assertion enforces the same at migration time).
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'washlink_private') and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting
                             where setting like 'search_path=%pg_temp')),
          array['handle_new_user'], 'j17_definer_functions_pin_pg_temp_last');

-- ---------- temp-table shadowing cannot fool definer code ----------
select test_helpers.act_as_customer('j17a-c1@local.test');
select ok(
  case when has_database_privilege('authenticated', current_database(), 'TEMP')
    then test_helpers.attempt('create temp table profiles (id uuid primary key, role text not null)') = 'succeeded'
    else test_helpers.attempt('create temp table profiles (id uuid primary key, role text not null)') = '42501'
  end,
  'j17_definer_function_ignores_temp_table_shadowing');
select test_helpers.attempt($$insert into pg_temp.profiles (id, role) values (auth.uid(), 'super_admin')$$) is not null as shadow_seeded;
select is(public.is_super_admin(), false, 'j17_definer_function_ignores_temp_table_shadowing');
select is(public.current_user_profile_role(), 'customer', 'j17_definer_function_ignores_temp_table_shadowing');

select * from finish();
rollback;
