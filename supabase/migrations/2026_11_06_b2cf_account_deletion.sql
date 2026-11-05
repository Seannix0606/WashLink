-- B2C account deletion, which the app stores require to be available in the app. Also lets the server-side push sender read
-- device tokens and remove stale ones; the service role has no other B2C table access.
--
-- Past bookings stay as anonymous financial records: price, status and dates remain, while the deleted person's link, location,
-- vehicle, notes and review text go. Shop owners, admins and anyone with shop workforce records are refused here, because their
-- contracts and training evidence have retention rules, and they contact WashLink instead.
--
-- Reversal: drop function public.delete_my_account(), revoke select, delete on public.device_push_tokens from service_role, then restore the previous service_bookings_guard_update from
-- 2026_11_06_b2cb_service_bookings_and_dispatch.sql. Deleted accounts cannot be brought back.

-- 'Removed' is the only change the vehicle snapshot accepts. Clients have no update rights on bookings at all.
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
  if (new.reference, new.service_name, new.addon_names, new.vehicle_category,
      case when new.vehicle_make = 'Removed' then old.vehicle_make else new.vehicle_make end,
      case when new.vehicle_model = 'Removed' then old.vehicle_model else new.vehicle_model end,
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

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
begin
  if caller is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  -- These locks make a booking or acceptance that starts now wait, then fail, instead of slipping past the checks below.
  select role into caller_role from public.profiles where id = caller for update;
  perform 1 from public.independent_workers where profile_id = caller for update;

  if caller_role is null or caller_role not in ('customer', 'worker')
     or exists (select 1 from public.worker_profiles where profile_id = caller)
     or exists (select 1 from public.workers where user_id = caller) then
    raise exception 'This account has records WashLink must keep. Contact WashLink to close it.' using errcode = '42501';
  end if;

  if exists (select 1 from public.service_bookings
             where (customer_id = caller or worker_id = caller)
               and status not in ('completed', 'cancelled', 'expired')) then
    raise exception 'Finish, cancel or hand back your current bookings first.' using errcode = '55000';
  end if;

  update public.service_bookings
  set address = 'Removed at customer request', latitude = 0, longitude = 0, landmark = '', instructions = '',
      vehicle_make = 'Removed', vehicle_model = 'Removed'
  where customer_id = caller;

  update public.service_booking_status_events e
  set reason = null
  where e.actor_id = caller
     or e.booking_id in (select id from public.service_bookings where customer_id = caller);

  update public.service_booking_reviews set comment = '' where customer_id = caller;

  -- Removes the profile, saved details, device tokens, notifications and worker profile; booking links become empty.
  delete from auth.users where id = caller;
end;
$$;
revoke all on function public.delete_my_account() from public, anon, service_role;
grant execute on function public.delete_my_account() to authenticated;

grant select, delete on public.device_push_tokens to service_role;
