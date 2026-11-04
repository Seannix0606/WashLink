-- =============================================================
-- WashLink W15a - required-training booking gate keyed on roster link history (W15 PLAN section 3; D-79, D-80;
-- FINAL_REVIEW F-C2). Requires w2d, w3b, w3d, w6h. Idempotent.
--
-- w6h judged only the CURRENT link of a roster row, so ending the link (owner or worker) and then assigning the row
-- bypassed the gate. W15 records every account ever linked to a roster row in a private table and keys the w6h
-- gate on the current link OR any earlier linked account. No unlink is refused (J16); the w6h booking trigger and
-- its function are NOT replaced (they call roster_worker_in_required_training for both the assign and the start
-- check). The new AFTER trigger on workers writes only roster_link_history, never workers, so the w2d column
-- guard and the w3d / w6f triggers are unaffected and AFTER-trigger order does not matter.
-- Not detectable (W15-L1): a roster row never linked to the trainee (name-only, or deleted and re-created) and
-- links ended before the W3 audit trail existed.
-- =============================================================

-- 1) Preflight (raises, creates nothing).
do $$
declare
  missing text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from (
    select 'table ' || t.name as item from unnest(array['public.workers', 'public.workforce_audit_events', 'public.profiles']) as t(name)
    where to_regclass(t.name) is null
    union all
    select 'function public.roster_worker_in_required_training(uuid, uuid)'
    where to_regprocedure('public.roster_worker_in_required_training(uuid, uuid)') is null
    union all
    select 'trigger bookings_guard_update_training_gate'
    where not exists (select 1 from pg_trigger g where g.tgname = 'bookings_guard_update_training_gate'
                      and g.tgrelid = to_regclass('public.bookings') and not g.tgisinternal)
  ) r;
  if coalesce(missing, '') <> '' then
    raise exception 'W15 preflight: missing objects required by the training gate history: % (D-10)', missing;
  end if;
end;
$$;

-- 2) Private history table. Internal only: RLS on, no policies, no client or service_role grants (D-78 style).
create table if not exists public.roster_link_history (
  worker_row_id uuid not null references public.workers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_linked_at timestamptz not null default now(),
  source text not null,
  constraint roster_link_history_pkey primary key (worker_row_id, user_id),
  constraint roster_link_history_source_check check (source in ('link', 'backfill_current', 'backfill_audit'))
);
create index if not exists roster_link_history_user_id_idx on public.roster_link_history (user_id);
alter table public.roster_link_history enable row level security;
revoke all on table public.roster_link_history from public, anon, authenticated, service_role;
comment on table public.roster_link_history is
  'W15: every account ever linked to a roster row, read only by the w6h training booking gate. Not a contract or relationship '
  'record; never shown to anyone. Rows are deleted with the roster row or the account (retention: W13-L5).';

-- 3) Recorder trigger: one row per (roster row, account); never writes workers. Fix cycle 1 (SEC-1): a no-op
--    `update ... set user_id = user_id` records nothing, and an orphaned user_id (w2d NOT VALID FK in production) is
--    skipped instead of failing the roster write with 23503.
create or replace function public.record_roster_link_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return null;
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.user_id) then
    return null;
  end if;
  insert into public.roster_link_history (worker_row_id, user_id, first_linked_at, source)
  values (new.id, new.user_id, now(), 'link')
  on conflict do nothing;
  return null;
end;
$$;
revoke all on function public.record_roster_link_history() from public, anon, authenticated, service_role;
comment on function public.record_roster_link_history() is 'W15: AFTER trigger on workers; records links in roster_link_history.';

drop trigger if exists workers_record_link_history on public.workers;
create trigger workers_record_link_history
  after insert or update of user_id on public.workers
  for each row
  when (new.user_id is not null)
  execute function public.record_roster_link_history();

-- 4) Backfill (idempotent). Orphaned workers.user_id values (w2d NOT VALID FK) are skipped by the profile join. Audit rows:
--    `roster.linked` (subject_profile_id = the linked account) and, fix cycle 1 (SEC-7), `roster.unlinked` (w3d writes
--    subject_profile_id = old.user_id on unlink and on delete), both as source `backfill_audit`.
create or replace function public.backfill_roster_link_history(out current_count integer, out audit_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.roster_link_history (worker_row_id, user_id, first_linked_at, source)
  select w.id, w.user_id, now(), 'backfill_current'
  from public.workers w join public.profiles p on p.id = w.user_id
  where w.user_id is not null
  on conflict do nothing;
  get diagnostics current_count = row_count;

  insert into public.roster_link_history (worker_row_id, user_id, first_linked_at, source)
  select a.subject_id, a.subject_profile_id, min(a.created_at), 'backfill_audit'
  from public.workforce_audit_events a
  join public.workers w on w.id = a.subject_id
  join public.profiles p on p.id = a.subject_profile_id
  where a.action in ('roster.linked', 'roster.unlinked') and a.subject_type = 'roster_entry'
  group by a.subject_id, a.subject_profile_id
  on conflict do nothing;
  get diagnostics audit_count = row_count;
end;
$$;
revoke all on function public.backfill_roster_link_history() from public, anon, authenticated, service_role;
comment on function public.backfill_roster_link_history() is 'W15: one-time, idempotent backfill of roster_link_history (trusted SQL only).';

do $$
declare
  counts record := public.backfill_roster_link_history();
begin
  raise notice 'W15a backfill: roster_link_history rows added from current links: %, from roster.linked / roster.unlinked audit rows: % (record in the D-10 diff)',
    counts.current_count, counts.audit_count;
end;
$$;

-- 5) The gate: same signature, attributes and revokes as w6h; the enrollment matches the current link OR any
--    account in the row's link history. The w6h filter on a non-null current link is removed.
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
    join public.training_enrollments e on e.owner_id = w.owner_id
      and (e.worker_id = w.user_id
           or exists (select 1 from public.roster_link_history h where h.worker_row_id = w.id and h.user_id = e.worker_id))
    join public.training_programs p on p.id = e.program_id
    where w.id = p_worker_row_id
      and e.status = 'accepted'
      and e.shop_id is not null
      and p.training_kind = 'required_initial'
      and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment'));
$$;

revoke all on function public.roster_worker_in_required_training(uuid, uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; then the W13 order in docs/workforce/ROLLBACK_GUIDE.md)
-- Restores the w6h gate exactly (and so the unlink bypass). Order matters: the function first (it references the
-- table). History is derived data; the links stay in the w3d audit trail.
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
--     join public.training_enrollments e on e.worker_id = w.user_id and e.owner_id = w.owner_id
--     join public.training_programs p on p.id = e.program_id
--     where w.id = p_worker_row_id
--       and w.user_id is not null
--       and e.status = 'accepted'
--       and e.shop_id is not null
--       and p.training_kind = 'required_initial'
--       and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment'));
-- $$;
-- revoke all on function public.roster_worker_in_required_training(uuid, uuid) from public, anon, authenticated, service_role;
-- drop trigger if exists workers_record_link_history on public.workers;
-- drop function if exists public.backfill_roster_link_history();
-- drop function if exists public.record_roster_link_history();
-- drop table if exists public.roster_link_history;
-- notify pgrst, 'reload schema';
