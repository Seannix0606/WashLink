-- =============================================================
-- WashLink W14c - the WashLink moderation path on job_openings, the publish hold and the owner-close resolution
-- (spec A, B; D-51, D-52; W14 PLAN 3.3, P74, P75). Requires w4c, w4d, w5e, w14b. Idempotent.
-- P74: NO W4 function body is replaced. The single w4c row trigger job_openings_guard_write (BEFORE INSERT OR UPDATE OR
--      DELETE) is split into two triggers on the UNCHANGED public.job_openings_guard_write():
--        job_openings_guard_write          BEFORE INSERT OR DELETE
--        job_openings_guard_write_update   BEFORE UPDATE, WHEN the transaction-local washlink.job_opening_moderation is
--                                          not the row id
--      and the new job_openings_guard_moderation (BEFORE UPDATE, WHEN that flag = the row id) takes the W4 guard's place
--      for exactly one kind of update: a super_admin (auth.uid() + is_super_admin() + profile role super_admin) under
--      washlink.job_opening_moderation_case = an open / changes_submitted / paused_by_washlink case of this opening,
--      changing only status, status_changed_at and updated_at, published | paused -> paused | closed. Anything else 42501.
--      The flags are set only by moderate_job_opening (w14d); set_config is not exposed to clients (D-10 row 10).
-- P75: job_openings_moderation_hold (BEFORE UPDATE WHEN the status changes to published) refuses while a case of the
--      opening is paused_by_washlink / changes_submitted (23514). Trusted sessions bypass (audited repair).
--      job_openings_moderation_resolve (AFTER UPDATE WHEN the status changes to closed / archived without the moderation
--      flag): an owner close / archive moves the active paused case to resolved_owner_closed with an owner_closed action
--      and closes its open reports as opening_closed.
-- BEFORE UPDATE order (names sort): job_openings_guard_moderation < job_openings_guard_write_update <
--      job_openings_moderation_hold < job_openings_normalize (job_openings_guard_write fires on INSERT / DELETE only).
-- Lock order: job_openings row -> case row -> report rows.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Internal: close every open report of a case with an outcome (one flag per report row).
-- -------------------------------------------------------------
create or replace function public.job_opening_moderation_close_reports(p_case uuid, p_outcome text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report_row record;
  closed_count integer := 0;
begin
  for report_row in
    select r.id from public.job_opening_reports r where r.case_id = p_case and r.status = 'open' order by r.created_at, r.id for update
  loop
    perform set_config('washlink.job_opening_report_write', report_row.id::text, true);
    update public.job_opening_reports set status = 'closed', outcome = p_outcome where id = report_row.id;
    closed_count := closed_count + 1;
  end loop;
  perform set_config('washlink.job_opening_report_write', '', true);
  return closed_count;
end;
$$;

-- -------------------------------------------------------------
-- 2) The moderation guard (P74), the hold (P75) and the owner-close resolution.
-- -------------------------------------------------------------
create or replace function public.job_openings_guard_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  case_flag text := coalesce(current_setting('washlink.job_opening_moderation_case', true), '');
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin'
     or not exists (select 1 from public.job_opening_moderation_cases c
                    where c.id::text = case_flag and c.job_opening_id = new.id
                      and c.status in ('open', 'changes_submitted', 'paused_by_washlink'))
     or old.status not in ('published', 'paused') or new.status not in ('paused', 'closed')
     or new.status is not distinct from old.status
     or exists (select 1 from jsonb_each(to_jsonb(new)) entry
                where entry.key not in ('status', 'status_changed_at', 'updated_at')
                  and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'This job opening change is not allowed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.job_openings_moderation_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_trusted_db_session() then
    return new;   -- audited trusted repair (job_openings_audit records trusted_session)
  end if;
  if exists (select 1 from public.job_opening_moderation_cases c
             where c.job_opening_id = new.id and c.status in ('paused_by_washlink', 'changes_submitted')) then
    raise exception 'WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.job_openings_moderation_resolve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_case uuid;
begin
  select c.id into active_case from public.job_opening_moderation_cases c
  where c.job_opening_id = new.id and c.status in ('paused_by_washlink', 'changes_submitted')
  for update;
  if active_case is null then
    return null;
  end if;
  perform set_config('washlink.job_opening_moderation_write', active_case::text, true);
  update public.job_opening_moderation_cases set status = 'resolved_owner_closed' where id = active_case;
  insert into public.job_opening_moderation_actions (case_id, action, opening_snapshot)
  values (active_case, 'owner_closed', public.job_opening_application_snapshot(new));
  perform public.job_opening_moderation_close_reports(active_case, 'opening_closed');
  perform set_config('washlink.job_opening_moderation_write', '', true);
  return null;
end;
$$;

revoke all on function public.job_opening_moderation_close_reports(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.job_openings_guard_moderation() from public, anon, authenticated, service_role;
revoke all on function public.job_openings_moderation_hold() from public, anon, authenticated, service_role;
revoke all on function public.job_openings_moderation_resolve() from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 3) Trigger split (P74). Both W4 triggers run the unchanged public.job_openings_guard_write().
-- -------------------------------------------------------------
drop trigger if exists job_openings_guard_write on public.job_openings;
create trigger job_openings_guard_write
  before insert or delete on public.job_openings
  for each row execute function public.job_openings_guard_write();

drop trigger if exists job_openings_guard_write_update on public.job_openings;
create trigger job_openings_guard_write_update
  before update on public.job_openings
  for each row
  when (coalesce(current_setting('washlink.job_opening_moderation', true), '') is distinct from new.id::text)
  execute function public.job_openings_guard_write();

drop trigger if exists job_openings_guard_moderation on public.job_openings;
create trigger job_openings_guard_moderation
  before update on public.job_openings
  for each row
  when (coalesce(current_setting('washlink.job_opening_moderation', true), '') = new.id::text)
  execute function public.job_openings_guard_moderation();

drop trigger if exists job_openings_moderation_hold on public.job_openings;
create trigger job_openings_moderation_hold
  before update on public.job_openings
  for each row
  when (old.status is distinct from new.status and new.status = 'published')
  execute function public.job_openings_moderation_hold();

drop trigger if exists job_openings_moderation_resolve on public.job_openings;
create trigger job_openings_moderation_resolve
  after update on public.job_openings
  for each row
  when (old.status is distinct from new.status and new.status in ('closed', 'archived')
        and coalesce(current_setting('washlink.job_opening_moderation', true), '') is distinct from new.id::text)
  execute function public.job_openings_moderation_resolve();

-- The BEFORE order is load-bearing (R1): abort if another BEFORE UPDATE trigger sorts between the W14 / W4 guards.
do $$
declare
  actual text[];
begin
  select array_agg(t.tgname::text order by t.tgname) into actual
  from pg_trigger t
  where t.tgrelid = 'public.job_openings'::regclass and not t.tgisinternal
    and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16;   -- BEFORE ... UPDATE
  if actual is distinct from array['job_openings_guard_moderation', 'job_openings_guard_write_update',
                                   'job_openings_moderation_hold', 'job_openings_normalize'] then
    raise exception 'W14c: unexpected BEFORE UPDATE triggers on job_openings: % (D-10, R1)', actual;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a; roll back w14d..w14i first)
-- Run the whole block as ONE transaction (N6): it drops the W14 triggers and functions, then restores the single w4c
-- trigger exactly as w4c created it; a failure part-way rolls everything back, so owner UPDATEs are never left without
-- the W4 guard. A held (paused_by_washlink) opening becomes resumable by its owner. W4 / W5 rollbacks are invalid while
-- the w14c triggers exist.
-- -------------------------------------------------------------
-- begin;
-- drop trigger if exists job_openings_moderation_resolve on public.job_openings;
-- drop trigger if exists job_openings_moderation_hold on public.job_openings;
-- drop trigger if exists job_openings_guard_moderation on public.job_openings;
-- drop trigger if exists job_openings_guard_write_update on public.job_openings;
-- drop function if exists public.job_openings_moderation_resolve();
-- drop function if exists public.job_openings_moderation_hold();
-- drop function if exists public.job_openings_guard_moderation();
-- drop function if exists public.job_opening_moderation_close_reports(uuid, text);
-- drop trigger if exists job_openings_guard_write on public.job_openings;
-- create trigger job_openings_guard_write
--   before insert or update or delete on public.job_openings
--   for each row execute function public.job_openings_guard_write();
-- commit;
