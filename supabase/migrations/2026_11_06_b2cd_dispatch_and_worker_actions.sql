-- =============================================================
-- WashLink B2C d - dispatch, atomic acceptance, worker status updates and worker reads.
-- A request shows no address and no customer identity. Exact location is returned only to the assigned worker
-- while the booking is active. Local proof only (D-10, D-11).
-- =============================================================

create or replace function public.service_dispatch_close_offers(p_booking uuid, p_status text, p_notify boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in update public.dispatch_requests d set status = p_status, responded_at = now()
           where d.booking_id = p_booking and d.status = 'offered' returning d.id, d.worker_id loop
    if p_notify then
      perform public.enqueue_notification_safely(r.worker_id, 'service_booking.request_closed', 'Request closed',
        'A booking request is no longer available.', 'service_request:' || r.id || ':closed', 'service_booking', p_booking);
    end if;
  end loop;
end;
$$;

-- Offers the booking to the nearest eligible workers. One worker is enough; it scales without changes.
create or replace function public.service_booking_dispatch(p_booking uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  s public.platform_settings;
  r record;
  offered integer := 0;
  next_attempt integer;
begin
  select * into b from public.service_bookings x where x.id = p_booking;
  if b.id is null or b.status <> 'searching_for_worker' then
    return 0;
  end if;
  select * into s from public.platform_settings;
  select coalesce(max(d.attempt), 0) + 1 into next_attempt from public.dispatch_requests d where d.booking_id = p_booking;
  for r in
    select w.profile_id, public.service_distance_km(w.base_latitude, w.base_longitude, b.latitude, b.longitude) as km
    from public.independent_workers w
    where b.service_id is not null
      and public.independent_worker_is_eligible(w.profile_id, b.service_id, b.scheduled_at, b.duration_minutes,
                                                b.latitude, b.longitude, b.is_immediate, b.id)
      and not exists (select 1 from public.dispatch_requests d where d.booking_id = p_booking
                      and d.worker_id = w.profile_id and d.status in ('declined', 'offered'))
    order by km limit 5
  loop
    insert into public.dispatch_requests (booking_id, worker_id, attempt, distance_km, expires_at)
      values (p_booking, r.profile_id, next_attempt, round(r.km::numeric, 1),
              least(now() + make_interval(secs => s.request_ttl_seconds), coalesce(b.search_expires_at, 'infinity')));
    offered := offered + 1;
    perform public.enqueue_notification_safely(r.profile_id, 'service_booking.request', 'New booking request',
      'A customer near your service area needs a wash. Open WashLink to respond.',
      'service_request:' || p_booking || ':' || next_attempt, 'service_booking', p_booking);
  end loop;
  return offered;
end;
$$;

-- Expires old offers, re-offers while the search window is open, then stops: nothing searches forever.
create or replace function public.service_dispatch_sweep(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
begin
  select * into b from public.service_bookings x where x.id = p_booking for update skip locked;
  if b.id is null then
    return;
  end if;
  update public.dispatch_requests d set status = 'expired', responded_at = now()
    where d.booking_id = p_booking and d.status = 'offered' and d.expires_at <= now();
  if b.status = 'no_worker_available' and not b.is_immediate and b.scheduled_at <= now() then
    perform public.service_booking_record_transition(p_booking, 'expired', 'system');
    return;
  end if;
  if b.status <> 'searching_for_worker'
     or exists (select 1 from public.dispatch_requests d where d.booking_id = p_booking and d.status = 'offered') then
    return;
  end if;
  if b.search_expires_at <= now() then
    perform public.service_booking_record_transition(p_booking, case when not b.is_immediate and b.scheduled_at <= now()
      then 'expired' else 'no_worker_available' end, 'system');
    return;
  end if;
  perform public.service_booking_dispatch(p_booking);
end;
$$;

-- For a human-registered scheduler (docs/b2c/OPERATIONS.md). Reads also sweep, so nothing depends on cron running.
create or replace function public.service_dispatch_sweep_all()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.service_bookings where status in ('searching_for_worker', 'no_worker_available') limit 200 loop
    perform public.service_dispatch_sweep(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.save_independent_worker_profile(p_bio text, p_skills text[], p_latitude double precision,
  p_longitude double precision, p_radius_km numeric)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.independent_workers;
begin
  if auth.uid() is null or public.current_user_profile_role() is distinct from 'worker' then
    raise exception 'Sign in with a worker account.' using errcode = '42501';
  end if;
  insert into public.independent_workers as w (profile_id, bio, skills, base_latitude, base_longitude, service_radius_km)
    values (auth.uid(), btrim(coalesce(p_bio, '')), coalesce(p_skills, '{}'), p_latitude, p_longitude, coalesce(p_radius_km, 10))
    on conflict (profile_id) do update set bio = excluded.bio, skills = excluded.skills,
      base_latitude = excluded.base_latitude, base_longitude = excluded.base_longitude,
      service_radius_km = excluded.service_radius_km, updated_at = now(), revision = w.revision + 1
    returning * into result;
  return result;
end;
$$;

create or replace function public.set_independent_worker_online(p_is_online boolean)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w public.independent_workers;
  r record;
begin
  select * into w from public.independent_workers x where x.profile_id = auth.uid() for update;
  if w.profile_id is null then
    raise exception 'Complete your worker profile first.' using errcode = '42501';
  end if;
  if p_is_online and w.verification_status <> 'verified' then
    raise exception 'WashLink must verify your account before you can go online.' using errcode = '23514';
  end if;
  update public.independent_workers set is_online = p_is_online, last_seen_at = now(), updated_at = now()
    where profile_id = w.profile_id returning * into w;
  if p_is_online then
    for r in select id from public.service_bookings where status = 'searching_for_worker' limit 50 loop
      perform public.service_dispatch_sweep(r.id);
    end loop;
  end if;
  return w;
end;
$$;

create or replace function public.independent_worker_heartbeat()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.independent_workers set last_seen_at = now() where profile_id = auth.uid() and is_online
$$;

create or replace function public.my_dispatch_requests()
returns table (request_id uuid, booking_id uuid, reference text, service_name text, addon_names text[], vehicle_category text,
  is_immediate boolean, scheduled_at timestamptz, duration_minutes integer, distance_km numeric, worker_earnings_cents integer,
  expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select d.booking_id from public.dispatch_requests d
           where d.worker_id = auth.uid() and d.status = 'offered' and d.expires_at <= now() loop
    perform public.service_dispatch_sweep(r.booking_id);
  end loop;
  return query
    select d.id, b.id, b.reference, b.service_name, b.addon_names, b.vehicle_category, b.is_immediate, b.scheduled_at,
           b.duration_minutes, d.distance_km, b.worker_earnings_cents, d.expires_at
    from public.dispatch_requests d join public.service_bookings b on b.id = d.booking_id
    where d.worker_id = auth.uid() and d.status = 'offered' and d.expires_at > now() and b.status = 'searching_for_worker'
    order by d.expires_at;
end;
$$;

-- Atomic: the booking row lock and the unique index mean exactly one worker can win.
create or replace function public.accept_dispatch_request(p_request uuid)
returns table (booking_id uuid, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  d public.dispatch_requests;
  b public.service_bookings;
begin
  if me is null then
    raise exception 'Request not found.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('independent_worker_accept:' || me::text, 0));
  select * into d from public.dispatch_requests x where x.id = p_request and x.worker_id = me;
  if d.id is null then
    raise exception 'Request not found.' using errcode = '42501';
  end if;
  select * into b from public.service_bookings x where x.id = d.booking_id for update;
  select * into d from public.dispatch_requests x where x.id = p_request for update;
  if b.status <> 'searching_for_worker' or b.worker_id is not null or d.status = 'superseded' then
    raise exception 'Another washer already took this booking, or it was cancelled.' using errcode = '55000';
  end if;
  if d.status <> 'offered' or d.expires_at <= now() then
    raise exception 'This request has expired.' using errcode = '55000';
  end if;
  if not public.independent_worker_is_eligible(me, b.service_id, b.scheduled_at, b.duration_minutes, b.latitude, b.longitude,
                                               b.is_immediate, b.id) then
    raise exception 'You are not available for this booking. Check your status and other bookings.' using errcode = '23514';
  end if;
  update public.dispatch_requests set status = 'accepted', responded_at = now() where id = p_request;
  update public.service_bookings set worker_id = me where id = b.id;
  perform public.service_booking_record_transition(b.id, 'accepted', 'worker');
  perform public.service_dispatch_close_offers(b.id, 'superseded');
  return query select b.id, 'accepted'::text;
end;
$$;

create or replace function public.decline_dispatch_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.dispatch_requests;
begin
  update public.dispatch_requests x set status = 'declined', responded_at = now()
    where x.id = p_request and x.worker_id = auth.uid() and x.status = 'offered' returning * into d;
  if d.id is null then
    raise exception 'This request is no longer open.' using errcode = '55000';
  end if;
  perform public.service_dispatch_sweep(d.booking_id);
end;
$$;

-- Only the assigned worker, only the next step, and the expected status catches a stale screen.
create or replace function public.advance_service_booking(p_booking uuid, p_expected_status text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  next_status text;
begin
  select * into b from public.service_bookings x where x.id = p_booking and x.worker_id = auth.uid() for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if b.status is distinct from p_expected_status then
    raise exception 'This booking changed. Refresh and try again.' using errcode = '55000';
  end if;
  next_status := case b.status when 'accepted' then 'worker_on_the_way' when 'worker_on_the_way' then 'arrived'
    when 'arrived' then 'in_progress' when 'in_progress' then 'completed' end;
  if next_status is null then
    raise exception 'This booking has no next step.' using errcode = '23514';
  end if;
  perform public.service_booking_record_transition(p_booking, next_status, 'worker');
  return next_status;
end;
$$;

-- A worker who cannot attend hands the booking back; it searches again rather than silently failing.
create or replace function public.release_service_booking(p_booking uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  s public.platform_settings;
begin
  select * into b from public.service_bookings x where x.id = p_booking and x.worker_id = auth.uid() for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if b.status not in ('accepted', 'worker_on_the_way') then
    raise exception 'This booking can no longer be handed back. Report a problem instead.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Give a reason of 10 to 500 characters.' using errcode = '23514';
  end if;
  select * into s from public.platform_settings;
  update public.service_bookings set search_expires_at = now() + make_interval(mins => s.search_window_minutes) where id = p_booking;
  perform public.service_booking_record_transition(p_booking, 'searching_for_worker', 'worker', btrim(p_reason));
  update public.dispatch_requests set status = 'declined', responded_at = now() where booking_id = p_booking and worker_id = auth.uid();
  perform public.service_dispatch_sweep(p_booking);
end;
$$;

create or replace function public.report_service_booking_problem(p_booking uuid, p_report text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  kind text;
begin
  select * into b from public.service_bookings x where x.id = p_booking and auth.uid() in (x.worker_id, x.customer_id);
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_report, ''))) not between 10 and 500 then
    raise exception 'Describe the problem in 10 to 500 characters.' using errcode = '23514';
  end if;
  kind := case when b.worker_id = auth.uid() then 'worker' else 'customer' end;
  insert into public.service_booking_status_events (booking_id, from_status, to_status, actor_id, actor_kind, reason)
    values (p_booking, b.status, b.status, auth.uid(), kind, 'Problem reported: ' || btrim(p_report));
  perform public.record_workforce_audit_event('service_booking.problem_reported', 'service_booking', p_booking, b.customer_id,
    jsonb_build_object('changed_by', kind));
end;
$$;

-- Exact address and customer contact only for the assigned worker while the job is active.
create or replace function public.my_assigned_service_bookings()
returns table (booking_id uuid, reference text, status text, service_name text, addon_names text[], vehicle_category text,
  vehicle_make text, vehicle_model text, scheduled_at timestamptz, duration_minutes integer, worker_earnings_cents integer,
  customer_total_cents integer, payment_method text, address text, latitude double precision, longitude double precision,
  landmark text, instructions text, customer_name text, customer_phone text, completed_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.id, b.reference, b.status, b.service_name, b.addon_names, b.vehicle_category, b.vehicle_make, b.vehicle_model,
    b.scheduled_at, b.duration_minutes, b.worker_earnings_cents, b.customer_total_cents, b.payment_method,
    case when a.is_active then b.address end, case when a.is_active then b.latitude end, case when a.is_active then b.longitude end,
    case when a.is_active then b.landmark end, case when a.is_active then b.instructions end,
    case when a.is_active then p.full_name end, case when a.is_active then p.phone_number end, b.completed_at
  from public.service_bookings b
  cross join lateral (select b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress') as is_active) a
  left join public.profiles p on p.id = b.customer_id
  where b.worker_id = auth.uid()
  order by a.is_active desc, b.scheduled_at desc
  limit 200
$$;

create or replace function public.my_independent_worker_summary()
returns table (completed_count integer, active_count integer, earnings_cents bigint, review_count integer, average_rating numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select count(*)::int from public.service_bookings b where b.worker_id = auth.uid() and b.status = 'completed'),
    (select count(*)::int from public.service_bookings b where b.worker_id = auth.uid()
       and b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress')),
    (select coalesce(sum(b.worker_earnings_cents), 0)::bigint from public.service_bookings b
       where b.worker_id = auth.uid() and b.status = 'completed'),
    (select count(*)::int from public.service_booking_reviews r where r.worker_id = auth.uid()),
    (select round(avg(r.rating), 2) from public.service_booking_reviews r where r.worker_id = auth.uid())
$$;

create or replace function public.my_independent_worker_reviews()
returns table (rating integer, comment text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.rating, r.comment, r.created_at from public.service_booking_reviews r
  where r.worker_id = auth.uid() order by r.created_at desc limit 50
$$;

-- Customer list: includes the washer's first name only once assigned. Sweeps so a stale search resolves on read.
create or replace function public.my_service_bookings()
returns table (booking_id uuid, reference text, status text, service_name text, addon_names text[], vehicle_category text,
  vehicle_make text, vehicle_model text, address text, latitude double precision, longitude double precision, is_immediate boolean,
  scheduled_at timestamptz, duration_minutes integer, base_price_cents integer, vehicle_adjustment_cents integer,
  addons_total_cents integer, customer_total_cents integer, payment_method text, payment_status text, worker_name text,
  worker_phone text, has_review boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select b.id from public.service_bookings b where b.customer_id = auth.uid()
           and b.status in ('searching_for_worker', 'no_worker_available') loop
    perform public.service_dispatch_sweep(r.id);
  end loop;
  return query
    select b.id, b.reference, b.status, b.service_name, b.addon_names, b.vehicle_category, b.vehicle_make, b.vehicle_model,
      b.address, b.latitude, b.longitude, b.is_immediate, b.scheduled_at, b.duration_minutes, b.base_price_cents,
      b.vehicle_adjustment_cents, b.addons_total_cents, b.customer_total_cents, b.payment_method, b.payment_status,
      split_part(coalesce(p.full_name, ''), ' ', 1),
      case when b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress') then p.phone_number end,
      exists (select 1 from public.service_booking_reviews v where v.booking_id = b.id), b.created_at
    from public.service_bookings b left join public.profiles p on p.id = b.worker_id
    where b.customer_id = auth.uid() order by b.created_at desc limit 200;
end;
$$;

create or replace function public.register_device_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.device_push_tokens (profile_id, token, platform) values (auth.uid(), p_token, p_platform)
    on conflict (token) do update set profile_id = auth.uid(), platform = excluded.platform, last_seen_at = now(), invalid_at = null;
end;
$$;

create or replace function public.remove_device_push_token(p_token text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.device_push_tokens where token = p_token and profile_id = auth.uid()
$$;

revoke all on function public.service_dispatch_close_offers(uuid, text, boolean), public.service_booking_dispatch(uuid),
  public.service_dispatch_sweep(uuid), public.service_dispatch_sweep_all() from public, anon, authenticated, service_role;
revoke all on function public.save_independent_worker_profile(text, text[], double precision, double precision, numeric),
  public.set_independent_worker_online(boolean), public.independent_worker_heartbeat(), public.my_dispatch_requests(),
  public.accept_dispatch_request(uuid), public.decline_dispatch_request(uuid), public.advance_service_booking(uuid, text),
  public.release_service_booking(uuid, text), public.report_service_booking_problem(uuid, text),
  public.my_assigned_service_bookings(), public.my_independent_worker_summary(), public.my_independent_worker_reviews(),
  public.my_service_bookings(), public.register_device_push_token(text, text), public.remove_device_push_token(text)
  from public, anon, service_role;
grant execute on function public.save_independent_worker_profile(text, text[], double precision, double precision, numeric),
  public.set_independent_worker_online(boolean), public.independent_worker_heartbeat(), public.my_dispatch_requests(),
  public.accept_dispatch_request(uuid), public.decline_dispatch_request(uuid), public.advance_service_booking(uuid, text),
  public.release_service_booking(uuid, text), public.report_service_booking_problem(uuid, text),
  public.my_assigned_service_bookings(), public.my_independent_worker_summary(), public.my_independent_worker_reviews(),
  public.my_service_bookings(), public.register_device_push_token(text, text), public.remove_device_push_token(text)
  to authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK (only after b2ce; drop these functions, then b2cc):
-- begin;
-- drop function if exists public.remove_device_push_token(text), public.register_device_push_token(text, text),
--   public.my_service_bookings(), public.my_independent_worker_reviews(), public.my_independent_worker_summary(),
--   public.my_assigned_service_bookings(), public.report_service_booking_problem(uuid, text),
--   public.release_service_booking(uuid, text), public.advance_service_booking(uuid, text),
--   public.decline_dispatch_request(uuid), public.accept_dispatch_request(uuid), public.my_dispatch_requests(),
--   public.independent_worker_heartbeat(), public.set_independent_worker_online(boolean),
--   public.save_independent_worker_profile(text, text[], double precision, double precision, numeric),
--   public.service_dispatch_sweep_all(), public.service_dispatch_sweep(uuid), public.service_booking_dispatch(uuid),
--   public.service_dispatch_close_offers(uuid, text, boolean);
-- commit;
