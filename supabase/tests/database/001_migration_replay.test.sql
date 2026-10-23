-- W1 migration replay: objects from each committed migration exist after
-- baseline + 5 migrations replayed in order, with the owner-policies baseline
-- (20260417000002) applied right after 2026_04_17 (AC2).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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
            ('20261021000001'), ('20261022000001'), ('20261022000002') $$,
  'replay_schema_migrations_has_baseline_and_five'
);

-- The owner booking policies come from the staged MIGRATION 20260417000002 (so later W2
-- migrations can replace them), not from the seed.
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
      and policyname in ('bookings_owner_select_local_test', 'bookings_owner_update_local_test')
  ),
  2,
  'replay_owner_booking_policies_from_baseline_migration'
);
select is(
  (
    select name from supabase_migrations.schema_migrations where version = '20260417000002'
  ),
  'local_test_baseline_owner_policies',
  'replay_owner_booking_policies_from_baseline_migration'
);

select * from finish();
rollback;
