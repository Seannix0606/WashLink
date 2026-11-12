-- W1..W16 migration replay: objects from each committed migration exist after
-- baseline + 97 migrations (5 pre-W2, 6 W2, 5 W3, 4 W4, 5 W5, 9 W6, 8 W7, 8 W8, 10 W9, 7 W10, 9 W11, 9 W14, 5 W12, 4 W13, 1 W15, 2 W16)
-- replayed in order, with the owner-policies baseline (20260417000002) applied right after 2026_04_17 (W1..W14 AC2; W13 AC2;
-- W15 AC2; W16 AC2; B2C adds 14 and OP-1 adds 1, for 114 staged migrations in total).
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- 2026_04_17
select has_table('public', 'shops', 'replay_shops_created');

-- 2026_04_18 rewrote the baseline role CHECK to include super_admin.
select ok(
  (
    select pg_get_constraintdef(con.oid) like '%super_admin%'
    from pg_constraint con
    where con.conrelid = 'public.profiles'::regclass
      and con.conname = 'profiles_role_check'
  ),
  'replay_profiles_role_check_allows_super_admin'
);

-- 2026_10_21
select has_trigger(
  'public', 'bookings', 'bookings_set_quote_from_shop_pricing',
  'replay_bookings_quote_trigger_exists'
);

-- 2026_10_22 notes and ratings
select is(
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name in (
        'customer_notes', 'customer_rating_stars', 'customer_rating_comment', 'customer_rated_at'
      )
  ),
  4,
  'replay_bookings_rating_columns_exist'
);

-- 2026_10_22 storage fix replaced all four storage policies.
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'svd_storage_select_owner_or_admin', 'svd_storage_insert_owner',
        'svd_storage_update_owner', 'svd_storage_delete_owner'
      )
      and (
        coalesce(qual, '') like '%can_manage_shop_verification_storage%'
        or coalesce(with_check, '') like '%can_manage_shop_verification_storage%'
      )
  ),
  4,
  'replay_storage_policies_replaced'
);

select results_eq(
  $$ select version from supabase_migrations.schema_migrations order by version $$,
  $$ values ('00000000000000'::text), ('20260417000001'), ('20260417000002'), ('20260418000001'),
            ('20261021000001'), ('20261022000001'), ('20261022000002'),
            ('20261024000001'), ('20261024000002'), ('20261024000003'),
            ('20261024000004'), ('20261024000005'), ('20261024000006'),
            ('20261024000007'), ('20261024000008'), ('20261024000009'), ('20261024000010'),
            ('20261024000011'), ('20261024000012'), ('20261024000013'), ('20261024000014'),
            ('20261024000015'), ('20261025000001'), ('20261025000002'), ('20261025000003'),
            ('20261025000004'), ('20261025000005'), ('20261025000006'), ('20261025000007'),
            ('20261025000008'), ('20261025000009'), ('20261025000010'), ('20261025000011'), ('20261025000012'),
            ('20261025000013'), ('20261025000014'), ('20261026000001'), ('20261026000002'), ('20261026000003'),
            ('20261026000004'), ('20261026000005'), ('20261026000006'), ('20261026000007'), ('20261026000008'),
            ('20261026000009'), ('20261026000010'), ('20261026000011'), ('20261026000012'), ('20261026000013'),
            ('20261026000014'), ('20261026000015'), ('20261026000016'), ('20261026000017'), ('20261026000018'),
            ('20261026000019'), ('20261026000020'), ('20261026000021'), ('20261026000022'), ('20261026000023'),
            ('20261026000024'), ('20261026000025'), ('20261026000026'), ('20261028000001'), ('20261028000002'),
            ('20261028000003'), ('20261028000004'), ('20261028000005'), ('20261028000006'), ('20261028000007'),
            ('20261029000001'), ('20261029000002'), ('20261029000003'), ('20261029000004'), ('20261029000005'),
            ('20261029000006'), ('20261029000007'), ('20261029000008'), ('20261029000009'), ('20261029000010'),
            ('20261029000011'), ('20261029000012'), ('20261029000013'), ('20261029000014'), ('20261029000015'),
            ('20261029000016'), ('20261029000017'), ('20261029000018'), ('20261030000001'), ('20261030000002'),
            ('20261030000003'), ('20261030000004'), ('20261030000005'), ('20261030000006'),
            ('20261030000007'), ('20261030000008'), ('20261030000009'), ('20261103000001'),
            ('20261104000001'), ('20261104000002'), ('20261106000001'), ('20261106000002'),
            ('20261106000003'), ('20261106000004'), ('20261106000005'), ('20261106000006'),
            ('20261106000007'), ('20261106000008'), ('20261106000009'), ('20261106000010'), ('20261106000011'),
            ('20261106000012'), ('20261106000013'), ('20261106000014'),
            ('20261108000001'), ('20261112000001'), ('20261113000001') $$,
  'replay_schema_migrations_has_baseline_w2_to_w14_w12_and_w13'
);

-- B2C-7 objects
select has_table('public', 'independent_worker_document_types', 'replay_b2c7_document_types_table');
select has_table('public', 'independent_worker_documents', 'replay_b2c7_documents_table');
select has_table('public', 'independent_worker_document_file_queue', 'replay_b2c7_file_queue_table');
select is((select count(*)::int from storage.buckets where id = 'worker-verification-documents' and not public), 1, 'replay_b2c7_private_bucket');

-- The local-test owner booking policies come from the staged MIGRATION 20260417000002, not
-- the seed, so W2c (20261024000003) can replace them with bookings_*_shop_owner.
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
      and policyname like '%_local_test'
  ),
  0,
  'replay_owner_booking_policies_replaced_by_w2'
);
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
      and policyname in ('bookings_select_shop_owner', 'bookings_update_shop_owner')
  ),
  2,
  'replay_owner_booking_policies_replaced_by_w2'
);
select is(
  (
    select name from supabase_migrations.schema_migrations where version = '20260417000002'
  ),
  'local_test_baseline_owner_policies',
  'replay_owner_booking_policies_from_baseline_migration'
);

-- W2 objects
select has_trigger('public', 'profiles', 'profiles_sanitize_role_on_insert', 'replay_w2_guard_triggers_exist');
select is(
  (
    select count(*)::int from pg_trigger
    where not tgisinternal and tgname in (
      'profiles_guard_protected_columns', 'shops_guard_insert', 'svd_guard_path_and_uploader',
      'bookings_guard_insert', 'bookings_guard_update', 'workers_guard_write',
      'worker_profiles_normalize', 'worker_private_contacts_stamp'
    )
  ),
  8,
  'replay_w2_guard_triggers_exist'
);
select is(
  (
    select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'is_trusted_db_session', 'current_user_profile_role', 'submit_shop_for_verification',
      'is_verified_shop_owner', 'create_roster_link_code', 'preview_roster_link_code',
      'accept_roster_link_code', 'unlink_my_roster_entry', 'list_my_roster_links'
    )
  ),
  9,
  'replay_w2_functions_exist'
);
-- Every W2 table has RLS enabled.
select is(
  (
    select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity and c.relname in (
      'worker_profiles', 'worker_private_contacts',
      'worker_roster_link_codes', 'worker_roster_link_attempts'
    )
  ),
  4,
  'replay_w2_tables_have_rls_enabled'
);
-- Every W3 table has RLS enabled.
select is(
  (
    select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('workforce_audit_events', 'notifications')
  ),
  2,
  'replay_w3_tables_have_rls_enabled'
);
-- The W4 table has RLS enabled.
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'job_openings'),
  'replay_w4_job_openings_rls_enabled'
);
-- The W5 table has RLS enabled.
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'job_applications'),
  'replay_w5_job_applications_rls_enabled'
);
-- Every W6 table has RLS enabled.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in (
     'training_programs', 'training_program_trainers', 'training_sessions', 'training_enrollments',
     'training_attendance_records', 'training_assessments')),
  6,
  'replay_w6_training_tables_rls_enabled'
);
-- Every W7 table has RLS enabled.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in (
     'shop_certification_policies', 'certifications', 'certification_status_events',
     'certification_review_requests', 'certification_reassessments')),
  5,
  'replay_w7_certification_tables_rls_enabled'
);
-- Every W8 table has RLS enabled.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in (
     'contract_template_sections', 'contract_template_placeholders', 'worker_classification_options',
     'contract_templates', 'contract_template_versions', 'contract_template_clauses')),
  6,
  'replay_w8_contract_template_tables_rls_enabled'
);
-- Every W9 table has RLS enabled.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in (
     'contract_acknowledgement_texts', 'contract_problem_term_rules', 'worker_contracts', 'contract_versions',
     'contract_version_clauses', 'contract_version_flags', 'contract_acceptances', 'retained_job_application_records')),
  8,
  'replay_w9_worker_contract_tables_rls_enabled'
);
-- Both W10 tables have RLS enabled.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in ('workforce_policies', 'worker_owner_relationships')),
  2,
  'replay_w10_relationship_and_policy_tables_rls_enabled'
);
-- Both W11 tables have RLS enabled.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity and c.relname in ('certification_platform_reviews', 'worker_contract_disputes')),
  2,
  'replay_w11_review_and_dispute_tables_rls_enabled'
);
-- Every W14 table has RLS enabled.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity and c.relname in (
             'job_opening_moderation_cases', 'job_opening_reports', 'job_opening_moderation_actions', 'admin_access_records')),
          4, 'replay_w14_moderation_tables_rls_enabled');
-- Both W12 tables have RLS enabled.
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relrowsecurity and c.relname in ('notification_categories', 'workforce_scheduled_jobs')),
          2, 'replay_w12_registry_and_job_state_rls_enabled');
-- W13 (D-70): the raw audit table has no client select policy other than the deny-all one.
select is((select string_agg(policyname || ':' || coalesce(qual, ''), ',' order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'workforce_audit_events' and cmd in ('SELECT', 'ALL')),
          'wae_no_client_select:false', 'replay_w13_audit_table_has_no_client_select_policy');
-- W15 (D-79): the private link-history table (RLS on, no policies), its AFTER trigger on workers, and the backfill
-- (every currently linked roster row has a history row).
select is((select c.relrowsecurity::text || ',' || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'roster_link_history')
                  || ',' || (select count(*) from pg_trigger g where g.tgrelid = 'public.workers'::regclass and g.tgname = 'workers_record_link_history'
                             and not g.tgisinternal)
                  || ',' || (select count(*) from public.workers w where w.user_id is not null and not exists (
                               select 1 from public.roster_link_history h where h.worker_row_id = w.id and h.user_id = w.user_id))
           from pg_class c where c.oid = to_regclass('public.roster_link_history')),
          'true,0,1,0', 'replay_w15_link_history_table_trigger_and_backfill_present');
-- W16 (D-83, D-87): the gate no longer needs the training shop and reads "not completed"; the core text pin is a deferred constraint trigger.
select is((select (p.prosrc !~ 'e.shop_id')::text || ',' || (p.prosrc ~ '<> ''completed''')::text from pg_proc p
           where p.oid = 'public.roster_worker_in_required_training(uuid, uuid)'::regprocedure)
          || ',' || (select g.tgdeferrable::text || ',' || g.tginitdeferred::text from pg_trigger g where g.tgrelid = 'public.contract_template_versions'::regclass
                     and g.tgname = 'contract_template_versions_zz_core_text_pin' and not g.tgisinternal),
          'true,true,true,true', 'replay_w16_gate_and_core_pin_present');
-- No public SECURITY DEFINER function runs without a pinned search_path.
select is(
  (
    select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) setting
        where setting like 'search_path=public%'
      )
  ),
  0,
  'replay_definer_functions_pin_search_path'
);
select ok(
  (select convalidated from pg_constraint
   where conrelid = 'public.workers'::regclass and conname = 'workers_user_id_fkey'),
  'replay_workers_user_id_fk_validated'
);

select * from finish();
rollback;
