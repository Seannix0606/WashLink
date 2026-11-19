-- ROLLBACK of SEC-3, SEC-2 and B2C-8 on the live project, back to the state found by the pre-check on 2026-11-20
-- (both functions matched the 2026_11_06_b2cc definitions byte for byte). Restores the location leak: close bookings first.
begin;

drop trigger if exists service_bookings_immediate_gate on public.service_bookings;
drop function if exists public.service_bookings_immediate_gate();
alter table public.platform_settings drop column if exists immediate_bookings_open;

drop trigger if exists independent_workers_service_area_sync on public.independent_workers;

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
      and (p_latitude is null or (w.base_latitude is not null and public.service_distance_km(
             w.base_latitude, w.base_longitude, p_latitude, p_longitude) <= w.service_radius_km))
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

create or replace function public.service_booking_available_slots(p_date date, p_service uuid, p_vehicle_category text,
  p_addons uuid[] default '{}', p_latitude double precision default null, p_longitude double precision default null)
returns table (slot_start timestamptz, is_available boolean)
language plpgsql
stable
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
  select * into s from public.platform_settings;
  select q.duration_minutes into minutes from public.service_booking_price(p_service, p_vehicle_category, p_addons, false) q;
  if p_date < (now() at time zone 'Asia/Manila')::date
     or p_date > (now() at time zone 'Asia/Manila')::date + s.booking_horizon_days then
    return;
  end if;
  return query
    select g.slot, s.bookings_open and g.slot > now() and exists (
      select 1 from public.independent_workers w
      where public.independent_worker_is_eligible(w.profile_id, p_service, g.slot, minutes, p_latitude, p_longitude, false))
    from (select (p_date + make_interval(mins => m)) at time zone 'Asia/Manila' as slot, m
          from generate_series(0, 1439, s.slot_minutes) m) g
    where exists (select 1 from public.independent_worker_hours h
                  join public.independent_workers w on w.profile_id = h.worker_id and w.verification_status = 'verified'
                  where h.weekday = extract(dow from p_date)::int and g.m between h.start_minute and h.end_minute - 1)
    order by g.slot;
end;
$$;

drop function if exists public.independent_worker_covers(uuid, double precision, double precision);
drop function if exists public.service_location_check(double precision, double precision);
drop function if exists public.independent_worker_service_area_place(uuid);
drop function if exists public.independent_worker_service_area_sync();
drop table if exists public.service_location_checks;
drop table if exists public.independent_worker_service_areas;
alter table public.platform_settings drop column if exists max_location_checks_per_day;

commit;
