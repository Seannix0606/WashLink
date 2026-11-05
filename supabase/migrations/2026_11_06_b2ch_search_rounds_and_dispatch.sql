-- =============================================================
-- WashLink B2C h (B2C-6) - search rounds, stored distance bands and closed-bookings behaviour in dispatch.
-- A washer who let an offer lapse is not re-offered in the same round (D-94); retry, release and requeue start a new round.
-- dispatch_requests stores only a band (D-96), because a washer can read the column directly and it is published over Realtime.
-- While bookings are closed no new offers go out, open offers are hidden and searches still expire (D-102).
-- Sweeps pick only rows needing action, soonest deadline first (D-105). System status events have a null actor (D-106).
-- Signatures are unchanged, so create or replace keeps each function's ACL. Local proof only (D-10, D-11).
-- =============================================================

alter table public.platform_settings
  add column if not exists worker_start_window_minutes integer not null default 120
    constraint platform_settings_worker_start_window check (worker_start_window_minutes between 0 and 1440),
  add column if not exists worker_arrival_window_minutes integer not null default 30
    constraint platform_settings_worker_arrival_window check (worker_arrival_window_minutes between 0 and 1440),
  add column if not exists overdue_cancel_grace_minutes integer not null default 60
    constraint platform_settings_overdue_cancel_grace check (overdue_cancel_grace_minutes between 0 and 1440),
  add column if not exists scheduled_request_ttl_minutes integer not null default 60
    constraint platform_settings_scheduled_request_ttl check (scheduled_request_ttl_minutes between 1 and 720);

-- The upper bound of the band, in km: at most 2, 5, 10, 20, 50, otherwise 200 (the largest service radius).
create or replace function public.service_dispatch_distance_band(p_km numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select (case when p_km is null then null when p_km <= 2 then 2 when p_km <= 5 then 5 when p_km <= 10 then 10
    when p_km <= 20 then 20 when p_km <= 50 then 50 else 200 end)::numeric
$$;
revoke all on function public.service_dispatch_distance_band(numeric) from public, anon, authenticated, service_role;

update public.dispatch_requests set distance_km = public.service_dispatch_distance_band(distance_km)
  where distance_km is distinct from public.service_dispatch_distance_band(distance_km);

-- Starts a new round: a new deadline (D-104), a fresh time for immediate bookings, and lapsed offers no longer exclude anyone.
create or replace function public.service_booking_reset_search(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.platform_settings;
begin
  select * into s from public.platform_settings;
  update public.service_bookings set
    search_expires_at = case when is_immediate then now() + make_interval(mins => s.search_window_minutes)
      else least(scheduled_at, now() + make_interval(hours => s.scheduled_search_window_hours)) end,
    scheduled_at = case when is_immediate then now() else scheduled_at end
    where id = p_booking;
  update public.dispatch_requests set status = 'superseded' where booking_id = p_booking and status = 'expired';
end;
$$;
revoke all on function public.service_booking_reset_search(uuid) from public, anon, authenticated, service_role;

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
    values (p_booking, before_row.status, p_to, case when p_actor_kind = 'system' then null else auth.uid() end, p_actor_kind, p_reason);
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
  if not s.bookings_open then
    return 0;
  end if;
  select coalesce(max(d.attempt), 0) + 1 into next_attempt from public.dispatch_requests d where d.booking_id = p_booking;
  for r in
    select w.profile_id, public.service_distance_km(w.base_latitude, w.base_longitude, b.latitude, b.longitude) as km
    from public.independent_workers w
    where b.service_id is not null
      and public.independent_worker_is_eligible(w.profile_id, b.service_id, b.scheduled_at, b.duration_minutes,
                                                b.latitude, b.longitude, b.is_immediate, b.id)
      and not exists (select 1 from public.dispatch_requests d where d.booking_id = p_booking
                      and d.worker_id = w.profile_id and d.status in ('declined', 'offered', 'expired'))
    order by km limit 5
  loop
    insert into public.dispatch_requests (booking_id, worker_id, attempt, distance_km, expires_at)
      values (p_booking, r.profile_id, next_attempt, public.service_dispatch_distance_band(r.km::numeric),
              least(now() + case when b.is_immediate then make_interval(secs => s.request_ttl_seconds)
                                 else greatest(make_interval(secs => s.request_ttl_seconds),
                                               make_interval(mins => s.scheduled_request_ttl_minutes)) end,
                    coalesce(b.search_expires_at, 'infinity')));
    offered := offered + 1;
    perform public.enqueue_notification_safely(r.profile_id, 'service_booking.request', 'New booking request',
      'A customer near your service area needs a wash. Open WashLink to respond.',
      'service_request:' || p_booking || ':' || next_attempt, 'service_booking', p_booking);
  end loop;
  return offered;
end;
$$;

-- For a human-registered scheduler (docs/b2c/OPERATIONS.md). Reads also sweep, so nothing depends on cron running.
-- Immediate no_worker_available rows stay until the customer acts, so they must not use up the batch.
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
  for r in
    select b.id from public.service_bookings b
    where (b.status = 'no_worker_available' and not b.is_immediate and b.scheduled_at <= now())
       or (b.status = 'searching_for_worker' and (b.search_expires_at <= now() or not exists (
             select 1 from public.dispatch_requests d where d.booking_id = b.id and d.status = 'offered' and d.expires_at > now())))
    order by b.search_expires_at, b.id limit 200
  loop
    perform public.service_dispatch_sweep(r.id);
    n := n + 1;
  end loop;
  return n;
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
  select * into w from public.independent_workers x where x.profile_id = auth.uid() for no key update;
  if w.profile_id is null then
    raise exception 'Complete your worker profile first.' using errcode = '42501';
  end if;
  if p_is_online and w.verification_status <> 'verified' then
    raise exception 'WashLink must verify your account before you can go online.' using errcode = '23514';
  end if;
  update public.independent_workers set is_online = p_is_online, last_seen_at = now(), updated_at = now()
    where profile_id = w.profile_id returning * into w;
  if p_is_online then
    for r in
      select b.id from public.service_bookings b
      where b.status = 'searching_for_worker' and (b.search_expires_at <= now() or not exists (
              select 1 from public.dispatch_requests d where d.booking_id = b.id and d.status = 'offered' and d.expires_at > now()))
      order by b.search_expires_at, b.id limit 50
    loop
      perform public.service_dispatch_sweep(r.id);
    end loop;
  end if;
  return w;
end;
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
    cross join public.platform_settings s
    where d.worker_id = auth.uid() and d.status = 'offered' and d.expires_at > now() and b.status = 'searching_for_worker'
      and s.bookings_open
    order by d.expires_at;
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
  if not (select s.bookings_open from public.platform_settings s) then
    raise exception 'WashLink is not taking bookings right now. Try again later.' using errcode = '23514';
  end if;
  perform public.service_booking_reset_search(p_booking);
  perform public.service_booking_record_transition(p_booking, 'searching_for_worker', 'customer');
  perform public.service_booking_dispatch(p_booking);
  perform public.service_dispatch_sweep(p_booking);
  return (select x.status from public.service_bookings x where x.id = p_booking);
end;
$$;

notify pgrst, 'reload schema';

-- ROLLBACK (reverse order k to g; run after b2ci is rolled back):
-- Re-run service_booking_record_transition and retry_service_booking_search from 2026_11_06_b2cc_booking_engine.sql, and
-- service_booking_dispatch, service_dispatch_sweep_all, set_independent_worker_online and my_dispatch_requests from
-- 2026_11_06_b2cd_dispatch_and_worker_actions.sql. Then:
-- begin;
-- drop function if exists public.service_booking_reset_search(uuid), public.service_dispatch_distance_band(numeric);
-- alter table public.platform_settings drop column if exists worker_start_window_minutes, drop column if exists worker_arrival_window_minutes,
--   drop column if exists overdue_cancel_grace_minutes, drop column if exists scheduled_request_ttl_minutes;
-- commit;
-- Irreversible: the precise distances replaced by the band backfill, and expired offers turned into superseded.
