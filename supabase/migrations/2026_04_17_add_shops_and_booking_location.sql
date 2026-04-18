-- =============================================================
-- WashLink — shops + booking location migration
-- Idempotent: safe to run multiple times.
-- =============================================================

-- -------------------------------------------------------------
-- shops table
-- -------------------------------------------------------------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  address text not null,
  phone_number text,
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists shops_owner_id_idx on public.shops(owner_id);
create index if not exists shops_is_active_idx on public.shops(is_active);

alter table public.shops enable row level security;

-- Any authenticated user can see active shops (customers need to pick one).
drop policy if exists "shops_select_active" on public.shops;
create policy "shops_select_active" on public.shops
  for select
  to authenticated
  using (is_active or owner_id = auth.uid());

-- Owners can manage only their own shops.
drop policy if exists "shops_insert_own" on public.shops;
create policy "shops_insert_own" on public.shops
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "shops_update_own" on public.shops;
create policy "shops_update_own" on public.shops
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "shops_delete_own" on public.shops;
create policy "shops_delete_own" on public.shops
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- -------------------------------------------------------------
-- bookings: add shop + location columns
-- -------------------------------------------------------------
alter table public.bookings
  add column if not exists shop_id uuid references public.shops(id) on delete set null,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists bookings_shop_id_idx on public.bookings(shop_id);

-- -------------------------------------------------------------
-- Optional: seed a default demo shop for each existing owner
-- (comment this out if you prefer to create shops manually).
-- -------------------------------------------------------------
-- insert into public.shops (owner_id, name, address, phone_number, latitude, longitude)
-- select p.id,
--        coalesce(p.full_name, 'My Car Wash') || ' Shop',
--        'Set your shop address',
--        p.phone_number,
--        null,
--        null
-- from public.profiles p
-- where p.role = 'owner'
--   and not exists (select 1 from public.shops s where s.owner_id = p.id);
