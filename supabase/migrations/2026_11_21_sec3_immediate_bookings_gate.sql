-- =============================================================
-- WashLink SEC-3 - "as soon as possible" bookings follow the product rule (audit finding F4).
-- Commit 19fbafe made every booking a chosen day and time ("washers work fixed hours") but only on the website; the server
-- still accepted p_is_immediate = true. Immediate bookings are now off until a person turns them on with SQL
-- (update public.platform_settings set immediate_bookings_open = true), like document uploads (D-123). No RPC can change it.
-- The dispatch logic for online washers stays, so turning it back on needs no code change.
-- Additive: no committed migration changes.
-- =============================================================

alter table public.platform_settings add column if not exists immediate_bookings_open boolean not null default false;

create or replace function public.service_bookings_immediate_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_immediate and not coalesce((select s.immediate_bookings_open from public.platform_settings s), false) then
    raise exception 'Booking as soon as possible is not available. Choose a day and time.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.service_bookings_immediate_gate() from public, anon, authenticated, service_role;

drop trigger if exists service_bookings_immediate_gate on public.service_bookings;
create trigger service_bookings_immediate_gate before insert on public.service_bookings
  for each row execute function public.service_bookings_immediate_gate();

-- Rollback (manual):
-- drop trigger if exists service_bookings_immediate_gate on public.service_bookings;
-- drop function if exists public.service_bookings_immediate_gate();
-- alter table public.platform_settings drop column if exists immediate_bookings_open;
