-- =============================================================
-- WashLink W6g - training evidence RPCs (attendance, assessment, corrections) and narrow reads
-- (spec D; D-4; C2; W6 PLAN 3.7, P26, P29). Requires w6b..w6f. Idempotent.
-- Recorder = is_authorised_training_recorder (current shop owner, or a designated trainer whose
-- roster link still exists) and never the enrollment worker; else 42501
-- `Only the shop owner or a designated trainer can record training.` (also for unknown ids).
-- Identity, role, designation, display-name snapshot and dates are server-derived (P29).
-- Lock order: training_programs row (FOR SHARE) -> training_enrollments row (FOR SHARE) -> for a
-- trainer, the designation's `workers` roster row (FOR SHARE; the link is then re-checked) ->
-- advisory `training_evidence:<enrollment_id>`. A failed assessment needs a reason (10..300).
-- =============================================================

create or replace function public.lock_training_enrollment_for_recorder(
  p_enrollment_id uuid, out enrollment public.training_enrollments, out program public.training_programs,
  out recorder_role text, out designation_id uuid, out display_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  program_ref uuid := (select e.program_id from public.training_enrollments e where e.id = p_enrollment_id);
begin
  if program_ref is not null then
    select * into program from public.training_programs p where p.id = program_ref for share;
    select * into enrollment from public.training_enrollments e where e.id = p_enrollment_id for share;
    recorder_role := public.is_authorised_training_recorder(program_ref);
    if recorder_role = 'trainer' then   -- hold the roster link so an unlink cannot race the write
      perform 1 from public.workers w join public.training_program_trainers t on t.roster_worker_id = w.id
      where t.program_id = program_ref and t.trainer_id = auth.uid() and t.revoked_at is null for share of w;
      recorder_role := public.is_authorised_training_recorder(program_ref);
    end if;
  end if;
  if enrollment.id is null or recorder_role is null or enrollment.worker_id = auth.uid() then
    raise exception 'Only the shop owner or a designated trainer can record training.' using errcode = '42501';
  end if;
  if recorder_role = 'trainer' then
    select t.id into designation_id from public.training_program_trainers t
    where t.program_id = program_ref and t.trainer_id = auth.uid() and t.revoked_at is null
    order by t.designated_at desc limit 1;
  end if;
  select left(coalesce(nullif(btrim(pr.full_name), ''), case recorder_role when 'owner' then 'Shop owner' else 'Trainer' end), 200)
    into display_name from (select 1) one left join public.profiles pr on pr.id = auth.uid();
  perform pg_advisory_xact_lock(hashtextextended('training_evidence:' || p_enrollment_id::text, 0));
end;
$$;

create or replace function public.record_training_attendance(
  p_enrollment_id uuid, p_session_id uuid, p_attendance_status text, p_progress_note text default null)
returns public.training_attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked record := public.lock_training_enrollment_for_recorder(p_enrollment_id);
  target public.training_enrollments := locked.enrollment;
  session_row public.training_sessions;
  new_id uuid := gen_random_uuid();
  created public.training_attendance_records;
begin
  if target.status <> 'accepted' then
    raise exception 'Attendance can be recorded only for an accepted enrollment.' using errcode = '23514';
  end if;
  select * into session_row from public.training_sessions s where s.id = p_session_id;
  if session_row.id is null or session_row.program_id <> target.program_id or session_row.status <> 'scheduled' then
    raise exception 'Choose a scheduled session of this program.' using errcode = '23514';
  end if;
  if session_row.session_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'This session has not happened yet.' using errcode = '23514';
  end if;
  if session_row.session_date < (target.accepted_at at time zone 'Asia/Manila')::date then
    raise exception 'This session was before the worker enrolled.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.training_write', new_id::text, true);
    insert into public.training_attendance_records (id, enrollment_id, session_id, session_date, attendance_status,
      progress_note, recorded_by, recorder_role, recorder_designation_id, recorder_display_name)
    values (new_id, target.id, session_row.id, session_row.session_date, p_attendance_status,
      nullif(btrim(p_progress_note), ''), auth.uid(), locked.recorder_role, locked.designation_id, locked.display_name)
    returning * into created;
  exception when unique_violation then
    raise exception 'Attendance for this day is already recorded. Record a correction instead.' using errcode = '23505';
  end;
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

create or replace function public.correct_training_attendance(
  p_attendance_id uuid, p_attendance_status text, p_progress_note text, p_correction_reason text)
returns public.training_attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous public.training_attendance_records;
  locked record;
  reason text := nullif(btrim(p_correction_reason), '');
  note text := nullif(btrim(p_progress_note), '');
  new_id uuid := gen_random_uuid();
  created public.training_attendance_records;
begin
  select * into previous from public.training_attendance_records r where r.id = p_attendance_id;
  locked := public.lock_training_enrollment_for_recorder(previous.enrollment_id);
  if (locked.enrollment).status <> 'accepted' then
    raise exception 'Records can be corrected only for an accepted enrollment.' using errcode = '23514';
  end if;
  if exists (select 1 from public.training_attendance_records n where n.supersedes_id = previous.id) then
    raise exception 'This record was already corrected.' using errcode = '23505';
  end if;
  if reason is null or char_length(reason) not between 10 and 300 then
    raise exception 'Give a correction reason of 10 to 300 characters.' using errcode = '23514';
  end if;
  if p_attendance_status is not distinct from previous.attendance_status and note is not distinct from previous.progress_note then
    raise exception 'A correction must change the attendance or the note.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.training_write', new_id::text, true);
    insert into public.training_attendance_records (id, enrollment_id, session_id, session_date, attendance_status,
      progress_note, recorded_by, recorder_role, recorder_designation_id, recorder_display_name, supersedes_id, correction_reason)
    values (new_id, previous.enrollment_id, previous.session_id, previous.session_date, p_attendance_status, note,
      auth.uid(), locked.recorder_role, locked.designation_id, locked.display_name, previous.id, reason)
    returning * into created;
  exception when unique_violation then
    raise exception 'This record was already corrected.' using errcode = '23505';
  end;
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

-- Shared assessment checks and insert (p_supersedes_id null = first assessment).
create or replace function public.insert_training_assessment(
  p_enrollment_id uuid, p_items_met boolean[], p_result text, p_assessor_comment text,
  p_supersedes_id uuid, p_correction_reason text, p_failure_reason text)
returns public.training_assessments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked record := public.lock_training_enrollment_for_recorder(p_enrollment_id);
  checklist text[] := (locked.program).assessment_checklist;
  fail_reason text := case when p_result = 'failed' then nullif(btrim(p_failure_reason), '') end;
  new_id uuid := gen_random_uuid();
  created public.training_assessments;
begin
  if (locked.enrollment).status <> 'accepted' then
    raise exception 'An assessment can be recorded only for an accepted enrollment.' using errcode = '23514';
  end if;
  if public.training_enrollment_attended_days(p_enrollment_id) < (locked.program).min_training_days then
    raise exception 'The worker has not attended the required training days yet.' using errcode = '23514';
  end if;
  if p_supersedes_id is null and exists (select 1 from public.training_assessments a where a.enrollment_id = p_enrollment_id) then
    raise exception 'An assessment is already recorded. Record a correction instead.' using errcode = '23505';
  end if;
  if p_supersedes_id is not null and exists (select 1 from public.training_assessments n where n.supersedes_id = p_supersedes_id) then
    raise exception 'This record was already corrected.' using errcode = '23505';
  end if;
  if p_items_met is null or cardinality(p_items_met) <> cardinality(checklist) or array_position(p_items_met, null) is not null then
    raise exception 'Mark every checklist item as met or not met.' using errcode = '22023';
  end if;
  if p_result = 'passed' and false = any (p_items_met) then
    raise exception 'A pass needs every checklist item met.' using errcode = '23514';
  end if;
  if p_result = 'failed' and (fail_reason is null or char_length(fail_reason) not between 10 and 300) then
    raise exception 'Give a reason for the fail of 10 to 300 characters.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.training_write', new_id::text, true);
    insert into public.training_assessments (id, enrollment_id, checklist_snapshot, items_met, result, assessor_comment, failure_reason,
      assessed_by, assessor_role, assessor_designation_id, assessor_display_name, assessed_on, supersedes_id, correction_reason)
    values (new_id, p_enrollment_id, checklist, p_items_met, p_result, nullif(btrim(p_assessor_comment), ''), fail_reason,
      auth.uid(), locked.recorder_role, locked.designation_id, locked.display_name,
      (now() at time zone 'Asia/Manila')::date, p_supersedes_id, p_correction_reason)
    returning * into created;
  exception when unique_violation then
    raise exception 'An assessment is already recorded. Record a correction instead.' using errcode = '23505';
  end;
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

create or replace function public.record_training_assessment(
  p_enrollment_id uuid, p_items_met boolean[], p_result text, p_assessor_comment text default null,
  p_failure_reason text default null)
returns public.training_assessments
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.insert_training_assessment(p_enrollment_id, p_items_met, p_result, p_assessor_comment, null, null, p_failure_reason);
$$;

create or replace function public.correct_training_assessment(
  p_assessment_id uuid, p_items_met boolean[], p_result text, p_assessor_comment text, p_correction_reason text,
  p_failure_reason text default null)
returns public.training_assessments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous public.training_assessments;
  reason text := nullif(btrim(p_correction_reason), '');
begin
  select * into previous from public.training_assessments a where a.id = p_assessment_id;
  if previous.id is null then
    raise exception 'Only the shop owner or a designated trainer can record training.' using errcode = '42501';
  end if;
  if reason is null or char_length(reason) not between 10 and 300 then
    perform public.lock_training_enrollment_for_recorder(previous.enrollment_id);   -- authorise before revealing rules
    raise exception 'Give a correction reason of 10 to 300 characters.' using errcode = '23514';
  end if;
  return public.insert_training_assessment(previous.enrollment_id, p_items_met, p_result, p_assessor_comment, previous.id, reason,
                                           p_failure_reason);
end;
$$;

-- -------------------------------------------------------------
-- Reads (definer, authenticated). No contact or profile fields; names = trimmed full_name or a
-- role label; recorder names come from the evidence snapshot (D-18).
-- -------------------------------------------------------------
create or replace function public.training_roster_for_program(p_program_id uuid)
returns table (enrollment_id uuid, display_name text, enrollment_status text, accepted_at timestamptz,
               required_training_days integer, attended_training_days integer, has_recorded_attendance boolean,
               current_assessment_id uuid, current_assessment_result text, progress_status text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  recorder text := public.is_authorised_training_recorder(p_program_id);
begin
  if recorder is null then
    raise exception 'Training program not found.' using errcode = '42501';
  end if;
  return query
  select e.id, coalesce(nullif(btrim(pr.full_name), ''), 'Trainee'), e.status, e.accepted_at, p.min_training_days::integer,
         public.training_enrollment_attended_days(e.id),
         exists (select 1 from public.training_attendance_records r where r.enrollment_id = e.id),
         cur.id, cur.result, public.training_enrollment_progress_status_of(e.id)
  from public.training_enrollments e
  join public.training_programs p on p.id = e.program_id
  left join public.profiles pr on pr.id = e.worker_id
  left join lateral (select a.id, a.result from public.training_assessments a where a.enrollment_id = e.id
                     and not exists (select 1 from public.training_assessments n where n.supersedes_id = a.id)) cur on true
  where e.program_id = p_program_id and (recorder = 'owner' or e.status = 'accepted')
  order by e.invited_at, e.id;
end;
$$;

drop function if exists public.training_evidence_for_enrollment(uuid);   -- return shape gained failure_reason
create or replace function public.training_evidence_for_enrollment(p_enrollment_id uuid)
returns table (evidence_kind text, evidence_id uuid, supersedes_id uuid, is_current boolean, session_id uuid,
               session_date date, session_kind text, attendance_status text, progress_note text, checklist_snapshot text[],
               items_met boolean[], result text, assessor_comment text, failure_reason text, recorder_role text,
               recorded_by_display_name text, recorded_at timestamptz, correction_reason text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_read_training_evidence(p_enrollment_id) then
    raise exception 'Training enrollment not found.' using errcode = '42501';
  end if;
  return query
  select 'attendance'::text, r.id, r.supersedes_id,
         not exists (select 1 from public.training_attendance_records n where n.supersedes_id = r.id),
         r.session_id, r.session_date, s.session_kind, r.attendance_status, r.progress_note, null::text[], null::boolean[],
         null::text, null::text, null::text, r.recorder_role, r.recorder_display_name, r.recorded_at, r.correction_reason
  from public.training_attendance_records r join public.training_sessions s on s.id = r.session_id
  where r.enrollment_id = p_enrollment_id
  union all
  select 'assessment'::text, a.id, a.supersedes_id,
         not exists (select 1 from public.training_assessments n where n.supersedes_id = a.id),
         null::uuid, a.assessed_on, null::text, null::text, null::text, a.checklist_snapshot, a.items_met,
         a.result, a.assessor_comment, a.failure_reason, a.assessor_role, a.assessor_display_name, a.signed_off_at, a.correction_reason
  from public.training_assessments a
  where a.enrollment_id = p_enrollment_id
  order by 6, 17;
end;
$$;

create or replace function public.trainers_for_training_program(p_program_id uuid)
returns table (designation_id uuid, display_name text, designated_at timestamptz, revoked_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_read_training_program(p_program_id) then
    raise exception 'Training program not found.' using errcode = '42501';
  end if;
  return query
  select t.id, coalesce(nullif(btrim(pr.full_name), ''), 'Trainer'), t.designated_at, t.revoked_at
  from public.training_program_trainers t left join public.profiles pr on pr.id = t.trainer_id
  where t.program_id = p_program_id
  order by t.designated_at, t.id;
end;
$$;

revoke all on function public.lock_training_enrollment_for_recorder(uuid) from public, anon, authenticated, service_role;
revoke all on function public.insert_training_assessment(uuid, boolean[], text, text, uuid, text, text) from public, anon, authenticated, service_role;
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.record_training_attendance(uuid, uuid, text, text)',
    'public.correct_training_attendance(uuid, text, text, text)',
    'public.record_training_assessment(uuid, boolean[], text, text, text)',
    'public.correct_training_assessment(uuid, boolean[], text, text, text, text)',
    'public.training_roster_for_program(uuid)',
    'public.training_evidence_for_enrollment(uuid)',
    'public.trainers_for_training_program(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.trainers_for_training_program(uuid);
-- drop function if exists public.training_evidence_for_enrollment(uuid);
-- drop function if exists public.training_roster_for_program(uuid);
-- drop function if exists public.correct_training_assessment(uuid, boolean[], text, text, text, text);
-- drop function if exists public.record_training_assessment(uuid, boolean[], text, text, text);
-- drop function if exists public.insert_training_assessment(uuid, boolean[], text, text, uuid, text, text);
-- drop function if exists public.correct_training_attendance(uuid, text, text, text);
-- drop function if exists public.record_training_attendance(uuid, uuid, text, text);
-- drop function if exists public.lock_training_enrollment_for_recorder(uuid);
