-- =============================================================
-- WashLink B2C b - service bookings, the status machine, status history, dispatch requests and reviews.
-- Prices and service details are snapshots written only by the server (b2cc). Clients have no write path.
-- A worker reads a booking only through RPCs: dispatch_requests hold no address, so an unaccepted request
-- never reveals where the customer is. Local proof only (D-10, D-11).
-- =============================================================

create table if not exists public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  customer_id uuid references public.profiles(id) on delete set null,
  worker_id uuid references public.independent_workers(profile_id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  addon_names text[] not null default '{}',
  vehicle_category text not null,
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_year integer,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  landmark text not null default '',
  instructions text not null default '',
  is_immediate boolean not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null,
  base_price_cents integer not null,
  vehicle_adjustment_cents integer not null,
  addons_total_cents integer not null,
  customer_total_cents integer not null,
  commission_bps integer not null,
  platform_fee_cents integer not null,
  worker_earnings_cents integer not null,
  payment_method text not null default 'cash',
  payment_status text not null default 'unpaid',
  status text not null default 'pending',
  submission_key text not null,
  search_expires_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint service_bookings_reference_unique unique (reference),
  constraint service_bookings_submission_unique unique (customer_id, submission_key),
  constraint service_bookings_status_check check (status in ('pending', 'searching_for_worker', 'accepted',
    'worker_on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired', 'no_worker_available')),
  constraint service_bookings_category_check
    check (vehicle_category in ('motorcycle', 'sedan', 'hatchback', 'suv', 'pickup', 'mpv', 'van', 'other')),
  constraint service_bookings_address_check check (char_length(btrim(address)) between 8 and 300),
  constraint service_bookings_lat_check check (latitude between -90 and 90),
  constraint service_bookings_lng_check check (longitude between -180 and 180),
  constraint service_bookings_landmark_check check (char_length(landmark) <= 120),
  constraint service_bookings_instructions_check check (char_length(instructions) <= 500),
  constraint service_bookings_duration_check check (duration_minutes between 10 and 1000),
  -- The split always adds up, so customer total, worker earnings and platform revenue stay distinct and exact.
  constraint service_bookings_total_check check (customer_total_cents >= 0
    and customer_total_cents = base_price_cents + vehicle_adjustment_cents + addons_total_cents),
  constraint service_bookings_split_check check (platform_fee_cents >= 0 and worker_earnings_cents >= 0
    and platform_fee_cents + worker_earnings_cents = customer_total_cents),
  constraint service_bookings_payment_method_check check (payment_method in ('cash')),
  -- Cash is collected in person: only verified confirmation may ever set paid (no path sets it yet).
  constraint service_bookings_payment_status_check check (payment_status in ('unpaid', 'paid', 'refunded'))
);
create index if not exists service_bookings_customer_idx on public.service_bookings (customer_id, created_at desc);
create index if not exists service_bookings_worker_idx on public.service_bookings (worker_id, scheduled_at);
create index if not exists service_bookings_status_idx on public.service_bookings (status, search_expires_at);

create or replace function public.service_booking_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_from
    when 'pending' then p_to in ('searching_for_worker', 'cancelled')
    when 'searching_for_worker' then p_to in ('accepted', 'cancelled', 'no_worker_available', 'expired')
    when 'no_worker_available' then p_to in ('searching_for_worker', 'cancelled', 'expired')
    when 'accepted' then p_to in ('worker_on_the_way', 'cancelled', 'searching_for_worker')
    when 'worker_on_the_way' then p_to in ('arrived', 'cancelled', 'searching_for_worker')
    when 'arrived' then p_to in ('in_progress', 'cancelled')
    when 'in_progress' then p_to in ('completed', 'cancelled')
    else false
  end
$$;
revoke all on function public.service_booking_transition_allowed(text, text) from public, anon, authenticated, service_role;

-- Every session, including trusted ones: a status can only move along the machine, and snapshots never change.
create or replace function public.service_bookings_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status
     and not public.service_booking_transition_allowed(old.status, new.status) then
    raise exception 'This booking cannot move from % to %.', old.status, new.status using errcode = '23514';
  end if;
  if (new.reference, new.service_name, new.addon_names, new.vehicle_category, new.vehicle_make, new.vehicle_model,
      new.base_price_cents, new.vehicle_adjustment_cents, new.addons_total_cents, new.customer_total_cents,
      new.commission_bps, new.platform_fee_cents, new.worker_earnings_cents, new.submission_key)
     is distinct from
     (old.reference, old.service_name, old.addon_names, old.vehicle_category, old.vehicle_make, old.vehicle_model,
      old.base_price_cents, old.vehicle_adjustment_cents, old.addons_total_cents, old.customer_total_cents,
      old.commission_bps, old.platform_fee_cents, old.worker_earnings_cents, old.submission_key) then
    raise exception 'A booking''s price and service details cannot change.' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function public.service_bookings_guard_update() from public, anon, authenticated, service_role;
drop trigger if exists service_bookings_guard_update on public.service_bookings;
create trigger service_bookings_guard_update before update on public.service_bookings
  for each row execute function public.service_bookings_guard_update();

create table if not exists public.service_booking_status_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_kind text not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  constraint service_booking_status_events_actor_check check (actor_kind in ('customer', 'worker', 'super_admin', 'system')),
  constraint service_booking_status_events_reason_check check (reason is null or char_length(reason) <= 500)
);
create index if not exists service_booking_status_events_booking_idx
  on public.service_booking_status_events (booking_id, id);

create table if not exists public.dispatch_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  worker_id uuid not null references public.independent_workers(profile_id) on delete cascade,
  status text not null default 'offered',
  attempt integer not null default 1,
  distance_km numeric(6,1),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  constraint dispatch_requests_status_check check (status in ('offered', 'accepted', 'declined', 'expired', 'superseded'))
);
create unique index if not exists dispatch_requests_one_open on public.dispatch_requests (booking_id, worker_id)
  where status = 'offered';
create unique index if not exists dispatch_requests_one_accepted on public.dispatch_requests (booking_id)
  where status = 'accepted';
create index if not exists dispatch_requests_worker_idx on public.dispatch_requests (worker_id, status, expires_at);
create index if not exists dispatch_requests_booking_idx on public.dispatch_requests (booking_id);

create table if not exists public.service_booking_reviews (
  booking_id uuid primary key references public.service_bookings(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  worker_id uuid references public.independent_workers(profile_id) on delete set null,
  rating integer not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  constraint service_booking_reviews_rating_check check (rating between 1 and 5),
  constraint service_booking_reviews_comment_check check (char_length(comment) <= 500)
);
create index if not exists service_booking_reviews_worker_idx on public.service_booking_reviews (worker_id, created_at desc);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null,
  last_seen_at timestamptz not null default now(),
  invalid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint device_push_tokens_token_unique unique (token),
  constraint device_push_tokens_token_check check (char_length(token) between 10 and 300),
  constraint device_push_tokens_platform_check check (platform in ('ios', 'android'))
);
create index if not exists device_push_tokens_profile_idx on public.device_push_tokens (profile_id);

alter table public.service_bookings enable row level security;
alter table public.service_booking_status_events enable row level security;
alter table public.dispatch_requests enable row level security;
alter table public.service_booking_reviews enable row level security;
alter table public.device_push_tokens enable row level security;

revoke all on public.service_bookings, public.service_booking_status_events, public.dispatch_requests,
  public.service_booking_reviews, public.device_push_tokens from public, anon, authenticated, service_role;

revoke all on sequence public.service_booking_status_events_id_seq from public, anon, authenticated, service_role;

-- SELECT only for Realtime row filtering. A customer sees their own booking; a worker sees their own requests.
grant select on public.service_bookings, public.dispatch_requests to authenticated;
drop policy if exists service_bookings_customer_read on public.service_bookings;
create policy service_bookings_customer_read on public.service_bookings for select to authenticated
  using (customer_id = auth.uid());
drop policy if exists dispatch_requests_worker_read on public.dispatch_requests;
create policy dispatch_requests_worker_read on public.dispatch_requests for select to authenticated
  using (worker_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                   and schemaname = 'public' and tablename = 'service_bookings') then
      execute 'alter publication supabase_realtime add table public.service_bookings';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                   and schemaname = 'public' and tablename = 'dispatch_requests') then
      execute 'alter publication supabase_realtime add table public.dispatch_requests';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ROLLBACK (only after b2cc is rolled back; deletes B2C bookings and their history):
-- begin;
-- alter publication supabase_realtime drop table public.dispatch_requests, public.service_bookings;
-- drop table if exists public.device_push_tokens, public.service_booking_reviews, public.dispatch_requests,
--   public.service_booking_status_events, public.service_bookings;
-- drop function if exists public.service_bookings_guard_update();
-- drop function if exists public.service_booking_transition_allowed(text, text);
-- commit;
