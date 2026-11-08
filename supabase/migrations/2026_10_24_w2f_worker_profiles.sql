-- =============================================================
-- WashLink W2f - worker profiles and private worker contacts (spec A worker profile).
-- Requires 2026_10_24_w2a (current_user_profile_role). Idempotent.
-- Data minimisation (W0-L6): no birthdate, address or ID numbers. Only the worker
-- (and, for the profile, super admins) can read these rows; W5/W9 add narrow owner
-- read access through functions. W2 grants shop owners nothing.
-- =============================================================

create table if not exists public.worker_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  headline text,
  experience_summary text,
  years_of_experience smallint,
  skills text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  availability_status text not null,
  availability_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_profiles_headline_length check (char_length(headline) <= 120),
  constraint worker_profiles_experience_summary_length
    check (char_length(experience_summary) <= 2000),
  constraint worker_profiles_years_of_experience_range
    check (years_of_experience between 0 and 60),
  constraint worker_profiles_skills_count check (cardinality(skills) <= 30),
  constraint worker_profiles_preferred_locations_count
    check (cardinality(preferred_locations) <= 10),
  constraint worker_profiles_availability_status_check
    check (availability_status in (
      'full_time', 'part_time', 'weekends_only', 'flexible', 'not_available'
    )),
  constraint worker_profiles_availability_notes_length
    check (char_length(availability_notes) <= 300)
);

-- Fix cycle 1: no invented default; the worker must choose (the UI requires it), an insert
-- without availability_status fails with 23502. Also for a table created before this fix.
alter table public.worker_profiles alter column availability_status drop default;

create index if not exists worker_profiles_availability_status_idx
  on public.worker_profiles(availability_status);

create table if not exists public.worker_private_contacts (
  profile_id uuid primary key references public.worker_profiles(profile_id) on delete cascade,
  contact_phone text,
  contact_email text,
  preferred_contact_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_private_contacts_phone_format
    check (contact_phone ~ '^[+0-9 ()-]{7,20}$'),
  constraint worker_private_contacts_email_format
    check (char_length(contact_email) <= 254
           and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  constraint worker_private_contacts_preferred_method_check
    check (preferred_contact_method in ('phone', 'email', 'in_app'))
);

-- -------------------------------------------------------------
-- Normalisation: trim, drop empty, case-insensitive dedupe (first spelling wins),
-- per-item length limits (23514), updated_at stamp, created_at immutable.
-- -------------------------------------------------------------
create or replace function public.normalize_worker_text_list(
  p_items text[],
  p_max_item_length integer,
  p_label text
)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text[];
begin
  if exists (
    select 1 from unnest(coalesce(p_items, '{}')) item
    where char_length(btrim(item)) > p_max_item_length
  ) then
    raise exception 'Each % must be % characters or fewer.', p_label, p_max_item_length
      using errcode = '23514';
  end if;
  select coalesce(array_agg(first_spelling order by first_position), '{}') into normalized
  from (
    select min(item_position) as first_position,
           (array_agg(trimmed order by item_position))[1] as first_spelling
    from (
      select btrim(item) as trimmed, item_position
      from unnest(coalesce(p_items, '{}')) with ordinality as listed(item, item_position)
    ) cleaned
    where trimmed is not null and trimmed <> ''
    group by lower(trimmed)
  ) deduplicated;
  return normalized;
end;
$$;

create or replace function public.normalize_worker_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.headline := nullif(btrim(new.headline), '');
  new.experience_summary := nullif(btrim(new.experience_summary), '');
  new.availability_notes := nullif(btrim(new.availability_notes), '');
  new.skills := public.normalize_worker_text_list(new.skills, 60, 'skill');
  new.preferred_locations := public.normalize_worker_text_list(new.preferred_locations, 120, 'location');
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.stamp_worker_private_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.contact_phone := nullif(btrim(new.contact_phone), '');
  new.contact_email := nullif(lower(btrim(new.contact_email)), '');
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_worker_text_list(text[], integer, text) from public, anon;
grant execute on function public.normalize_worker_text_list(text[], integer, text) to authenticated;
revoke all on function public.normalize_worker_profile() from public, anon, authenticated;
revoke all on function public.stamp_worker_private_contact() from public, anon, authenticated;

drop trigger if exists worker_profiles_normalize on public.worker_profiles;
create trigger worker_profiles_normalize
  before insert or update on public.worker_profiles
  for each row
  execute function public.normalize_worker_profile();

drop trigger if exists worker_private_contacts_stamp on public.worker_private_contacts;
create trigger worker_private_contacts_stamp
  before insert or update on public.worker_private_contacts
  for each row
  execute function public.stamp_worker_private_contact();

-- -------------------------------------------------------------
-- RLS and grants
-- -------------------------------------------------------------
alter table public.worker_profiles enable row level security;
alter table public.worker_private_contacts enable row level security;

revoke all on table public.worker_profiles from anon, authenticated;
revoke all on table public.worker_private_contacts from anon, authenticated;
grant select, insert, update, delete on table public.worker_profiles to authenticated;
grant select, insert, update, delete on table public.worker_private_contacts to authenticated;

drop policy if exists "wp_select_self" on public.worker_profiles;
create policy "wp_select_self" on public.worker_profiles
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "wp_select_super_admin" on public.worker_profiles;
create policy "wp_select_super_admin" on public.worker_profiles
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists "wp_insert_self" on public.worker_profiles;
create policy "wp_insert_self" on public.worker_profiles
  for insert to authenticated
  with check (profile_id = auth.uid() and public.current_user_profile_role() = 'worker');

drop policy if exists "wp_update_self" on public.worker_profiles;
create policy "wp_update_self" on public.worker_profiles
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "wp_delete_self" on public.worker_profiles;
create policy "wp_delete_self" on public.worker_profiles
  for delete to authenticated
  using (profile_id = auth.uid());

-- Contacts: the worker only (no super admin, no shop owner).
drop policy if exists "wpc_select_self" on public.worker_private_contacts;
create policy "wpc_select_self" on public.worker_private_contacts
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "wpc_insert_self" on public.worker_private_contacts;
create policy "wpc_insert_self" on public.worker_private_contacts
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "wpc_update_self" on public.worker_private_contacts;
create policy "wpc_update_self" on public.worker_private_contacts
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "wpc_delete_self" on public.worker_private_contacts;
create policy "wpc_delete_self" on public.worker_private_contacts
  for delete to authenticated
  using (profile_id = auth.uid());

-- -------------------------------------------------------------
-- Fix cycle 1: private worker data and the RPC-only link tables never stream over
-- Realtime. Drops them from supabase_realtime if someone added them; a FOR ALL TABLES
-- publication cannot exclude tables, so it is reported for the D-10 diff instead.
-- -------------------------------------------------------------
do $$
declare
  private_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise notice 'W2f: supabase_realtime is FOR ALL TABLES and includes worker_private_contacts. Record in the D-10 diff.';
    return;
  end if;
  foreach private_table in array array[
    'worker_private_contacts', 'worker_profiles', 'worker_roster_link_codes', 'worker_roster_link_attempts'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = private_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', private_table);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W2 rollbacks in reverse order f..a)
-- IRREVERSIBLE DATA LOSS: export worker_profiles and worker_private_contacts first.
-- -------------------------------------------------------------
-- drop table if exists public.worker_private_contacts;
-- drop table if exists public.worker_profiles;
-- drop function if exists public.stamp_worker_private_contact();
-- drop function if exists public.normalize_worker_profile();
-- drop function if exists public.normalize_worker_text_list(text[], integer, text);
