-- =============================================================
-- WashLink B2C a - service catalog, platform settings, saved addresses and vehicles, independent workers.
-- Additive: no B2B table, function or policy changes. B2C bookings use their own tables (b2cc), so the shop
-- flow on public.bookings and its guards stay as they are. Local proof only (D-10, D-11).
-- Bookings stay closed (bookings_open = false) and seeded prices are marked draft until an admin sets them.
-- =============================================================

create table if not exists public.platform_settings (
  id boolean primary key default true,
  bookings_open boolean not null default false,
  commission_bps integer not null default 0,
  request_ttl_seconds integer not null default 180,
  search_window_minutes integer not null default 30,
  scheduled_search_window_hours integer not null default 12,
  travel_buffer_minutes integer not null default 30,
  heartbeat_stale_minutes integer not null default 15,
  slot_minutes integer not null default 30,
  booking_horizon_days integer not null default 30,
  max_open_bookings_per_customer integer not null default 5,
  max_new_bookings_per_hour integer not null default 10,
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id),
  constraint platform_settings_commission check (commission_bps between 0 and 10000),
  constraint platform_settings_ttl check (request_ttl_seconds between 30 and 3600),
  constraint platform_settings_search check (search_window_minutes between 1 and 1440),
  constraint platform_settings_scheduled_search check (scheduled_search_window_hours between 1 and 168),
  constraint platform_settings_buffer check (travel_buffer_minutes between 0 and 240),
  constraint platform_settings_stale check (heartbeat_stale_minutes between 1 and 1440),
  constraint platform_settings_slot check (slot_minutes in (15, 30, 60)),
  constraint platform_settings_horizon check (booking_horizon_days between 1 and 180),
  constraint platform_settings_limits check (max_open_bookings_per_customer between 1 and 50
    and max_new_bookings_per_hour between 1 and 100)
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  category text not null,
  name text not null,
  description text not null default '',
  image_url text,
  requirements text not null default '',
  base_price_cents integer not null,
  duration_minutes integer not null,
  is_active boolean not null default true,
  price_is_draft boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_key_unique unique (key),
  constraint services_key_check check (key ~ '^[a-z0-9_]{2,40}$'),
  constraint services_category_check check (category in ('exterior', 'interior', 'full', 'detailing', 'motorcycle', 'other')),
  constraint services_name_check check (char_length(name) between 2 and 80),
  constraint services_description_check check (char_length(description) <= 500),
  constraint services_requirements_check check (char_length(requirements) <= 300),
  constraint services_image_check check (image_url is null or image_url ~ '^https://'),
  constraint services_price_check check (base_price_cents between 0 and 10000000),
  constraint services_duration_check check (duration_minutes between 10 and 600)
);

create table if not exists public.service_vehicle_prices (
  service_id uuid not null references public.services(id) on delete cascade,
  vehicle_category text not null,
  adjustment_cents integer not null default 0,
  primary key (service_id, vehicle_category),
  constraint service_vehicle_prices_category_check
    check (vehicle_category in ('motorcycle', 'sedan', 'hatchback', 'suv', 'pickup', 'mpv', 'van', 'other')),
  constraint service_vehicle_prices_adjustment_check check (adjustment_cents between -10000000 and 10000000)
);

create table if not exists public.service_addons (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text not null default '',
  price_cents integer not null,
  duration_minutes integer not null default 0,
  is_active boolean not null default true,
  price_is_draft boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_addons_key_unique unique (key),
  constraint service_addons_key_check check (key ~ '^[a-z0-9_]{2,40}$'),
  constraint service_addons_name_check check (char_length(name) between 2 and 80),
  constraint service_addons_description_check check (char_length(description) <= 300),
  constraint service_addons_price_check check (price_cents between 0 and 10000000),
  constraint service_addons_duration_check check (duration_minutes between 0 and 240)
);

-- Draft placeholders: the owner chose to seed these; create_service_booking refuses draft prices.
insert into public.services (key, category, name, description, base_price_cents, duration_minutes, sort_order) values
  ('basic_exterior', 'exterior', 'Basic exterior wash', 'Exterior rinse, foam wash and hand dry.', 25000, 40, 10),
  ('interior_cleaning', 'interior', 'Interior cleaning', 'Vacuum, dashboard and door panel wipe-down.', 30000, 45, 20),
  ('interior_exterior', 'full', 'Interior and exterior wash', 'Exterior wash plus interior cleaning.', 45000, 75, 30),
  ('full_wash', 'full', 'Full wash', 'Interior and exterior wash with tires and windows.', 60000, 90, 40),
  ('detailing', 'detailing', 'Detailing', 'Deep interior and exterior cleaning.', 150000, 180, 50),
  ('motorcycle_wash', 'motorcycle', 'Motorcycle wash', 'Foam wash and hand dry for motorcycles.', 12000, 25, 60)
on conflict (key) do nothing;

insert into public.service_addons (key, name, description, price_cents, duration_minutes, sort_order) values
  ('tire_black', 'Tire black', 'Tire dressing on all wheels.', 5000, 5, 10),
  ('wax', 'Hand wax', 'Protective hand wax on painted panels.', 15000, 20, 20),
  ('engine_wipe', 'Engine bay wipe-down', 'Dry wipe-down of the engine bay.', 10000, 15, 30)
on conflict (key) do nothing;

insert into public.service_vehicle_prices (service_id, vehicle_category, adjustment_cents)
select s.id, v.category, v.adjustment
from public.services s
cross join (values ('sedan', 0), ('hatchback', 0), ('suv', 10000), ('pickup', 10000), ('mpv', 10000),
                   ('van', 15000), ('other', 15000)) as v(category, adjustment)
where s.key <> 'motorcycle_wash'
on conflict do nothing;
insert into public.service_vehicle_prices (service_id, vehicle_category, adjustment_cents)
select s.id, 'motorcycle', 0 from public.services s where s.key = 'motorcycle_wash'
on conflict do nothing;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  landmark text not null default '',
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_label_check check (char_length(label) between 1 and 40),
  constraint customer_addresses_address_check check (char_length(btrim(address)) between 8 and 300),
  constraint customer_addresses_lat_check check (latitude between -90 and 90),
  constraint customer_addresses_lng_check check (longitude between -180 and 180),
  constraint customer_addresses_landmark_check check (char_length(landmark) <= 120),
  constraint customer_addresses_instructions_check check (char_length(instructions) <= 500)
);
create index if not exists customer_addresses_customer_idx on public.customer_addresses (customer_id);

create table if not exists public.customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  make text not null,
  model text not null,
  year integer,
  size_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_vehicles_category_check
    check (category in ('motorcycle', 'sedan', 'hatchback', 'suv', 'pickup', 'mpv', 'van', 'other')),
  constraint customer_vehicles_make_check check (char_length(btrim(make)) between 1 and 60),
  constraint customer_vehicles_model_check check (char_length(btrim(model)) between 1 and 60),
  constraint customer_vehicles_year_check check (year is null or year between 1950 and 2100),
  constraint customer_vehicles_size_check check (size_class is null or size_class in ('small', 'medium', 'large'))
);
create index if not exists customer_vehicles_customer_idx on public.customer_vehicles (customer_id);

-- A B2C worker needs no shop, owner, roster row, contract or the B2B three-owner goal.
create table if not exists public.independent_workers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  verification_status text not null default 'pending',
  verification_note text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  bio text not null default '',
  skills text[] not null default '{}',
  base_latitude double precision,
  base_longitude double precision,
  service_radius_km numeric(5,1) not null default 10,
  is_online boolean not null default false,
  last_seen_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint independent_workers_status_check
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  constraint independent_workers_note_check check (verification_note is null or char_length(verification_note) <= 500),
  constraint independent_workers_bio_check check (char_length(bio) <= 500),
  constraint independent_workers_skills_check check (cardinality(skills) <= 20),
  constraint independent_workers_location_check check (
    (base_latitude is null) = (base_longitude is null)
    and (base_latitude is null or (base_latitude between -90 and 90 and base_longitude between -180 and 180))),
  constraint independent_workers_radius_check check (service_radius_km between 1 and 200)
);

-- Weekly hours in Asia/Manila local minutes from midnight.
create table if not exists public.independent_worker_hours (
  worker_id uuid not null references public.independent_workers(profile_id) on delete cascade,
  weekday integer not null,
  start_minute integer not null,
  end_minute integer not null,
  primary key (worker_id, weekday, start_minute),
  constraint independent_worker_hours_weekday_check check (weekday between 0 and 6),
  constraint independent_worker_hours_range_check check (start_minute between 0 and 1439
    and end_minute between 1 and 1440 and end_minute > start_minute)
);

create table if not exists public.independent_worker_services (
  worker_id uuid not null references public.independent_workers(profile_id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (worker_id, service_id)
);
create index if not exists independent_worker_services_service_idx on public.independent_worker_services (service_id);

-- -------------------------------------------------------------
-- RLS and privileges. The catalog is public to read; saved data is the owner's; worker status is RPC-only.
-- -------------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.services enable row level security;
alter table public.service_vehicle_prices enable row level security;
alter table public.service_addons enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_vehicles enable row level security;
alter table public.independent_workers enable row level security;
alter table public.independent_worker_hours enable row level security;
alter table public.independent_worker_services enable row level security;

revoke all on public.platform_settings, public.services, public.service_vehicle_prices, public.service_addons,
  public.customer_addresses, public.customer_vehicles, public.independent_workers, public.independent_worker_hours,
  public.independent_worker_services from public, anon, authenticated, service_role;

grant select on public.services, public.service_vehicle_prices, public.service_addons to anon, authenticated;
grant select, insert, update, delete on public.customer_addresses, public.customer_vehicles to authenticated;
grant select on public.independent_workers to authenticated;
grant select, insert, update, delete on public.independent_worker_hours, public.independent_worker_services to authenticated;

drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services for select to anon, authenticated using (is_active);
drop policy if exists service_vehicle_prices_public_read on public.service_vehicle_prices;
create policy service_vehicle_prices_public_read on public.service_vehicle_prices for select to anon, authenticated
  using (exists (select 1 from public.services s where s.id = service_id and s.is_active));
drop policy if exists service_addons_public_read on public.service_addons;
create policy service_addons_public_read on public.service_addons for select to anon, authenticated using (is_active);

drop policy if exists customer_addresses_own on public.customer_addresses;
create policy customer_addresses_own on public.customer_addresses for all to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
drop policy if exists customer_vehicles_own on public.customer_vehicles;
create policy customer_vehicles_own on public.customer_vehicles for all to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

drop policy if exists independent_workers_self_read on public.independent_workers;
create policy independent_workers_self_read on public.independent_workers for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists independent_worker_hours_own on public.independent_worker_hours;
create policy independent_worker_hours_own on public.independent_worker_hours for all to authenticated
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());
drop policy if exists independent_worker_services_own on public.independent_worker_services;
create policy independent_worker_services_own on public.independent_worker_services for all to authenticated
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());

notify pgrst, 'reload schema';

-- ROLLBACK (only after b2cb..b2cd are rolled back; deletes B2C catalog, saved data and worker records):
-- begin;
-- drop table if exists public.independent_worker_services, public.independent_worker_hours, public.independent_workers,
--   public.customer_vehicles, public.customer_addresses, public.service_addons, public.service_vehicle_prices,
--   public.services, public.platform_settings;
-- commit;
