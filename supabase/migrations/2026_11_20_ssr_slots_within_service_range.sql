-- =============================================================
-- WashLink B2C o - a customer only sees booking times from washers whose saved service range covers their location.
-- Before this, the time grid was built from every verified washer's hours and out-of-range times were only greyed out, and with no
-- location given there was no range check at all. Now: no location, no times; and a time is listed only when a verified washer
-- whose range covers the location works then. Same signature, so the function's ACL stays.
-- =============================================================

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
  -- Range is checked against the customer's location, so without one there is nothing to offer.
  if p_latitude is null or p_longitude is null then
    return;
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
                  where h.weekday = extract(dow from p_date)::int and g.m between h.start_minute and h.end_minute - 1
                    and w.base_latitude is not null and w.base_longitude is not null
                    and public.service_distance_km(w.base_latitude, w.base_longitude, p_latitude, p_longitude) <= w.service_radius_km)
    order by g.slot;
end;
$$;
