-- =============================================================
-- WashLink B2C k (B2C-6) - account deletion now checks the password on the server, and refuses people with shop-booking history.
-- Any live token could delete the account, because the password prompt existed only in the client. The sign-in time comes from the
-- JWT amr claim, not iat, because a refresh keeps the original sign-in time (D-90). A recovery session has method otp and is refused.
-- A customer on the shop booking table is refused for any status (D-91): the customer link there is ON DELETE SET NULL, so name,
-- address and notes would outlive the person. Deletion also clears request distance and vehicle year, and is audited.
-- Local proof only (D-10, D-11). If the production Auth version has a different amr shape, every self-deletion is refused.
-- =============================================================

-- The case keeps a malformed timestamp from reaching the numeric cast, whatever order the planner picks for the conditions.
create or replace function public.auth_recent_password_sign_in(p_max_age_seconds integer default 300)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) e
    where e ->> 'method' = 'password'
      and case when jsonb_typeof(e -> 'timestamp') = 'number' then (e ->> 'timestamp')::numeric end
          between extract(epoch from now()) - p_max_age_seconds and extract(epoch from now()) + 60)
$$;
revoke all on function public.auth_recent_password_sign_in(integer) from public, anon, authenticated, service_role;

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
  if not public.auth_recent_password_sign_in() then
    raise exception 'Enter your password again to delete this account.' using errcode = '42501';
  end if;

  -- These locks make a booking or acceptance that starts now wait, then fail, instead of slipping past the checks below.
  select role into caller_role from public.profiles where id = caller for update;
  perform 1 from public.independent_workers where profile_id = caller for update;

  if caller_role is null or caller_role not in ('customer', 'worker')
     or exists (select 1 from public.worker_profiles where profile_id = caller)
     or exists (select 1 from public.workers where user_id = caller)
     or exists (select 1 from public.bookings where customer_id = caller) then
    raise exception 'This account can''t be deleted here. Only WashLink can close it.' using errcode = '42501';
  end if;

  if exists (select 1 from public.service_bookings
             where (customer_id = caller or worker_id = caller)
               and status not in ('completed', 'cancelled', 'expired')) then
    raise exception 'Finish, cancel or hand back your current bookings first.' using errcode = '55000';
  end if;

  perform public.record_workforce_audit_event('account.self_deleted', 'account', caller, caller,
    jsonb_build_object('role', caller_role));

  update public.service_bookings
  set address = 'Removed at customer request', latitude = 0, longitude = 0, landmark = '', instructions = '',
      vehicle_make = 'Removed', vehicle_model = 'Removed', vehicle_year = null
  where customer_id = caller;

  update public.dispatch_requests set distance_km = null
  where booking_id in (select id from public.service_bookings where customer_id = caller);

  update public.service_booking_status_events e
  set reason = null
  where e.actor_id = caller
     or e.booking_id in (select id from public.service_bookings where customer_id = caller);

  update public.service_booking_reviews set comment = '' where customer_id = caller;

  -- Removes the profile, saved details, device tokens, notifications and worker profile; booking links become empty.
  delete from auth.users where id = caller;
end;
$$;

-- Bookings of people who deleted their account before this migration.
update public.dispatch_requests d set distance_km = null
  from public.service_bookings b
  where b.id = d.booking_id and b.address = 'Removed at customer request' and d.distance_km is not null;
update public.service_bookings set vehicle_year = null
  where address = 'Removed at customer request' and vehicle_year is not null;

notify pgrst, 'reload schema';

-- ROLLBACK (first of the B2C-6 blocks; reverse order k to g):
-- Re-run delete_my_account from 2026_11_06_b2cf_account_deletion.sql. That removes the password, shop-booking and audit checks. Then:
-- begin;
-- drop function if exists public.auth_recent_password_sign_in(integer);
-- commit;
-- Irreversible: deleted accounts, and the distances and vehicle years cleared by the backfill.
