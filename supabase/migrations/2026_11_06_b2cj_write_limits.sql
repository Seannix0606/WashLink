-- =============================================================
-- WashLink B2C j (B2C-6) - limits on what clients can write (D-100).
-- A NOT VALID check still applies to every later update of a row, even when the checked column did not change, so a bad legacy
-- row would block booking transitions or a suspension. Each constraint normalises first, then NOT VALID, then VALIDATE (D-101).
-- Customers already over a cap keep their rows and can delete them. Local proof only (D-10, D-11).
-- =============================================================

-- ---------- 5 problem reports per person per booking ----------
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
  -- The row lock makes concurrent reports count one at a time.
  select * into b from public.service_bookings x where x.id = p_booking and auth.uid() in (x.worker_id, x.customer_id) for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_report, ''))) not between 10 and 500 then
    raise exception 'Describe the problem in 10 to 500 characters.' using errcode = '23514';
  end if;
  if (select count(*) from public.service_booking_status_events e where e.booking_id = p_booking
      and e.from_status = e.to_status and e.actor_id = auth.uid()) >= 5 then
    raise exception 'You have reached the limit of 5 problem reports for this booking.' using errcode = '23514';
  end if;
  kind := case when b.worker_id = auth.uid() then 'worker' else 'customer' end;
  insert into public.service_booking_status_events (booking_id, from_status, to_status, actor_id, actor_kind, reason)
    values (p_booking, b.status, b.status, auth.uid(), kind, 'Problem reported: ' || btrim(p_report));
  perform public.record_workforce_audit_event('service_booking.problem_reported', 'service_booking', p_booking, b.customer_id,
    jsonb_build_object('changed_by', kind));
end;
$$;

-- ---------- 20 saved addresses and 20 saved vehicles per customer ----------
-- Definer, so the count ignores RLS. The per-customer lock stops parallel inserts passing the count together.
create or replace function public.customer_saved_details_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved integer;
begin
  -- RLS refuses another customer's row. Counting it first would reveal how many they have saved.
  if new.customer_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer_saved_details:' || tg_table_name || ':' || new.customer_id::text, 0));
  if tg_table_name = 'customer_addresses' then
    select count(*)::int into saved from public.customer_addresses a where a.customer_id = new.customer_id;
    if saved >= 20 then
      raise exception 'You can save up to 20 addresses. Delete one to add another.' using errcode = '23514';
    end if;
  else
    select count(*)::int into saved from public.customer_vehicles v where v.customer_id = new.customer_id;
    if saved >= 20 then
      raise exception 'You can save up to 20 vehicles. Delete one to add another.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.customer_saved_details_enforce_cap() from public, anon, authenticated, service_role;

drop trigger if exists customer_addresses_enforce_cap on public.customer_addresses;
create trigger customer_addresses_enforce_cap before insert on public.customer_addresses
  for each row execute function public.customer_saved_details_enforce_cap();
drop trigger if exists customer_vehicles_enforce_cap on public.customer_vehicles;
create trigger customer_vehicles_enforce_cap before insert on public.customer_vehicles
  for each row execute function public.customer_saved_details_enforce_cap();

-- ---------- skills: each element 1 to 40 characters ----------
update public.independent_workers w
  set skills = coalesce((select array_agg(left(btrim(u.skill), 40) order by u.position)
                         from unnest(w.skills) with ordinality u(skill, position)
                         where btrim(coalesce(u.skill, '')) <> ''), '{}')
  where not public.independent_worker_skills_are_valid(w.skills);
alter table public.independent_workers drop constraint if exists independent_workers_skills_valid;
alter table public.independent_workers add constraint independent_workers_skills_valid
  check (public.independent_worker_skills_are_valid(skills)) not valid;
alter table public.independent_workers validate constraint independent_workers_skills_valid;

-- ---------- vehicle year on a booking ----------
update public.service_bookings set vehicle_year = null where vehicle_year not between 1950 and 2100;
alter table public.service_bookings drop constraint if exists service_bookings_vehicle_year_check;
alter table public.service_bookings add constraint service_bookings_vehicle_year_check
  check (vehicle_year is null or vehicle_year between 1950 and 2100) not valid;
alter table public.service_bookings validate constraint service_bookings_vehicle_year_check;

-- ---------- push token shape, and 10 tokens per person ----------
delete from public.device_push_tokens where token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$';
alter table public.device_push_tokens drop constraint if exists device_push_tokens_token_format;
alter table public.device_push_tokens add constraint device_push_tokens_token_format
  check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$') not valid;
alter table public.device_push_tokens validate constraint device_push_tokens_token_format;

-- The oldest token gives way instead of a refusal, so a reinstall still gets push.
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
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'This device could not be registered for notifications.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('device_push_tokens:' || auth.uid()::text, 0));
  insert into public.device_push_tokens (profile_id, token, platform) values (auth.uid(), p_token, p_platform)
    on conflict (token) do update set profile_id = auth.uid(), platform = excluded.platform, last_seen_at = now(), invalid_at = null;
  delete from public.device_push_tokens t where t.id in (
    select o.id from public.device_push_tokens o where o.profile_id = auth.uid() and o.token <> p_token
      order by o.last_seen_at desc, o.created_at desc, o.id offset 9);
end;
$$;

notify pgrst, 'reload schema';

-- ROLLBACK (reverse order k to g; run after b2ck is rolled back):
-- Re-run report_service_booking_problem and register_device_push_token from 2026_11_06_b2cd_dispatch_and_worker_actions.sql. Then:
-- begin;
-- alter table public.device_push_tokens drop constraint if exists device_push_tokens_token_format;
-- alter table public.service_bookings drop constraint if exists service_bookings_vehicle_year_check;
-- alter table public.independent_workers drop constraint if exists independent_workers_skills_valid;
-- drop trigger if exists customer_vehicles_enforce_cap on public.customer_vehicles;
-- drop trigger if exists customer_addresses_enforce_cap on public.customer_addresses;
-- drop function if exists public.customer_saved_details_enforce_cap();
-- commit;
-- Irreversible: normalised skills, nulled vehicle years and deleted malformed push tokens.
