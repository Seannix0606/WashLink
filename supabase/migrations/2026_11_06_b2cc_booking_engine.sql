-- =============================================================
-- WashLink B2C c - pricing, eligibility, availability, booking creation, transitions and the customer's actions.
-- The server is the authority: clients send choices, never prices or worker eligibility. Internal helpers are
-- revoked from every client role. Local proof only (D-10, D-11).
-- =============================================================

insert into public.notification_categories (category, source_increment, key_prefixes, subject_types, recipient_kind, description)
values
  ('service_booking.update', 'W19', array['service_booking'], array['service_booking'], 'either_party',
   'A B2C booking changed status (customer) or an assigned booking changed (worker).'),
  ('service_booking.request', 'W19', array['service_request'], array['service_booking'], 'worker',
   'A new B2C booking request for an independent worker.'),
  ('service_booking.request_closed', 'W19', array['service_request'], array['service_booking'], 'worker',
   'A B2C booking request closed because it was taken, cancelled or expired.')
on conflict (category) do nothing;

create or replace function public.service_distance_km(p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision)
returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))
$$;

create or replace function public.independent_worker_has_conflict(p_worker uuid, p_start timestamptz,
  p_minutes integer, p_exclude_booking uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.service_bookings b
    cross join public.platform_settings s
    where b.worker_id = p_worker
      and b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress')
      and b.id is distinct from p_exclude_booking
      and tstzrange(b.scheduled_at - make_interval(mins => s.travel_buffer_minutes),
                    b.scheduled_at + make_interval(mins => b.duration_minutes + s.travel_buffer_minutes))
          && tstzrange(p_start, p_start + make_interval(mins => p_minutes)))
$$;

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

-- One calculation for quotes and bookings, so what a customer reviews is what they are charged.
create or replace function public.service_booking_price(p_service uuid, p_vehicle_category text, p_addons uuid[],
  p_require_final boolean)
returns table (service_name text, addon_names text[], base_price_cents integer, vehicle_adjustment_cents integer,
  addons_total_cents integer, customer_total_cents integer, commission_bps integer, platform_fee_cents integer,
  worker_earnings_cents integer, duration_minutes integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  svc public.services;
  adjustment integer;
  addon_total integer;
  addon_minutes integer;
  names text[];
  draft_addons integer;
  matched integer;
  bps integer;
  total integer;
  fee integer;
  wanted uuid[] := coalesce(p_addons, '{}');
begin
  select * into svc from public.services s where s.id = p_service and s.is_active;
  if svc.id is null then
    raise exception 'This service is not available.' using errcode = '23514';
  end if;
  select v.adjustment_cents into adjustment from public.service_vehicle_prices v
    where v.service_id = p_service and v.vehicle_category = p_vehicle_category;
  if adjustment is null then
    raise exception 'This service is not available for that vehicle type.' using errcode = '23514';
  end if;
  select coalesce(sum(a.price_cents), 0), coalesce(sum(a.duration_minutes), 0),
         coalesce(array_agg(a.name order by a.sort_order) filter (where a.id is not null), '{}'),
         count(*) filter (where a.price_is_draft), count(*)
    into addon_total, addon_minutes, names, draft_addons, matched
    from public.service_addons a where a.is_active and a.id = any (wanted);
  if matched <> (select count(distinct x) from unnest(wanted) x) then
    raise exception 'One of those add-ons is not available.' using errcode = '23514';
  end if;
  if p_require_final and (svc.price_is_draft or draft_addons > 0) then
    raise exception 'WashLink has not set final prices for this service yet.' using errcode = '23514';
  end if;
  select s.commission_bps into bps from public.platform_settings s;
  total := greatest(0, svc.base_price_cents + adjustment + addon_total);
  fee := round(total * bps / 10000.0)::integer;
  return query select svc.name, names, svc.base_price_cents, total - svc.base_price_cents - addon_total, addon_total,
    total, bps, fee, total - fee, svc.duration_minutes + addon_minutes;
end;
$$;

create or replace function public.service_booking_quote(p_service uuid, p_vehicle_category text, p_addons uuid[] default '{}')
returns table (base_price_cents integer, vehicle_adjustment_cents integer, addons_total_cents integer,
  customer_total_cents integer, worker_earnings_cents integer, platform_fee_cents integer, duration_minutes integer,
  price_is_draft boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.base_price_cents, q.vehicle_adjustment_cents, q.addons_total_cents, q.customer_total_cents,
         q.worker_earnings_cents, q.platform_fee_cents, q.duration_minutes,
         (select s.price_is_draft from public.services s where s.id = p_service)
         or exists (select 1 from public.service_addons a where a.id = any (coalesce(p_addons, '{}')) and a.price_is_draft)
  from public.service_booking_price(p_service, p_vehicle_category, p_addons, false) q
$$;

-- Slots are real availability: a future time alone is not enough.
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

-- The only way a status changes: updates the row, records who and why, and notifies without private details.
create or replace function public.service_booking_record_transition(p_booking uuid, p_to text, p_actor_kind text,
  p_reason text default null)
returns public.service_bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row public.service_bookings;
  after_row public.service_bookings;
  label text;
begin
  select * into before_row from public.service_bookings where id = p_booking for update;
  update public.service_bookings set status = p_to,
    completed_at = case when p_to = 'completed' then now() else completed_at end,
    worker_id = case when p_to = 'searching_for_worker' then null else worker_id end
    where id = p_booking returning * into after_row;
  insert into public.service_booking_status_events (booking_id, from_status, to_status, actor_id, actor_kind, reason)
    values (p_booking, before_row.status, p_to, auth.uid(), p_actor_kind, p_reason);
  perform public.record_workforce_audit_event('service_booking.status_changed', 'service_booking', p_booking,
    after_row.customer_id, jsonb_build_object('from_status', before_row.status, 'to_status', p_to, 'changed_by', p_actor_kind));
  label := case p_to
    when 'searching_for_worker' then 'We are finding a washer for your booking.'
    when 'accepted' then 'A washer accepted your booking.'
    when 'worker_on_the_way' then 'Your washer is on the way.'
    when 'arrived' then 'Your washer has arrived.'
    when 'in_progress' then 'Your wash has started.'
    when 'completed' then 'Your wash is complete. You can rate it now.'
    when 'cancelled' then 'Your booking was cancelled.'
    when 'expired' then 'Your booking expired.'
    when 'no_worker_available' then 'No washer is available yet. You can search again or cancel.'
  end;
  if label is not null and after_row.customer_id is not null and p_actor_kind <> 'customer' then
    perform public.enqueue_notification_safely(after_row.customer_id, 'service_booking.update', 'Booking ' || after_row.reference,
      label, 'service_booking:' || p_booking || ':' || after_row.revision, 'service_booking', p_booking);
  end if;
  if p_to in ('cancelled', 'searching_for_worker') and before_row.worker_id is not null and p_actor_kind <> 'worker' then
    perform public.enqueue_notification_safely(before_row.worker_id, 'service_booking.update', 'Booking ' || after_row.reference,
      'This booking is no longer assigned to you.', 'service_booking:' || p_booking || ':' || after_row.revision || ':worker',
      'service_booking', p_booking);
  end if;
  return after_row;
end;
$$;

create or replace function public.create_service_booking(p_service uuid, p_vehicle_category text, p_vehicle_make text,
  p_vehicle_model text, p_vehicle_year integer, p_addons uuid[], p_address text, p_latitude double precision,
  p_longitude double precision, p_landmark text, p_instructions text, p_is_immediate boolean, p_scheduled_at timestamptz,
  p_submission_key text)
returns table (booking_id uuid, reference text, status text, customer_total_cents integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  s public.platform_settings;
  price record;
  start_at timestamptz;
  existing public.service_bookings;
  new_row public.service_bookings;
begin
  if me is null or public.current_user_profile_role() is distinct from 'customer' then
    raise exception 'Sign in with a customer account to book a wash.' using errcode = '42501';
  end if;
  if p_submission_key is null or char_length(p_submission_key) not between 8 and 100 then
    raise exception 'This booking could not be submitted. Try again.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service_booking_customer:' || me::text, 0));
  select * into existing from public.service_bookings b where b.customer_id = me and b.submission_key = p_submission_key;
  if existing.id is not null then   -- A repeated submit returns the same booking and never creates a second.
    return query select existing.id, existing.reference, existing.status, existing.customer_total_cents;
    return;
  end if;
  select * into s from public.platform_settings;
  if not s.bookings_open then
    raise exception 'WashLink is not taking bookings yet.' using errcode = '23514';
  end if;
  if (select count(*) from public.service_bookings b where b.customer_id = me
      and b.status in ('pending', 'searching_for_worker', 'accepted', 'worker_on_the_way', 'arrived', 'in_progress', 'no_worker_available'))
     >= s.max_open_bookings_per_customer
     or (select count(*) from public.service_bookings b where b.customer_id = me and b.created_at > now() - interval '1 hour')
     >= s.max_new_bookings_per_hour then
    raise exception 'You have too many bookings in progress. Finish or cancel one first.' using errcode = '23514';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Pin the service location on the map.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_address, ''))) not between 8 and 300 then
    raise exception 'Enter the full address.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_vehicle_make, ''))) not between 1 and 60
     or char_length(btrim(coalesce(p_vehicle_model, ''))) not between 1 and 60 then
    raise exception 'Enter the vehicle make and model.' using errcode = '23514';
  end if;
  select * into price from public.service_booking_price(p_service, p_vehicle_category, p_addons, true);
  start_at := case when p_is_immediate then now() else p_scheduled_at end;
  if start_at is null or (not p_is_immediate and start_at <= now())
     or start_at > now() + make_interval(days => s.booking_horizon_days) then
    raise exception 'Choose a time in the future within the booking window.' using errcode = '23514';
  end if;
  if not p_is_immediate and not exists (select 1 from public.independent_workers w where public.independent_worker_is_eligible(
       w.profile_id, p_service, start_at, price.duration_minutes, p_latitude, p_longitude, false)) then
    raise exception 'That time is no longer available. Choose another.' using errcode = '23514';
  end if;
  insert into public.service_bookings (reference, customer_id, service_id, service_name, addon_names, vehicle_category,
      vehicle_make, vehicle_model, vehicle_year, address, latitude, longitude, landmark, instructions, is_immediate,
      scheduled_at, duration_minutes, base_price_cents, vehicle_adjustment_cents, addons_total_cents, customer_total_cents,
      commission_bps, platform_fee_cents, worker_earnings_cents, submission_key, search_expires_at)
    values ('WL-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)), me, p_service, price.service_name, price.addon_names,
      p_vehicle_category, btrim(p_vehicle_make), btrim(p_vehicle_model), p_vehicle_year, btrim(p_address), p_latitude, p_longitude,
      btrim(coalesce(p_landmark, '')), btrim(coalesce(p_instructions, '')), p_is_immediate, start_at, price.duration_minutes,
      price.base_price_cents, price.vehicle_adjustment_cents, price.addons_total_cents, price.customer_total_cents,
      price.commission_bps, price.platform_fee_cents, price.worker_earnings_cents, p_submission_key,
      case when p_is_immediate then now() + make_interval(mins => s.search_window_minutes)
           else least(start_at, now() + make_interval(hours => s.scheduled_search_window_hours)) end)
    returning * into new_row;
  insert into public.service_booking_status_events (booking_id, from_status, to_status, actor_id, actor_kind)
    values (new_row.id, null, 'pending', me, 'customer');
  perform public.service_booking_record_transition(new_row.id, 'searching_for_worker', 'system');
  perform public.service_booking_dispatch(new_row.id);
  perform public.service_dispatch_sweep(new_row.id);
  return query select b.id, b.reference, b.status, b.customer_total_cents from public.service_bookings b where b.id = new_row.id;
end;
$$;

create or replace function public.cancel_service_booking(p_booking uuid, p_reason text default null)
returns public.service_booking_status_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  is_admin boolean := public.is_super_admin();
  result public.service_booking_status_events;
begin
  select * into b from public.service_bookings x where x.id = p_booking for update;
  if b.id is null or auth.uid() is null or (b.customer_id is distinct from auth.uid() and not is_admin) then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if b.status in ('completed', 'cancelled', 'expired')
     or (not is_admin and b.status in ('arrived', 'in_progress')) then
    raise exception 'This booking can no longer be cancelled here.' using errcode = '23514';
  end if;
  if is_admin and char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Give a reason of at least 10 characters.' using errcode = '23514';
  end if;
  perform public.service_booking_record_transition(p_booking, 'cancelled',
    case when b.customer_id = auth.uid() then 'customer' else 'super_admin' end, nullif(btrim(coalesce(p_reason, '')), ''));
  perform public.service_dispatch_close_offers(p_booking, 'superseded');
  select * into result from public.service_booking_status_events e where e.booking_id = p_booking order by e.id desc limit 1;
  return result;
end;
$$;

create or replace function public.retry_service_booking_search(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  s public.platform_settings;
begin
  select * into b from public.service_bookings x where x.id = p_booking and x.customer_id = auth.uid() for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if b.status <> 'no_worker_available' then
    raise exception 'This booking is not waiting for a new search.' using errcode = '23514';
  end if;
  if not b.is_immediate and b.scheduled_at <= now() then
    raise exception 'This booking''s time has passed. Book a new time.' using errcode = '23514';
  end if;
  select * into s from public.platform_settings;
  update public.service_bookings set search_expires_at = case when is_immediate
      then now() + make_interval(mins => s.search_window_minutes)
      else least(scheduled_at, now() + make_interval(hours => s.scheduled_search_window_hours)) end,
    scheduled_at = case when is_immediate then now() else scheduled_at end
    where id = p_booking;
  perform public.service_booking_record_transition(p_booking, 'searching_for_worker', 'customer');
  perform public.service_booking_dispatch(p_booking);
  perform public.service_dispatch_sweep(p_booking);
  return (select x.status from public.service_bookings x where x.id = p_booking);
end;
$$;

create or replace function public.review_service_booking(p_booking uuid, p_rating integer, p_comment text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
begin
  select * into b from public.service_bookings x where x.id = p_booking and x.customer_id = auth.uid();
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if b.status <> 'completed' then
    raise exception 'You can rate a booking after it is completed.' using errcode = '23514';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = '23514';
  end if;
  insert into public.service_booking_reviews (booking_id, customer_id, worker_id, rating, comment)
    values (p_booking, auth.uid(), b.worker_id, p_rating, btrim(coalesce(p_comment, '')));
exception when unique_violation then
  raise exception 'You already rated this booking.' using errcode = '23505';
end;
$$;

revoke all on function public.service_distance_km(double precision, double precision, double precision, double precision),
  public.independent_worker_has_conflict(uuid, timestamptz, integer, uuid),
  public.independent_worker_is_eligible(uuid, uuid, timestamptz, integer, double precision, double precision, boolean, uuid),
  public.service_booking_price(uuid, text, uuid[], boolean),
  public.service_booking_record_transition(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.service_booking_quote(uuid, text, uuid[]),
  public.service_booking_available_slots(date, uuid, text, uuid[], double precision, double precision),
  public.create_service_booking(uuid, text, text, text, integer, uuid[], text, double precision, double precision, text, text, boolean, timestamptz, text),
  public.cancel_service_booking(uuid, text), public.retry_service_booking_search(uuid),
  public.review_service_booking(uuid, integer, text)
  from public, anon, service_role;
grant execute on function public.service_booking_quote(uuid, text, uuid[]),
  public.service_booking_available_slots(date, uuid, text, uuid[], double precision, double precision),
  public.create_service_booking(uuid, text, text, text, integer, uuid[], text, double precision, double precision, text, text, boolean, timestamptz, text),
  public.cancel_service_booking(uuid, text), public.retry_service_booking_search(uuid),
  public.review_service_booking(uuid, integer, text)
  to authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK (only after b2cd and b2ce):
-- begin;
-- drop function if exists public.review_service_booking(uuid, integer, text), public.retry_service_booking_search(uuid),
--   public.cancel_service_booking(uuid, text),
--   public.create_service_booking(uuid, text, text, text, integer, uuid[], text, double precision, double precision, text, text, boolean, timestamptz, text),
--   public.service_booking_record_transition(uuid, text, text, text),
--   public.service_booking_available_slots(date, uuid, text, uuid[], double precision, double precision),
--   public.service_booking_quote(uuid, text, uuid[]), public.service_booking_price(uuid, text, uuid[], boolean),
--   public.independent_worker_is_eligible(uuid, uuid, timestamptz, integer, double precision, double precision, boolean, uuid),
--   public.independent_worker_has_conflict(uuid, timestamptz, integer, uuid),
--   public.service_distance_km(double precision, double precision, double precision, double precision);
-- delete from public.notification_categories where category like 'service_booking.%';
-- commit;
