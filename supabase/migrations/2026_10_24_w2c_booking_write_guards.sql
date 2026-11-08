-- =============================================================
-- WashLink W2c - booking write guards (closes S1, E5, S2).
-- Requires 2026_10_24_w2a (is_trusted_db_session). Idempotent.
--
-- Booking status machine for end users (trusted sessions and super admins exempt):
--   customer:        pending -> cancelled
--   shop owner:      pending -> accepted | rejected, accepted -> rejected
--   assigned worker: accepted -> in_progress, in_progress -> completed
-- Every column not explicitly allowed for the caller is immutable (P2: compared as
-- jsonb, so unknown production columns are protected without being named).
-- =============================================================

-- -------------------------------------------------------------
-- 1) S1: client inserts start clean.
-- -------------------------------------------------------------
create or replace function public.guard_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_db_session() then
    return new;
  end if;
  -- Fix cycle 1: a client always books for itself (the RLS check stays as a second layer).
  new.customer_id := auth.uid();
  if new.booking_status is distinct from 'pending'
     or new.assigned_worker_id is not null
     or new.customer_rating_stars is not null
     or new.customer_rating_comment is not null
     or new.customer_rated_at is not null
  then
    raise exception 'New bookings start as pending, unassigned and unrated.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_booking_insert() from public, anon, authenticated;

drop trigger if exists bookings_guard_insert on public.bookings;
create trigger bookings_guard_insert
  before insert on public.bookings
  for each row
  execute function public.guard_booking_insert();

-- -------------------------------------------------------------
-- 2) E5 / S2: column and transition rules per actor (definer: reads shops/workers past RLS).
-- -------------------------------------------------------------
create or replace function public.guard_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  is_customer boolean;
  is_shop_owner boolean;
  is_assigned_worker boolean;
  allowed_keys text[] := array['updated_at'];
  changed_keys text[];
  old_status text := old.booking_status::text;
  new_status text := new.booking_status::text;
  rating_keys constant text[] :=
    array['customer_rating_stars', 'customer_rating_comment', 'customer_rated_at'];
begin
  if public.is_trusted_db_session() then
    return new;
  end if;
  -- S-B1: `on delete set null` cascades (customer_id: customer deleted, assigned_worker_id:
  -- roster row deleted in ANY booking status, shop_id: shop deleted) and nothing else.
  if public.is_orphaned_fk_set_null('public.bookings'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if public.is_super_admin() then
    return new;
  end if;

  is_customer := caller_id is not null and old.customer_id = caller_id;
  is_shop_owner := caller_id is not null and exists (
    select 1 from public.shops s where s.id = old.shop_id and s.owner_id = caller_id
  );
  is_assigned_worker := caller_id is not null and exists (
    select 1 from public.workers w where w.id = old.assigned_worker_id and w.user_id = caller_id
  );

  if is_customer then
    allowed_keys := allowed_keys || array['booking_status'] || rating_keys;
  end if;
  if is_shop_owner then
    allowed_keys := allowed_keys || array['booking_status', 'assigned_worker_id'];
  end if;
  if is_assigned_worker then
    allowed_keys := allowed_keys || array['booking_status'];
  end if;

  select coalesce(array_agg(entry.key), '{}') into changed_keys
  from jsonb_each(to_jsonb(new)) entry
  where entry.value is distinct from (to_jsonb(old) -> entry.key);

  if cardinality(changed_keys) = 0 then
    return new;
  end if;
  if not (changed_keys <@ allowed_keys) then
    raise exception 'This booking field cannot be changed.' using errcode = '42501';
  end if;

  if new_status is distinct from old_status then
    if not (
      (is_customer and old_status = 'pending' and new_status = 'cancelled')
      or (is_shop_owner and (
            (old_status = 'pending' and new_status in ('accepted', 'rejected'))
            or (old_status = 'accepted' and new_status = 'rejected')))
      or (is_assigned_worker and (
            (old_status = 'accepted' and new_status = 'in_progress')
            or (old_status = 'in_progress' and new_status = 'completed')))
    ) then
      raise exception 'This booking status change is not allowed.' using errcode = '42501';
    end if;
  end if;

  if changed_keys && rating_keys then
    -- Star range stays with bookings_customer_rating_stars_check (23514).
    if not (is_customer
            and old_status = 'completed'
            and old.customer_rating_stars is null
            and new.customer_rating_stars is not null) then
      raise exception 'Only a completed, unrated booking can be rated by its customer.'
        using errcode = '42501';
    end if;
    new.customer_rated_at := now();
  end if;

  if new.assigned_worker_id is distinct from old.assigned_worker_id then
    if not (is_shop_owner
            and old_status in ('pending', 'accepted')
            and (new.assigned_worker_id is null or exists (
                   select 1 from public.workers w
                   where w.id = new.assigned_worker_id and w.owner_id = caller_id))) then
      raise exception 'Only a worker from your own roster can be assigned to this booking.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_booking_update() from public, anon, authenticated;

drop trigger if exists bookings_guard_update on public.bookings;
create trigger bookings_guard_update
  before update on public.bookings
  for each row
  execute function public.guard_booking_update();

-- -------------------------------------------------------------
-- 3) Shop-owner booking policies (row access only; column rules are in the trigger).
--    Drops the local-test-only names; duplicates of unknown production owner
--    policies are harmless (permissive OR).
-- -------------------------------------------------------------
drop policy if exists "bookings_owner_select_local_test" on public.bookings;
drop policy if exists "bookings_owner_update_local_test" on public.bookings;

drop policy if exists "bookings_select_shop_owner" on public.bookings;
create policy "bookings_select_shop_owner" on public.bookings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = bookings.shop_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "bookings_update_shop_owner" on public.bookings;
create policy "bookings_update_shop_owner" on public.bookings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.shops s
      where s.id = bookings.shop_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shops s
      where s.id = bookings.shop_id and s.owner_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W2 rollbacks in reverse order f..a)
-- -------------------------------------------------------------
-- drop policy if exists "bookings_update_shop_owner" on public.bookings;
-- drop policy if exists "bookings_select_shop_owner" on public.bookings;
-- -- Local stack: re-run scripts/supabase-test/baseline/local_test_baseline_owner_policies.sql
-- -- (production: restore whatever owner policies the D-10 dump recorded).
-- drop trigger if exists bookings_guard_update on public.bookings;
-- drop function if exists public.guard_booking_update();
-- drop trigger if exists bookings_guard_insert on public.bookings;
-- drop function if exists public.guard_booking_insert();
