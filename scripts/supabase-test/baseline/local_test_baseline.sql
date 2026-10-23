-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- =============================================================
-- WashLink W1 local test baseline (decision D-1, D-11).
--
-- The committed migrations in supabase/migrations/ alter public.profiles,
-- public.bookings and public.workers but never create them. This file
-- recreates ONLY those objects so the committed migrations can be replayed
-- against a local Docker stack. It is staged by
-- scripts/supabase-test/stage-local-workdir.mjs as migration version
-- 00000000000000 inside the gitignored .local-supabase-test/ workdir only.
--
-- It lives outside supabase/ on purpose (scripts/supabase-test/baseline/):
-- it must never reach a linked project via `supabase db push`, and
-- `supabase test db` (which runs every .sql under supabase/tests/) must
-- never execute it against a remote database.
--
-- Every object below is reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md.
-- Policies mirror what the frontend needs, NOT what production has (D-10).
-- Presumed weaknesses E1, E2, E5, S1 and S2 are reproduced ON PURPOSE so the
-- W2 fixes can be proven against them. Columns added by committed migrations
-- (shop_id, latitude, longitude, quoted_price, customer_notes,
-- customer_rating_*) are deliberately omitted.
-- =============================================================

-- -------------------------------------------------------------
-- profiles (reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md)
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer',
  full_name text,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 2026_04_18 drops this and re-adds it including 'super_admin'.
  constraint profiles_role_check check (role in ('customer', 'owner', 'worker'))
);

alter table public.profiles enable row level security;

-- reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- reconstructed; NO column restriction on purpose (reproduces audit E2)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert or delete policy: profiles are created by the signup trigger.

-- -------------------------------------------------------------
-- signup trigger (reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md)
-- The role is copied UNSANITISED from client metadata (reproduces audit E1).
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone_number'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -------------------------------------------------------------
-- workers (reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md)
-- user_id has no FK, as audited; W2 adds it (D-2).
-- -------------------------------------------------------------
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid,
  name text not null,
  phone_number text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workers_owner_id_idx on public.workers(owner_id);
create index if not exists workers_user_id_idx on public.workers(user_id);

alter table public.workers enable row level security;

-- reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md
drop policy if exists "workers_select_owner_or_self" on public.workers;
create policy "workers_select_owner_or_self" on public.workers
  for select
  to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());

drop policy if exists "workers_insert_owner" on public.workers;
create policy "workers_insert_owner" on public.workers
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "workers_update_owner" on public.workers;
create policy "workers_update_owner" on public.workers
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "workers_delete_owner" on public.workers;
create policy "workers_delete_owner" on public.workers
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- Availability toggle on the worker jobs page (reconstructed).
-- No column restriction on purpose (reproduces audit S9): the linked worker
-- can also rewrite owner_id, name and user_id. W2 placeholder:
-- j17_worker_cannot_rewrite_roster_row.
drop policy if exists "workers_update_own_link" on public.workers;
create policy "workers_update_own_link" on public.workers
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -------------------------------------------------------------
-- bookings (reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md)
-- Booking status transitions are NOT DB-enforced today (recorded for W2).
-- -------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_id uuid references public.profiles(id) on delete set null,
  vehicle_type text not null,
  service_type text not null,
  address text not null,
  time timestamptz not null,
  booking_status text not null default 'pending',
  created_at timestamptz not null default now(),
  assigned_worker_id uuid references public.workers(id) on delete set null,
  constraint bookings_booking_status_check
    check (booking_status in (
      'pending', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled'
    ))
);

create index if not exists bookings_customer_id_idx on public.bookings(customer_id);
create index if not exists bookings_assigned_worker_id_idx
  on public.bookings(assigned_worker_id);

alter table public.bookings enable row level security;

-- reconstructed; any column accepted on insert (reproduces audit S1)
drop policy if exists "bookings_insert_customer" on public.bookings;
create policy "bookings_insert_customer" on public.bookings
  for insert
  to authenticated
  with check (customer_id = auth.uid());

-- reconstructed, see docs/workforce/ARCHITECTURE_AUDIT.md
drop policy if exists "bookings_select_customer" on public.bookings;
create policy "bookings_select_customer" on public.bookings
  for select
  to authenticated
  using (customer_id = auth.uid());

-- reconstructed; no column restriction (reproduces audit E5)
drop policy if exists "bookings_update_customer" on public.bookings;
create policy "bookings_update_customer" on public.bookings
  for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists "bookings_select_assigned_worker" on public.bookings;
create policy "bookings_select_assigned_worker" on public.bookings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workers w
      where w.id = bookings.assigned_worker_id
        and w.user_id = auth.uid()
    )
  );

-- reconstructed; no column restriction (reproduces audit E5)
drop policy if exists "bookings_update_assigned_worker" on public.bookings;
create policy "bookings_update_assigned_worker" on public.bookings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workers w
      where w.id = bookings.assigned_worker_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workers w
      where w.id = bookings.assigned_worker_id
        and w.user_id = auth.uid()
    )
  );

-- Shop-owner booking policies need bookings.shop_id (added by 2026_04_17);
-- they are staged as migration 20260417000002 from
-- scripts/supabase-test/baseline/local_test_baseline_owner_policies.sql.

-- -------------------------------------------------------------
-- realtime parity with the frontend channels (reconstructed)
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
    ) then
      alter publication supabase_realtime add table public.bookings;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workers'
    ) then
      alter publication supabase_realtime add table public.workers;
    end if;
  end if;
end $$;

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; never run against a real project)
-- -------------------------------------------------------------
-- alter publication supabase_realtime drop table public.bookings, public.workers;
-- drop table if exists public.bookings;
-- drop table if exists public.workers;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop table if exists public.profiles;
