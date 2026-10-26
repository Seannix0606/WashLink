-- W1..W9 migration replay: objects from each committed migration exist after
-- baseline + 60 migrations (5 pre-W2, 6 W2, 5 W3, 4 W4, 5 W5, 9 W6, 8 W7, 8 W8, 10 W9) replayed in order, with the owner-policies
-- baseline (20260417000002) applied right after 2026_04_17 (W1..W9 AC2; 62 staged migrations in total).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
            ('20261026000024'), ('20261026000025'), ('20261026000026') $$,
  'replay_schema_migrations_has_baseline_w2_to_w9'
);

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
