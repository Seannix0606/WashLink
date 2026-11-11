-- =============================================================
-- WashLink booking gaps (BG-1): room to travel between washes, and no double requests for one washer.
-- 1) A request offered to a washer and not yet answered now holds its time, like an accepted booking. Before, the slot
--    stayed open until the washer accepted, so two customers could request overlapping times from the same washer.
--    The hold ends when the offer is accepted, declined, expires or is superseded.
-- 2) The travel gap before and after every booking becomes 45 minutes (was 30). The admin can change it
--    (platform_settings.travel_buffer_minutes, 0 to 240) through admin_update_platform_rules, as before.
-- Callers that check a booking against itself already pass p_exclude_booking (dispatch and accept), so a held request
-- never blocks its own acceptance. Additive: no committed migration changes.
-- =============================================================

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
    where b.id is distinct from p_exclude_booking
      and (
        -- Assigned to this washer and not finished.
        (b.worker_id = p_worker and b.status in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress'))
        -- Still looking for a washer, with a live offer to this washer: held until answered.
        or (b.status in ('pending', 'searching_for_worker') and exists (
              select 1 from public.dispatch_requests d
              where d.booking_id = b.id and d.worker_id = p_worker and d.status = 'offered' and d.expires_at > now())))
      and tstzrange(b.scheduled_at - make_interval(mins => s.travel_buffer_minutes),
                    b.scheduled_at + make_interval(mins => b.duration_minutes + s.travel_buffer_minutes))
          && tstzrange(p_start, p_start + make_interval(mins => p_minutes)))
$$;

-- New installs start with 45 minutes; a database still on the old 30-minute default moves to 45. A gap the admin has
-- already changed to something else is left alone.
alter table public.platform_settings alter column travel_buffer_minutes set default 45;
update public.platform_settings set travel_buffer_minutes = 45 where travel_buffer_minutes = 30;
