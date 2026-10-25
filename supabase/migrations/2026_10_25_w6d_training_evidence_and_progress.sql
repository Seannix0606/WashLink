-- =============================================================
-- WashLink W6d - append-only training evidence and DERIVED progress (spec D; C2, C-W3-1;
-- W6 PLAN P25, P26, P29). Requires w6b, w6c. Idempotent.
--
-- P25: completion is never stored. Completed = >= min_training_days DISTINCT dates of current
--      `present` attendance on scheduled `supervised_training` sessions AND the current
--      assessment `passed`. Time, enrollment or a button never completes anything.
-- P26: the trigger has no trusted-session bypass: UPDATE -> 42501; DELETE only when the enrollment
--      row is already gone (worker account deletion cascade). NOT tamper-proof (W6-L5): trusted SQL
--      can still write evidence (set the flag, or disable the trigger). A correction is a new row with
--      supersedes_id and a reason; a row is superseded once (linear chain); current = not superseded.
-- P29: recorder identity, role, designation, display-name snapshot and dates are server-derived.
-- D-18: evidence has no FK to shops / profiles; session_id is RESTRICT; the recorder display
--       name is snapshotted so the record stays meaningful after owner / trainer deletion.
-- "Signed off" = recorded by an authorised owner or trainer; never an electronic signature.
-- =============================================================

create table if not exists public.training_attendance_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  session_id uuid not null references public.training_sessions(id) on delete restrict,
  session_date date not null,
  attendance_status text not null,
  progress_note text,
  recorded_by uuid not null,
  recorder_role text not null,
  recorder_designation_id uuid,
  recorder_display_name text not null,
  recorded_at timestamptz not null default now(),
  supersedes_id uuid references public.training_attendance_records(id) on delete cascade,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tar_status_check check (attendance_status in ('present', 'absent')),
  constraint tar_progress_note_length check (char_length(progress_note) <= 500),
  constraint tar_recorder_role_check check (recorder_role in ('owner', 'trainer')),
  constraint tar_designation_for_trainers check ((recorder_role = 'trainer') = (recorder_designation_id is not null)),
  constraint tar_correction_reason_length check (char_length(correction_reason) between 10 and 300),
  constraint tar_correction_consistency check ((supersedes_id is null) = (correction_reason is null))
);

create unique index if not exists training_attendance_one_per_session
  on public.training_attendance_records (enrollment_id, session_id) where supersedes_id is null;
create unique index if not exists training_attendance_one_per_date
  on public.training_attendance_records (enrollment_id, session_date) where supersedes_id is null;
create unique index if not exists training_attendance_superseded_once
  on public.training_attendance_records (supersedes_id);
create index if not exists training_attendance_session_idx on public.training_attendance_records (session_id);

comment on table public.training_attendance_records is
  'W6: append-only attendance evidence per enrollment and session (one original row per date, C2). Corrections are superseding rows with a reason. Operational record, not tamper-proof (W6-L5).';

create table if not exists public.training_assessments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  checklist_snapshot text[] not null,
  items_met boolean[] not null,
  result text not null,
  assessor_comment text,
  failure_reason text,
  assessed_by uuid not null,
  assessor_role text not null,
  assessor_designation_id uuid,
  assessor_display_name text not null,
  assessed_on date not null,
  signed_off_at timestamptz not null default now(),
  supersedes_id uuid references public.training_assessments(id) on delete cascade,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ta_result_check check (result in ('passed', 'failed')),
  constraint ta_items_match_checklist check (cardinality(items_met) = cardinality(checklist_snapshot)
                                             and cardinality(items_met) >= 1 and array_position(items_met, null) is null),
  constraint ta_pass_requires_every_item check (result = 'failed' or not (false = any (items_met))),
  constraint ta_assessor_comment_length check (char_length(assessor_comment) <= 500),
  constraint ta_failure_reason_check check ((result = 'failed') = (failure_reason is not null)
                                            and coalesce(char_length(failure_reason) between 10 and 300, true)),
  constraint ta_assessor_role_check check (assessor_role in ('owner', 'trainer')),
  constraint ta_designation_for_trainers check ((assessor_role = 'trainer') = (assessor_designation_id is not null)),
  constraint ta_correction_reason_length check (char_length(correction_reason) between 10 and 300),
  constraint ta_correction_consistency check ((supersedes_id is null) = (correction_reason is null))
);

create unique index if not exists training_assessments_one_original
  on public.training_assessments (enrollment_id) where supersedes_id is null;
create unique index if not exists training_assessments_superseded_once
  on public.training_assessments (supersedes_id);

comment on table public.training_assessments is
  'W6: append-only competency assessment evidence (checklist snapshot, items met, passed / failed). "Signed off" means recorded by the shop owner or a designated trainer; it is not an electronic signature or a certificate.';

-- -------------------------------------------------------------
-- 1) Guards (every session, no is_trusted_db_session bypass; still not tamper-proof, W6-L5).
-- -------------------------------------------------------------
create or replace function public.training_evidence_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
  previous_row jsonb;
  session_row public.training_sessions;
  enrollment_row public.training_enrollments;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Training records cannot be edited. Record a correction instead.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.training_enrollments e where e.id = old.enrollment_id) then
      return old;
    end if;
    raise exception 'Training records cannot be deleted. Record a correction instead.' using errcode = '42501';
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Training records are written only through the training actions.' using errcode = '42501';
  end if;
  select * into enrollment_row from public.training_enrollments e where e.id = new.enrollment_id;
  if tg_table_name = 'training_attendance_records' then
    select * into session_row from public.training_sessions s where s.id = (to_jsonb(new) ->> 'session_id')::uuid;
    if session_row.program_id is distinct from enrollment_row.program_id
       or session_row.session_date is distinct from (to_jsonb(new) ->> 'session_date')::date then
      raise exception 'The attendance record does not match its session.' using errcode = '23514';
    end if;
    new.recorded_at := now();
  else
    new.signed_off_at := now();
    new.assessed_on := (now() at time zone 'Asia/Manila')::date;
  end if;
  if new.supersedes_id is not null then
    execute format('select to_jsonb(r) from public.%I r where r.id = $1', tg_table_name)
      into previous_row using new.supersedes_id;
    if previous_row is null
       or (previous_row ->> 'enrollment_id') is distinct from new.enrollment_id::text
       or (tg_table_name = 'training_attendance_records'
           and ((previous_row ->> 'session_id') is distinct from (to_jsonb(new) ->> 'session_id')
                or (previous_row ->> 'session_date') is distinct from (to_jsonb(new) ->> 'session_date'))) then
      raise exception 'A correction must keep the enrollment, session and date of the record it corrects.' using errcode = '23514';
    end if;
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.training_evidence_guard_write() from public, anon, authenticated, service_role;

drop trigger if exists training_attendance_records_guard_write on public.training_attendance_records;
create trigger training_attendance_records_guard_write
  before insert or update or delete on public.training_attendance_records
  for each row execute function public.training_evidence_guard_write();
drop trigger if exists training_assessments_guard_write on public.training_assessments;
create trigger training_assessments_guard_write
  before insert or update or delete on public.training_assessments
  for each row execute function public.training_evidence_guard_write();

-- -------------------------------------------------------------
-- 2) Progress rule. training_progress_status is pure (shared by the view and the predicate).
--    shop_removed (D-18): unfinished training whose shop was deleted (no recorder remains).
-- -------------------------------------------------------------
create or replace function public.training_progress_status(
  p_enrollment_status text, p_shop_present boolean, p_required_days integer,
  p_attended_days integer, p_has_attendance boolean, p_assessment_result text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_enrollment_status = 'invited' and not p_shop_present then 'shop_removed'
    when p_enrollment_status <> 'accepted' then p_enrollment_status
    when p_attended_days >= p_required_days and p_assessment_result = 'passed' then 'completed'
    when p_attended_days >= p_required_days and p_assessment_result = 'failed' then 'failed'
    when not p_shop_present then 'shop_removed'
    when p_attended_days >= p_required_days then 'awaiting_assessment'
    when p_has_attendance then 'in_progress'
    else 'scheduled'
  end;
$$;

revoke all on function public.training_progress_status(text, boolean, integer, integer, boolean, text) from public, anon, service_role;
grant execute on function public.training_progress_status(text, boolean, integer, integer, boolean, text) to authenticated;

-- Internal facts (definer): distinct attended supervised days and the current assessment.
create or replace function public.training_enrollment_attended_days(p_enrollment_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct r.session_date)::integer
  from public.training_attendance_records r
  join public.training_sessions s on s.id = r.session_id
  where r.enrollment_id = p_enrollment_id and r.attendance_status = 'present'
    and s.session_kind = 'supervised_training' and s.status = 'scheduled'
    and not exists (select 1 from public.training_attendance_records n where n.supersedes_id = r.id);
$$;

create or replace function public.training_enrollment_progress_status_of(p_enrollment_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.training_progress_status(
    e.status, e.shop_id is not null, p.min_training_days,
    public.training_enrollment_attended_days(e.id),
    exists (select 1 from public.training_attendance_records r where r.enrollment_id = e.id),
    (select a.result from public.training_assessments a
     where a.enrollment_id = e.id and not exists (select 1 from public.training_assessments n where n.supersedes_id = a.id)))
  from public.training_enrollments e
  join public.training_programs p on p.id = e.program_id
  where e.id = p_enrollment_id;
$$;

-- Used by W7 (certification issuance) and the C7 booking gate.
create or replace function public.training_enrollment_is_completed(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.training_enrollment_progress_status_of(p_enrollment_id) = 'completed', false);
$$;

revoke all on function public.training_enrollment_attended_days(uuid) from public, anon, authenticated, service_role;
revoke all on function public.training_enrollment_progress_status_of(uuid) from public, anon, authenticated, service_role;
revoke all on function public.training_enrollment_is_completed(uuid) from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 3) Read helper and RLS. Evidence: the enrollment worker, the current program owner, a
--    designated trainer of the program while the enrollment is accepted. Writes: deny-all.
-- -------------------------------------------------------------
create or replace function public.can_read_training_evidence(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.training_enrollments e
    where e.id = p_enrollment_id
      and ((e.worker_id = auth.uid())
           or (e.owner_id = auth.uid() and public.is_current_training_program_owner(e.program_id))
           or (e.status = 'accepted' and public.is_designated_training_trainer(e.program_id))));
$$;

revoke all on function public.can_read_training_evidence(uuid) from public, anon, service_role;
grant execute on function public.can_read_training_evidence(uuid) to authenticated;

alter table public.training_attendance_records enable row level security;
alter table public.training_assessments enable row level security;
revoke all on table public.training_attendance_records from public, anon, authenticated, service_role;
revoke all on table public.training_assessments from public, anon, authenticated, service_role;
grant select on table public.training_attendance_records, public.training_assessments to authenticated;

drop policy if exists "tar_select_evidence_audience" on public.training_attendance_records;
create policy "tar_select_evidence_audience" on public.training_attendance_records
  for select to authenticated using (public.can_read_training_evidence(enrollment_id));
drop policy if exists "tar_no_client_insert" on public.training_attendance_records;
create policy "tar_no_client_insert" on public.training_attendance_records for insert to authenticated with check (false);
drop policy if exists "tar_no_client_update" on public.training_attendance_records;
create policy "tar_no_client_update" on public.training_attendance_records for update to authenticated using (false);
drop policy if exists "tar_no_client_delete" on public.training_attendance_records;
create policy "tar_no_client_delete" on public.training_attendance_records for delete to authenticated using (false);

drop policy if exists "ta_select_evidence_audience" on public.training_assessments;
create policy "ta_select_evidence_audience" on public.training_assessments
  for select to authenticated using (public.can_read_training_evidence(enrollment_id));
drop policy if exists "ta_no_client_insert" on public.training_assessments;
create policy "ta_no_client_insert" on public.training_assessments for insert to authenticated with check (false);
drop policy if exists "ta_no_client_update" on public.training_assessments;
create policy "ta_no_client_update" on public.training_assessments for update to authenticated using (false);
drop policy if exists "ta_no_client_delete" on public.training_assessments;
create policy "ta_no_client_delete" on public.training_assessments for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 4) Progress view, then the Realtime exclusion of all six W6 tables (security invoker: the caller's RLS on every joined table applies).
-- -------------------------------------------------------------
create or replace view public.training_enrollment_progress
with (security_invoker = true) as
select e.id as enrollment_id,
       e.program_id,
       e.worker_id,
       e.status as enrollment_status,
       p.min_training_days::integer as required_training_days,
       coalesce(att.attended, 0) as attended_training_days,
       coalesce(att.has_any, false) as has_recorded_attendance,
       cur.id as current_assessment_id,
       cur.result as current_assessment_result,
       public.training_progress_status(e.status, e.shop_id is not null, p.min_training_days,
                                       coalesce(att.attended, 0), coalesce(att.has_any, false), cur.result) as progress_status
from public.training_enrollments e
join public.training_programs p on p.id = e.program_id
left join lateral (
  select count(distinct r.session_date) filter (
           where r.attendance_status = 'present' and s.session_kind = 'supervised_training' and s.status = 'scheduled'
             and not exists (select 1 from public.training_attendance_records n where n.supersedes_id = r.id))::integer as attended,
         count(*) > 0 as has_any
  from public.training_attendance_records r
  join public.training_sessions s on s.id = r.session_id
  where r.enrollment_id = e.id) att on true
left join lateral (
  select a.id, a.result from public.training_assessments a
  where a.enrollment_id = e.id
    and not exists (select 1 from public.training_assessments n where n.supersedes_id = a.id)
  order by a.signed_off_at desc, a.id limit 1) cur on true;

comment on view public.training_enrollment_progress is
  'W6: derived training progress (P25). security_invoker: rows and evidence follow the caller''s RLS. progress_status: invited, scheduled, in_progress, awaiting_assessment, completed, failed, declined, withdrawn, cancelled, shop_removed.';

revoke all on table public.training_enrollment_progress from public, anon, authenticated, service_role;
grant select on table public.training_enrollment_progress to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W6d: supabase_realtime is FOR ALL TABLES and would publish the training tables (D-10 diff). Aborting.';
  end if;
  select string_agg(pt.tablename::text, ', ' order by pt.tablename) into table_name from pg_publication_tables pt
  where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename like 'training\_%';
  if table_name is not null then
    raise exception 'W6d: supabase_realtime publishes training tables: % (D-10 diff). Aborting.', table_name;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- IRREVERSIBLE EVIDENCE LOSS: export first with a trusted
--   copy public.training_attendance_records to '<file>' and the same for training_assessments.
-- -------------------------------------------------------------
-- drop view if exists public.training_enrollment_progress;
-- drop table if exists public.training_assessments;          -- drops its triggers, policies and indexes
-- drop table if exists public.training_attendance_records;
-- drop function if exists public.can_read_training_evidence(uuid);
-- drop function if exists public.training_enrollment_is_completed(uuid);
-- drop function if exists public.training_enrollment_progress_status_of(uuid);
-- drop function if exists public.training_enrollment_attended_days(uuid);
-- drop function if exists public.training_progress_status(text, boolean, integer, integer, boolean, text);
-- drop function if exists public.training_evidence_guard_write();
