-- Shop-specific prices for each supported vehicle and wash package.
-- Requires 2026_04_18_super_admin_and_shop_verification.sql.

create table if not exists public.shop_pricing (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  vehicle_type text not null,
  service_type text not null default 'Basic Wash',
  price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_pricing_vehicle_type_check
    check (vehicle_type in ('Sedan', 'SUV', 'Pickup')),
  constraint shop_pricing_service_type_check
    check (service_type in ('Basic Wash', 'Full Wash', 'Wax')),
  constraint shop_pricing_price_check
    check (price > 0)
);

alter table public.shop_pricing
  add column if not exists service_type text not null default 'Basic Wash',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute column_row
      on column_row.attrelid = constraint_row.conrelid
      and column_row.attnum = any(constraint_row.conkey)
    where constraint_row.conrelid = 'public.shop_pricing'::regclass
      and constraint_row.confrelid = 'public.shops'::regclass
      and constraint_row.contype = 'f'
      and column_row.attname = 'shop_id'
  ) then
    alter table public.shop_pricing
      add constraint shop_pricing_shop_id_fkey
      foreign key (shop_id)
      references public.shops(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_pricing_vehicle_type_check'
      and conrelid = 'public.shop_pricing'::regclass
  ) then
    alter table public.shop_pricing
      add constraint shop_pricing_vehicle_type_check
      check (vehicle_type in ('Sedan', 'SUV', 'Pickup'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_pricing_service_type_check'
      and conrelid = 'public.shop_pricing'::regclass
  ) then
    alter table public.shop_pricing
      add constraint shop_pricing_service_type_check
      check (service_type in ('Basic Wash', 'Full Wash', 'Wax'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_pricing_price_check'
      and conrelid = 'public.shop_pricing'::regclass
  ) then
    alter table public.shop_pricing
      add constraint shop_pricing_price_check
      check (price > 0);
  end if;
end $$;

create unique index if not exists shop_pricing_shop_vehicle_service_unique
  on public.shop_pricing(shop_id, vehicle_type, service_type);

create index if not exists shop_pricing_shop_id_idx
  on public.shop_pricing(shop_id);

alter table public.shop_pricing enable row level security;

create or replace function public.set_shop_pricing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shop_pricing_set_updated_at on public.shop_pricing;
create trigger shop_pricing_set_updated_at
  before update on public.shop_pricing
  for each row
  execute function public.set_shop_pricing_updated_at();

drop policy if exists "shop_pricing_select_available" on public.shop_pricing;
create policy "shop_pricing_select_available" on public.shop_pricing
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shops s
      where s.id = shop_pricing.shop_id
        and (
          s.owner_id = auth.uid()
          or public.is_super_admin()
          or (s.is_active and s.verification_status = 'approved')
        )
    )
  );

drop policy if exists "shop_pricing_owner_manage" on public.shop_pricing;
create policy "shop_pricing_owner_manage" on public.shop_pricing
  for all
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = shop_pricing.shop_id
        and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shops s
      where s.id = shop_pricing.shop_id
        and s.owner_id = auth.uid()
    )
  );

alter table public.bookings
  add column if not exists quoted_price numeric(10, 2);

create or replace function public.set_booking_quote_from_shop_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_price numeric(10, 2);
begin
  if new.shop_id is null then
    raise exception 'Choose a shop before placing a booking.';
  end if;

  select pricing.price
    into matched_price
  from public.shop_pricing pricing
  join public.shops shop on shop.id = pricing.shop_id
  where pricing.shop_id = new.shop_id
    and pricing.vehicle_type = new.vehicle_type
    and pricing.service_type = new.service_type
    and shop.is_active
    and shop.verification_status = 'approved';

  if matched_price is null then
    raise exception 'The selected shop has no active rate for this vehicle and wash package.';
  end if;

  new.quoted_price := matched_price;
  return new;
end;
$$;

drop trigger if exists bookings_set_quote_from_shop_pricing on public.bookings;
create trigger bookings_set_quote_from_shop_pricing
  before insert on public.bookings
  for each row
  execute function public.set_booking_quote_from_shop_pricing();

notify pgrst, 'reload schema';
