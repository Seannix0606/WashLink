-- =============================================================
-- WashLink W16a - the required-training booking gate holds until the enrollment ends (W16 PLAN section 3; D-83, D-84;
-- W15 VERDICT SEC-5). Requires w2c, w6b..w6d, w6h, w15a. Idempotent.
--
-- w15a lifted the gate on two ordinary owner actions while the enrollment still read `accepted`: deleting the training
-- shop (e.shop_id null, progress shop_removed) and recording a failed assessment (progress failed). The gate now holds
-- while the enrollment is `accepted`, `required_initial` and its progress is not `completed`; it no longer needs the
-- training shop to exist, because e.owner_id and workers.owner_id both survive the shop.
-- Same shape, closed here (D-83 P3): bookings.shop_id also goes null on shop delete, so the old `join public.shops` found
-- no row and the assigned trainee could start a booking pre-assigned at the deleted shop. With a null p_shop_id the shop
-- check is skipped and the roster row's owner decides.
-- Only the function body changes: same signature and attributes. The trigger bookings_guard_update_training_gate and its
-- function bookings_guard_training_assignment (w6h) are NOT replaced, so their messages and unassign / complete / trusted
-- behaviour stay. No worker action gains a refusal (J16): withdraw, decline, unlink and every other owner's rows are
-- unaffected. No table, index or RLS change; no data written.
-- Honest limit (W16-L1): a recorded pass or an owner cancel, even at 0 attended days, still lifts the gate. Both leave a
-- record; the cancel notifies the worker. Local proof only (D-10, D-11).
-- =============================================================

-- 1) Preflight (raises, creates nothing).
do $$
declare
  missing text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from (
    select 'function public.roster_worker_in_required_training(uuid, uuid)' as item
    where to_regprocedure('public.roster_worker_in_required_training(uuid, uuid)') is null
    union all
    select 'table public.roster_link_history'
    where to_regclass('public.roster_link_history') is null
    union all
    select 'trigger bookings_guard_update_training_gate'
    where not exists (select 1 from pg_trigger g where g.tgname = 'bookings_guard_update_training_gate'
                      and g.tgrelid = to_regclass('public.bookings') and not g.tgisinternal)
  ) r;
  if coalesce(missing, '') <> '' then
    raise exception 'W16a preflight: missing objects required by the training gate: % (D-10)', missing;
  end if;
end;
$$;

-- 2) The gate (D-83). Same signature, attributes and revokes as w15a.
create or replace function public.roster_worker_in_required_training(p_worker_row_id uuid, p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workers w
    join public.training_enrollments e on e.owner_id = w.owner_id
      and (e.worker_id = w.user_id
           or exists (select 1 from public.roster_link_history h where h.worker_row_id = w.id and h.user_id = e.worker_id))
    join public.training_programs p on p.id = e.program_id
    where w.id = p_worker_row_id
      and (p_shop_id is null or exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = w.owner_id))
      and e.status = 'accepted' and p.training_kind = 'required_initial'
      and public.training_enrollment_progress_status_of(e.id) <> 'completed');
$$;

revoke all on function public.roster_worker_in_required_training(uuid, uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply the w16b block first, then this one, then the W15 order in
-- docs/workforce/ROLLBACK_GUIDE.md). Restores the w15a gate verbatim, which re-opens SEC-5. No data involved.
-- -------------------------------------------------------------
-- create or replace function public.roster_worker_in_required_training(p_worker_row_id uuid, p_shop_id uuid)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
--   select exists (
--     select 1
--     from public.workers w
--     join public.shops s on s.id = p_shop_id and s.owner_id = w.owner_id
--     join public.training_enrollments e on e.owner_id = w.owner_id
--       and (e.worker_id = w.user_id
--            or exists (select 1 from public.roster_link_history h where h.worker_row_id = w.id and h.user_id = e.worker_id))
--     join public.training_programs p on p.id = e.program_id
--     where w.id = p_worker_row_id
--       and e.status = 'accepted'
--       and e.shop_id is not null
--       and p.training_kind = 'required_initial'
--       and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment'));
-- $$;
-- revoke all on function public.roster_worker_in_required_training(uuid, uuid) from public, anon, authenticated, service_role;
-- notify pgrst, 'reload schema';
