-- =============================================================
-- WashLink W2a - session helpers, signup role whitelist, immutable profile role,
-- scoped profile reads (closes E1, E2, S4, S5; D-8, D-9).
-- Idempotent. Restrictions live in BEFORE triggers (W2 PLAN P1) so they hold
-- whatever (unknown, D-10) RLS policies production has.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Session helpers (P5)
-- -------------------------------------------------------------
-- Fails closed (fix cycle 1). True only for
--   (a) a request whose JWT role is service_role, or
--   (b) a session with NO request.jwt claims at all whose session_user is not one of the
--       API service logins (authenticator = PostgREST, supabase_auth_admin = GoTrue,
--       supabase_storage_admin = Storage): SQL editor / psql / migrations and the local
--       test act_as_service().
-- False for every end-user JWT (also super_admin), anon (with or without a JWT) and
-- GoTrue's own DB session. GUC + session_user based, so it is also correct inside
-- SECURITY DEFINER code (current_user changes there; claims and session_user do not).
create or replace function public.is_trusted_db_session()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or (coalesce(auth.jwt(), '{}'::jsonb) = '{}'::jsonb
        and session_user::text not in ('authenticator', 'supabase_auth_admin', 'supabase_storage_admin'));
$$;

revoke all on function public.is_trusted_db_session() from public, anon;
grant execute on function public.is_trusted_db_session() to authenticated;

-- S-B1 (fix cycle 1): true iff the ONLY changes between p_old and p_new are single-column
-- foreign keys declared `on delete set null` going from a value to null while the
-- referenced row no longer exists, i.e. the FK cascade itself (customer, worker account,
-- reviewing admin, roster row or shop deleted). Any other changed column -> false.
-- Used first in every UPDATE guard so cascades from GoTrue (supabase_auth_admin, not a
-- trusted session) and from owner deletes are never rejected. Definer: must see the
-- parent row (e.g. profiles) regardless of the caller's RLS.
create or replace function public.is_orphaned_fk_set_null(
  p_table regclass,
  p_old jsonb,
  p_new jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  changed record;
  fk record;
  parent_exists boolean;
  any_change boolean := false;
begin
  for changed in
    select entry.key, p_old -> entry.key as old_value, entry.value as new_value
    from jsonb_each(p_new) entry
    where entry.value is distinct from (p_old -> entry.key)
  loop
    any_change := true;
    if changed.new_value is distinct from 'null'::jsonb
       or changed.old_value is null
       or changed.old_value = 'null'::jsonb
    then
      return false;
    end if;
    select con.confrelid::regclass::text as parent_table,
           parent_att.attname as parent_column,
           format_type(parent_att.atttypid, parent_att.atttypmod) as parent_type
      into fk
    from pg_constraint con
    join pg_attribute child_att
      on child_att.attrelid = con.conrelid and child_att.attnum = con.conkey[1]
    join pg_attribute parent_att
      on parent_att.attrelid = con.confrelid and parent_att.attnum = con.confkey[1]
    where con.conrelid = p_table
      and con.contype = 'f'
      and con.confdeltype = 'n'
      and cardinality(con.conkey) = 1
      and child_att.attname = changed.key
    limit 1;
    if not found then
      return false;
    end if;
    execute format(
      'select exists (select 1 from %s where %I = ($1 #>> ''{}'')::%s)',
      fk.parent_table, fk.parent_column, fk.parent_type
    ) into parent_exists using changed.old_value;
    if parent_exists then
      return false;
    end if;
  end loop;
  return any_change;
end;
$$;

revoke all on function public.is_orphaned_fk_set_null(regclass, jsonb, jsonb) from public, anon, authenticated;

-- role::text: production role may be an enum (2026_04_18 case B, P3).
create or replace function public.current_user_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.current_user_profile_role() from public, anon;
grant execute on function public.current_user_profile_role() to authenticated;

-- -------------------------------------------------------------
-- 2) D-9: allow 'worker' on a role enum, if production uses one.
--    The CHECK case already includes worker (2026_04_18).
-- -------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname in ('user_role', 'profile_role', 'application_user_role')
      and n.nspname = 'public'
      and t.typtype = 'e'
  ) then
    begin execute 'alter type public.user_role add value if not exists ''worker'''; exception when undefined_object then null; end;
    begin execute 'alter type public.profile_role add value if not exists ''worker'''; exception when undefined_object then null; end;
    begin execute 'alter type public.application_user_role add value if not exists ''worker'''; exception when undefined_object then null; end;
  end if;
end $$;

-- -------------------------------------------------------------
-- 3) E1: signup role whitelist (D-8). Fires for ANY signup function (P4):
--    the production function name is unknown, so it is not replaced.
-- -------------------------------------------------------------
create or replace function public.sanitize_profile_role_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- super_admin is granted only by a trusted UPDATE, never at insert.
  if new.role is null or new.role::text not in ('customer', 'owner', 'worker') then
    new.role := 'customer';
  end if;
  return new;
end;
$$;

revoke all on function public.sanitize_profile_role_on_insert() from public, anon, authenticated;

drop trigger if exists profiles_sanitize_role_on_insert on public.profiles;
create trigger profiles_sanitize_role_on_insert
  before insert on public.profiles
  for each row
  execute function public.sanitize_profile_role_on_insert();

-- -------------------------------------------------------------
-- 4) E2 / S5: protected profile columns (P2 block-list). id, role, created_at and any
--    column whose name contains "verif" or "admin" can only change in a trusted session.
--    Other (unknown) user-editable columns, e.g. avatar_url, keep working.
-- -------------------------------------------------------------
create or replace function public.profile_protected_column_changes(
  p_old jsonb,
  p_new jsonb
)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(entry.key order by entry.key), '{}')
  from jsonb_each(p_new) entry
  where (entry.key in ('id', 'role', 'created_at')
         or entry.key like '%verif%'
         or entry.key like '%admin%')
    and entry.value is distinct from (p_old -> entry.key);
$$;

revoke all on function public.profile_protected_column_changes(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_keys text[];
  restored jsonb;
begin
  if public.is_trusted_db_session() then
    return new;
  end if;
  changed_keys := public.profile_protected_column_changes(to_jsonb(old), to_jsonb(new));
  if cardinality(changed_keys) = 0 then
    return new;
  end if;
  if session_user::text = 'supabase_auth_admin' then
    -- GoTrue metadata sync (S5): never break auth, silently keep the old values.
    -- Deliberate: this also silently reverts a role change made by ANY UPDATE that runs as
    -- supabase_auth_admin (e.g. an auth-admin trigger assigning role after signup). D-10
    -- row 13: production must not assign role that way; use a trusted (SQL / service_role)
    -- UPDATE on public.profiles instead.
    select jsonb_object_agg(k, to_jsonb(old) -> k) into restored from unnest(changed_keys) k;
    new := jsonb_populate_record(new, restored);
    return new;
  end if;
  raise exception 'Your role and verification fields cannot be changed from the app.'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_profile_protected_columns() from public, anon, authenticated;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_protected_columns();

-- -------------------------------------------------------------
-- 5) S4: scoped profile reads. Drops are by exact name (P1); any remaining permissive
--    `using (true)` SELECT/ALL policy is dropped and its name NOTICE-logged for the
--    D-10 diff. The repo frontend reads only the caller's own profile row
--    (SupabaseAuthRepository, SupabaseProfileRepository; audit in
--    docs/workforce/ROLE_AND_PROFILE_SECURITY.md). Counterparty names come from
--    bookings.customer_name / workers.name / shops.name, never from profiles.
-- -------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;

do $$
declare
  open_policy record;
begin
  for open_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('SELECT', 'ALL')
      and permissive = 'PERMISSIVE'
      and btrim(coalesce(qual, '')) in ('true', '(true)')
  loop
    raise notice 'W2a: dropping open profiles policy "%" (S4, record it in the D-10 diff)',
      open_policy.policyname;
    execute format('drop policy %I on public.profiles', open_policy.policyname);
  end loop;
end $$;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_super_admin" on public.profiles;
create policy "profiles_select_super_admin" on public.profiles
  for select
  to authenticated
  using (public.is_super_admin());

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W2 rollbacks in reverse order f..a)
-- -------------------------------------------------------------
-- drop policy if exists "profiles_select_super_admin" on public.profiles;
-- drop policy if exists "profiles_select_own" on public.profiles;
-- create policy "profiles_select_own" on public.profiles
--   for select to authenticated using (id = auth.uid());
-- -- Re-adding a dropped `using (true)` policy (names from the W2a NOTICE) re-opens S4:
-- -- create policy "<name from NOTICE>" on public.profiles for select using (true);
-- drop trigger if exists profiles_guard_protected_columns on public.profiles;
-- drop trigger if exists profiles_sanitize_role_on_insert on public.profiles;
-- drop function if exists public.guard_profile_protected_columns();
-- drop function if exists public.profile_protected_column_changes(jsonb, jsonb);
-- drop function if exists public.sanitize_profile_role_on_insert();
-- -- Only after w2b..w2f are rolled back (they call these):
-- drop function if exists public.is_orphaned_fk_set_null(regclass, jsonb, jsonb);
-- drop function if exists public.current_user_profile_role();
-- drop function if exists public.is_trusted_db_session();
-- -- An enum value 'worker' added by section 2 cannot be removed (irreversible, harmless).
