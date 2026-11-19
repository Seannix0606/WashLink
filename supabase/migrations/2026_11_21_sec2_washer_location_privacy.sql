-- =============================================================
-- WashLink SEC-2 - washer location privacy (audit finding F1, docs/SECURITY_AUDIT_REPORT.md).
-- Before this, booking times and booking creation answered "is this exact point within service_radius_km of a washer's
-- base?" for any point a customer chose, so 61 lookups recovered a washer's base (often their home) to 0 m.
-- Three layers, so repeated queries cannot recover the base:
-- 1) Service centre: each washer gets a secret, persistent offset of 0.8-1.5 km in a random direction, kept in a table no
--    client can read. Coverage is measured from that centre, with the range widened by the same offset plus a secret
--    0-1 km margin, so the washer's own area stays covered and the configured range cannot be read off the edge. The best an unlimited attacker can find is the fuzzed centre. The offset vector is kept when
--    the base moves, so two centres reveal nothing about the base either.
-- 2) The customer's point is snapped to a 0.01 degree grid (about 1.1 km) before the check.
-- 3) A customer can check at most platform_settings.max_location_checks_per_day distinct grid cells per 24 hours (default
--    20). The same address for every calendar day counts once.
-- Dispatch ranking and the distance band shown to washers still use the real base (never shown to customers).
-- Additive: no committed migration changes. Same signatures for every client-callable function.
-- =============================================================

create table if not exists public.independent_worker_service_areas (
  worker_id uuid primary key references public.independent_workers(profile_id) on delete cascade,
  bearing_radians double precision not null,
  offset_km double precision not null,
  range_margin_km double precision not null,
  center_latitude double precision not null,
  center_longitude double precision not null,
  updated_at timestamptz not null default now(),
  constraint independent_worker_service_areas_offset_check check (offset_km between 0.8 and 1.5),
  constraint independent_worker_service_areas_margin_check check (range_margin_km between 0 and 1),
  constraint independent_worker_service_areas_bearing_check check (bearing_radians >= 0 and bearing_radians < 2 * pi())
);
alter table public.independent_worker_service_areas enable row level security;
revoke all on public.independent_worker_service_areas from public, anon, authenticated;

alter table public.platform_settings add column if not exists max_location_checks_per_day integer not null default 20;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_settings_max_location_checks_check') then
    alter table public.platform_settings add constraint platform_settings_max_location_checks_check
      check (max_location_checks_per_day between 1 and 1000);
  end if;
end;
$$;

create table if not exists public.service_location_checks (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  cell text not null,
  checked_at timestamptz not null default now(),
  primary key (customer_id, cell)
);
alter table public.service_location_checks enable row level security;
revoke all on public.service_location_checks from public, anon, authenticated;

-- Places (or re-places after a base move) a washer's service centre. A new washer gets a fresh random offset; an existing
-- one keeps its offset vector.
create or replace function public.independent_worker_service_area_place(p_worker uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w public.independent_workers;
  bearing double precision;
  offset_km double precision;
  margin_km double precision;
  phi double precision;
  delta double precision;
  lat2 double precision;
  lng2 double precision;
begin
  select * into w from public.independent_workers x where x.profile_id = p_worker;
  if w.profile_id is null or w.base_latitude is null or w.base_longitude is null then
    delete from public.independent_worker_service_areas a where a.worker_id = p_worker;
    return;
  end if;
  select a.bearing_radians, a.offset_km, a.range_margin_km into bearing, offset_km, margin_km
    from public.independent_worker_service_areas a where a.worker_id = p_worker;
  if bearing is null then
    bearing := random() * 2 * pi();
    offset_km := 0.8 + random() * 0.7;
    margin_km := random();
  end if;
  -- Destination point from the base along the bearing (great circle).
  phi := radians(w.base_latitude);
  delta := offset_km / 6371.0;
  lat2 := asin(sin(phi) * cos(delta) + cos(phi) * sin(delta) * cos(bearing));
  lng2 := radians(w.base_longitude) + atan2(sin(bearing) * sin(delta) * cos(phi), cos(delta) - sin(phi) * sin(lat2));
  insert into public.independent_worker_service_areas as a (worker_id, bearing_radians, offset_km, range_margin_km, center_latitude, center_longitude, updated_at)
  values (p_worker, bearing, offset_km, margin_km, degrees(lat2), degrees(lng2), now())
  on conflict (worker_id) do update set center_latitude = excluded.center_latitude, center_longitude = excluded.center_longitude, updated_at = now();
end;
$$;

create or replace function public.independent_worker_service_area_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.independent_worker_service_area_place(new.profile_id);
  return null;
end;
$$;
drop trigger if exists independent_workers_service_area_sync on public.independent_workers;
create trigger independent_workers_service_area_sync
  after insert or update of base_latitude, base_longitude on public.independent_workers
  for each row execute function public.independent_worker_service_area_sync();

-- Every existing washer with a base gets a centre now.
select public.independent_worker_service_area_place(w.profile_id) from public.independent_workers w where w.base_latitude is not null;

-- Does this washer serve this point? Grid-snapped point against the private centre. No centre means no coverage.
create or replace function public.independent_worker_covers(p_worker uuid, p_latitude double precision, p_longitude double precision)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_latitude is not null and p_longitude is not null and exists (
    select 1 from public.independent_workers w
    join public.independent_worker_service_areas a on a.worker_id = w.profile_id
    where w.profile_id = p_worker
      and public.service_distance_km(a.center_latitude, a.center_longitude,
            round(p_latitude::numeric, 2)::double precision, round(p_longitude::numeric, 2)::double precision)
          <= w.service_radius_km + a.offset_km + a.range_margin_km)
$$;

-- Counts a customer's distinct location checks. Trusted sessions (jobs, SQL editor, tests' setup) are not counted.
create or replace function public.service_location_check(p_latitude double precision, p_longitude double precision)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  this_cell text;
  checked integer;
  cap integer;
begin
  if public.is_trusted_db_session() then
    return;
  end if;
  if me is null then
    raise exception 'Sign in to see available times.' using errcode = '42501';
  end if;
  this_cell := round(p_latitude::numeric, 2)::text || ',' || round(p_longitude::numeric, 2)::text;
  perform pg_advisory_xact_lock(hashtextextended('service_location_check:' || me::text, 0));
  delete from public.service_location_checks c where c.customer_id = me and c.checked_at < now() - interval '24 hours';
  if exists (select 1 from public.service_location_checks c where c.customer_id = me and c.cell = this_cell) then
    return;
  end if;
  select count(*)::int into checked from public.service_location_checks c where c.customer_id = me;
  select s.max_location_checks_per_day into cap from public.platform_settings s;
  if checked >= coalesce(cap, 20) then
    raise exception 'You have checked too many different places today. Use an address you already checked, or try again tomorrow.'
      using errcode = '23514';
  end if;
  insert into public.service_location_checks (customer_id, cell) values (me, this_cell) on conflict do nothing;
end;
$$;

-- Same as 2026_11_06_b2cc except the location clause, which now uses the private service centre.
create or replace function public.independent_worker_is_eligible(p_worker uuid, p_service uuid, p_start timestamptz,
  p_minutes integer, p_latitude double precision, p_longitude double precision, p_is_immediate boolean,
  p_exclude_booking uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with local_start as (select p_start at time zone 'Asia/Manila' as at_local)
  select exists (
    select 1
    from public.independent_workers w
    join public.profiles p on p.id = w.profile_id and p.role = 'worker'
    cross join public.platform_settings s
    cross join local_start l
    where w.profile_id = p_worker
      and w.verification_status = 'verified'
      and exists (select 1 from public.independent_worker_services ws
                  where ws.worker_id = w.profile_id and ws.service_id = p_service)
      and (p_latitude is null or public.independent_worker_covers(w.profile_id, p_latitude, p_longitude))
      and (
        (p_is_immediate and w.is_online
         and w.last_seen_at >= now() - make_interval(mins => s.heartbeat_stale_minutes))
        or (not p_is_immediate and exists (
          select 1 from public.independent_worker_hours h
          where h.worker_id = w.profile_id
            and h.weekday = extract(dow from l.at_local)::int
            and h.start_minute <= extract(hour from l.at_local)::int * 60 + extract(minute from l.at_local)::int
            and h.end_minute >= extract(hour from l.at_local)::int * 60 + extract(minute from l.at_local)::int + p_minutes)))
      and not public.independent_worker_has_conflict(w.profile_id, p_start, p_minutes, p_exclude_booking))
$$;

-- Same as 2026_11_20_ssr except: it counts the location check (so it is no longer STABLE), and the time grid uses the
-- private service centre.
create or replace function public.service_booking_available_slots(p_date date, p_service uuid, p_vehicle_category text,
  p_addons uuid[] default '{}', p_latitude double precision default null, p_longitude double precision default null)
returns table (slot_start timestamptz, is_available boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s public.platform_settings;
  minutes integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see available times.' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null then
    return;
  end if;
  select * into s from public.platform_settings;
  select q.duration_minutes into minutes from public.service_booking_price(p_service, p_vehicle_category, p_addons, false) q;
  if p_date < (now() at time zone 'Asia/Manila')::date
     or p_date > (now() at time zone 'Asia/Manila')::date + s.booking_horizon_days then
    return;
  end if;
  perform public.service_location_check(p_latitude, p_longitude);
  return query
    select g.slot, s.bookings_open and g.slot > now() and exists (
      select 1 from public.independent_workers w
      where public.independent_worker_is_eligible(w.profile_id, p_service, g.slot, minutes, p_latitude, p_longitude, false))
    from (select (p_date + make_interval(mins => m)) at time zone 'Asia/Manila' as slot, m
          from generate_series(0, 1439, s.slot_minutes) m) g
    where exists (select 1 from public.independent_worker_hours h
                  join public.independent_workers w on w.profile_id = h.worker_id and w.verification_status = 'verified'
                  where h.weekday = extract(dow from p_date)::int and g.m between h.start_minute and h.end_minute - 1
                    and public.independent_worker_covers(w.profile_id, p_latitude, p_longitude))
    order by g.slot;
end;
$$;

revoke all on function public.independent_worker_service_area_place(uuid), public.independent_worker_service_area_sync(),
  public.independent_worker_covers(uuid, double precision, double precision),
  public.service_location_check(double precision, double precision)
  from public, anon, authenticated, service_role;

-- Rollback (manual):
-- drop trigger if exists independent_workers_service_area_sync on public.independent_workers;
-- then re-run the 2026_11_06_b2cc definition of independent_worker_is_eligible and the 2026_11_20_ssr definition of
-- service_booking_available_slots, and drop public.independent_worker_covers, public.service_location_check,
-- public.independent_worker_service_area_place, public.independent_worker_service_area_sync,
-- public.service_location_checks, public.independent_worker_service_areas and platform_settings.max_location_checks_per_day.
