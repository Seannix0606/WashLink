-- =============================================================
-- WashLink W6h - booking-assignment gate during required training (C7, W6 half; D-17;
-- W6 PLAN 3.8). Requires w2c, w2d, w6b..w6d. Idempotent.
--
-- A roster row OF THE BOOKING SHOP'S OWNER (workers.owner_id = shops.owner_id of bookings.shop_id)
-- whose linked worker account (workers.user_id) holds an ACCEPTED enrollment with the SAME owner,
-- required initial training, a shop that still exists and progress
-- scheduled / in_progress / awaiting_assessment cannot be assigned to a customer booking, and the
-- assigned worker cannot start one (-> in_progress). A booking already in progress may complete.
-- Separate BEFORE UPDATE trigger `bookings_guard_update_training_gate`: named to sort (and so fire)
-- AFTER the W2c `bookings_guard_update`, whose body is untouched, so a caller the W2 guard refuses
-- (non-owner, foreign roster row) gets the W2 error and never the training message. Trusted
-- sessions bypass; everyone else (super_admin included) is gated. Read-only: never writes
-- bookings, prices or training rows. Unlinked roster rows, other owners' trainees and invited /
-- declined / withdrawn / cancelled / completed / failed / shop_removed enrollments are unaffected.
-- =============================================================

drop function if exists public.roster_worker_in_required_training(uuid);
create or replace function public.roster_worker_in_required_training(p_worker_row_id uuid, p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workers w
    join public.shops s on s.id = p_shop_id and s.owner_id = w.owner_id
    join public.training_enrollments e on e.worker_id = w.user_id and e.owner_id = w.owner_id
    join public.training_programs p on p.id = e.program_id
    where w.id = p_worker_row_id
      and w.user_id is not null
      and e.status = 'accepted'
      and e.shop_id is not null
      and p.training_kind = 'required_initial'
      and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment'));
$$;

revoke all on function public.roster_worker_in_required_training(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.bookings_guard_training_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_trusted_db_session() or new.assigned_worker_id is null then
    return new;
  end if;
  if new.assigned_worker_id is distinct from old.assigned_worker_id
     and public.roster_worker_in_required_training(new.assigned_worker_id, new.shop_id) then
    raise exception 'This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends.'
      using errcode = '23514';
  end if;
  if new.booking_status::text = 'in_progress' and old.booking_status::text is distinct from 'in_progress'
     and public.roster_worker_in_required_training(new.assigned_worker_id, new.shop_id) then
    if exists (select 1 from public.workers w where w.id = new.assigned_worker_id and w.user_id = auth.uid()) then
      raise exception 'You are in required training with this shop and cannot start customer bookings until the training ends.'
        using errcode = '23514';
    end if;
    raise exception 'This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.bookings_guard_training_assignment() from public, anon, authenticated, service_role;

drop trigger if exists bookings_guard_training_assignment on public.bookings;   -- pre-review name
drop trigger if exists bookings_guard_update_training_gate on public.bookings;
create trigger bookings_guard_update_training_gate
  before update on public.bookings
  for each row
  when ((new.assigned_worker_id is not null and new.assigned_worker_id is distinct from old.assigned_worker_id)
        or (new.booking_status::text = 'in_progress' and old.booking_status::text is distinct from 'in_progress'))
  execute function public.bookings_guard_training_assignment();

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- Bookings behave as after W5.
-- -------------------------------------------------------------
-- drop trigger if exists bookings_guard_update_training_gate on public.bookings;
-- drop function if exists public.bookings_guard_training_assignment();
-- drop function if exists public.roster_worker_in_required_training(uuid, uuid);
