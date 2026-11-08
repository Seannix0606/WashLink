-- =============================================================
-- WashLink B2C i (B2C-6) - who may act on a booking, and when.
-- A washer who is not verified loses customer data and job control, and unstarted jobs return to search (D-92). Acceptance
-- serialises with the admin's status change by locking the washer row, always worker then booking, so they cannot deadlock.
-- A scheduled job's steps open at its start window (D-98), and a customer can leave a job that is well overdue (D-99).
-- Base location is locked while an offer is open (D-97). Admin cancel of a started job reuses cancel_service_booking (D-93).
-- Signatures are unchanged, so create or replace keeps each function's ACL. Local proof only (D-10, D-11).
-- =============================================================

-- Returns a booking to search in a new round. The old washer's rows become declined: the accepted row has to go, because
-- dispatch_requests_one_accepted would otherwise refuse the next acceptance, and that washer stays excluded (D-92, D-94).
create or replace function public.service_booking_requeue(p_booking uuid, p_actor_kind text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_worker uuid;
begin
  select b.worker_id into old_worker from public.service_bookings b where b.id = p_booking for update;
  perform public.service_booking_reset_search(p_booking);
  perform public.service_booking_record_transition(p_booking, 'searching_for_worker', p_actor_kind, p_reason);
  update public.dispatch_requests set status = 'declined', responded_at = now()
    where booking_id = p_booking and worker_id = old_worker;
  perform public.service_dispatch_sweep(p_booking);
end;
$$;
revoke all on function public.service_booking_requeue(uuid, text, text) from public, anon, authenticated, service_role;

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
  -- Waits for an admin status change in progress, so the eligibility check below reads the result.
  perform 1 from public.independent_workers w where w.profile_id = me for share;
  select * into d from public.dispatch_requests x where x.id = p_request and x.worker_id = me;
  if d.id is null then
    raise exception 'Request not found.' using errcode = '42501';
  end if;
  if not (select s.bookings_open from public.platform_settings s) then
    raise exception 'WashLink is not taking bookings right now. Try again later.' using errcode = '23514';
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

-- Only the assigned, verified worker, only the next step, and the expected status catches a stale screen.
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
  if not exists (select 1 from public.independent_workers w where w.profile_id = auth.uid() and w.verification_status = 'verified') then
    raise exception 'WashLink has paused your account. Contact WashLink about this booking.' using errcode = '23514';
  end if;
  if b.status is distinct from p_expected_status then
    raise exception 'This booking changed. Refresh and try again.' using errcode = '55000';
  end if;
  next_status := case b.status when 'accepted' then 'worker_on_the_way' when 'worker_on_the_way' then 'arrived'
    when 'arrived' then 'in_progress' when 'in_progress' then 'completed' end;
  if next_status is null then
    raise exception 'This booking has no next step.' using errcode = '23514';
  end if;
  if not b.is_immediate and now() < b.scheduled_at - make_interval(mins => (select s.worker_start_window_minutes from public.platform_settings s)) then
    raise exception 'This booking can''t start yet. You can begin up to 2 hours before its scheduled time.' using errcode = '23514';
  end if;
  -- Travel can start early, but marking arrival early would stop the customer cancelling for hours (D-107).
  if not b.is_immediate and next_status <> 'worker_on_the_way'
     and now() < b.scheduled_at - make_interval(mins => (select s.worker_arrival_window_minutes from public.platform_settings s)) then
    raise exception 'It''s too early for this step. You can mark arrival up to 30 minutes before the scheduled time.' using errcode = '23514';
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
  perform public.service_booking_requeue(p_booking, 'worker', btrim(p_reason));
end;
$$;

-- Exact address and customer contact only for the assigned, verified worker while the job is active.
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
  cross join lateral (select b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress')
    and exists (select 1 from public.independent_workers w where w.profile_id = auth.uid() and w.verification_status = 'verified') as is_active) a
  left join public.profiles p on p.id = b.customer_id
  where b.worker_id = auth.uid()
  order by a.is_active desc, b.scheduled_at desc
  limit 200
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
  grace integer;
  result public.service_booking_status_events;
begin
  select * into b from public.service_bookings x where x.id = p_booking for update;
  if b.id is null or auth.uid() is null or (b.customer_id is distinct from auth.uid() and not is_admin) then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  select s.overdue_cancel_grace_minutes into grace from public.platform_settings s;
  if b.status in ('completed', 'cancelled', 'expired')
     or (not is_admin and b.status in ('arrived', 'in_progress')
         and now() < b.scheduled_at + make_interval(mins => b.duration_minutes + grace)) then
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

-- Any status other than verified closes the washer's offers and returns unstarted jobs. Started jobs stay for the admin to cancel.
create or replace function public.admin_review_independent_worker(p_worker uuid, p_status text, p_note text default null)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.independent_workers;
  offer_bookings uuid[];
  job_bookings uuid[];
  target uuid;
  started integer := 0;
  payload jsonb := jsonb_build_object('verification_status', p_status);
begin
  perform public.b2c_require_super_admin();
  if p_status not in ('verified', 'rejected', 'suspended', 'pending') then
    raise exception 'Choose a verification status.' using errcode = '22023';
  end if;
  update public.independent_workers set verification_status = p_status, verification_note = nullif(btrim(coalesce(p_note, '')), ''),
      verified_at = case when p_status = 'verified' then now() end, verified_by = auth.uid(),
      is_online = case when p_status = 'verified' then is_online else false end, updated_at = now()
    where profile_id = p_worker returning * into result;
  if result.profile_id is null then
    raise exception 'Worker not found.' using errcode = '42501';
  end if;
  if p_status <> 'verified' then
    with closed as (
      update public.dispatch_requests d set status = 'declined', responded_at = now()
        where d.worker_id = p_worker and d.status = 'offered' returning d.booking_id)
    select coalesce(array_agg(c.booking_id), '{}') into offer_bookings from closed c;
    foreach target in array offer_bookings loop
      perform public.service_dispatch_sweep(target);
    end loop;
    -- The status filter is rechecked after each lock, so a job the washer just started is left for the admin.
    select coalesce(array_agg(j.id), '{}') into job_bookings from (
      select b.id from public.service_bookings b
        where b.worker_id = p_worker and b.status in ('accepted', 'worker_on_the_way') order by b.id for update) j;
    foreach target in array job_bookings loop
      perform public.service_booking_requeue(target, 'super_admin', 'Washer no longer available.');
    end loop;
    select count(*)::int into started from public.service_bookings b
      where b.worker_id = p_worker and b.status in ('arrived', 'in_progress');
    payload := payload || jsonb_build_object('offers_closed', cardinality(offer_bookings),
      'bookings_returned_to_search', cardinality(job_bookings), 'started_jobs_left', started);
  end if;
  perform public.record_workforce_audit_event('independent_worker.reviewed', 'independent_worker', p_worker, p_worker, payload);
  return result;
end;
$$;

-- Lives here because the profile save below calls it; b2cj uses it for the CHECK constraint on independent_workers.skills.
create or replace function public.independent_worker_skills_are_valid(p_skills text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select not exists (select 1 from unnest(p_skills) x where x is null or char_length(btrim(x)) = 0 or char_length(x) > 40)
$$;
revoke all on function public.independent_worker_skills_are_valid(text[]) from public, anon, authenticated, service_role;

create or replace function public.save_independent_worker_profile(p_bio text, p_skills text[], p_latitude double precision,
  p_longitude double precision, p_radius_km numeric)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.independent_workers;
  result public.independent_workers;
begin
  if auth.uid() is null or public.current_user_profile_role() is distinct from 'worker' then
    raise exception 'Sign in with a worker account.' using errcode = '42501';
  end if;
  if not public.independent_worker_skills_are_valid(coalesce(p_skills, '{}')) then
    raise exception 'Each skill must be 1 to 40 characters.' using errcode = '23514';
  end if;
  select * into current_row from public.independent_workers w where w.profile_id = auth.uid() for no key update;
  if current_row.profile_id is not null
     and (current_row.base_latitude, current_row.base_longitude) is distinct from (p_latitude, p_longitude)
     and exists (select 1 from public.dispatch_requests d where d.worker_id = auth.uid() and d.status = 'offered' and d.expires_at > now())
     and (select s.bookings_open from public.platform_settings s) then
    raise exception 'Finish or decline your open requests before changing your base location.' using errcode = '55000';
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

notify pgrst, 'reload schema';

-- ROLLBACK (reverse order k to g; run after b2cj is rolled back):
-- Re-run accept_dispatch_request, advance_service_booking, release_service_booking, my_assigned_service_bookings and
-- save_independent_worker_profile from 2026_11_06_b2cd_dispatch_and_worker_actions.sql, cancel_service_booking from
-- 2026_11_06_b2cc_booking_engine.sql, and admin_review_independent_worker from 2026_11_06_b2ce_admin_operations.sql. Then:
-- begin;
-- drop function if exists public.independent_worker_skills_are_valid(text[]), public.service_booking_requeue(uuid, text, text);
-- commit;
-- Irreversible: bookings returned to search and offers closed by a status change stay as they are.
