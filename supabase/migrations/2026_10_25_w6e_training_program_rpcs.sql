-- =============================================================
-- WashLink W6e - training program RPCs: the only program / session write path and the
-- program state machine (spec D, A; D-4, D-16, D-19; W6 PLAN 3.5). Requires w4b, w6b, w6c, w6d.
-- Idempotent. Any caller other than the CURRENT owner of the program shop -> 42501
-- `Training program not found.` (no existence leak; super_admin included).
--   (none) -> draft      shop owner; own shop; <= 50 non-archived per shop
--   draft -> (deleted)   owning owner
--   draft -> open        verified shop; content; >= min_training_days distinct upcoming supervised
--                        dates, no past scheduled session; attestation 'w6_owner_v1'
--   open -> closed       owning owner (enrolled workers continue; evidence can still be recorded)
--   closed -> archived   owning owner; no invited enrollment and no unfinished accepted one
-- Lock order everywhere: training_programs row -> training_enrollments row -> evidence advisory.
-- There is NO fee argument anywhere (P28). Trainer designation RPCs: w6f (file size).
-- =============================================================

create or replace function public.lock_owned_training_program(p_program_id uuid)
returns public.training_programs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs;
begin
  select * into target from public.training_programs p where p.id = p_program_id for update;
  if not found or not public.is_current_training_program_owner(p_program_id) then
    raise exception 'Training program not found.' using errcode = '42501';
  end if;
  return target;
end;
$$;

create or replace function public.training_upcoming_supervised_days(p_program_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct s.session_date)::integer from public.training_sessions s
  where s.program_id = p_program_id and s.status = 'scheduled' and s.session_kind = 'supervised_training'
    and s.session_date >= (now() at time zone 'Asia/Manila')::date;
$$;

-- Stamps schedule_changed_at on the program (every session add / cancel).
create or replace function public.touch_training_schedule(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_flag text := coalesce(current_setting('washlink.training_write', true), '');
begin
  perform set_config('washlink.training_write', p_program_id::text, true);
  update public.training_programs set schedule_changed_at = clock_timestamp() where id = p_program_id;
  perform set_config('washlink.training_write', previous_flag, true);
end;
$$;

create or replace function public.create_training_program(p_shop_id uuid, p_title text)
returns public.training_programs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid := gen_random_uuid();
  shop_owner uuid;
  created public.training_programs;
begin
  select s.owner_id into shop_owner from public.shops s where s.id = p_shop_id;
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'owner' or shop_owner is distinct from auth.uid() then
    raise exception 'You can create training programs only for your own shop.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('training_programs:' || p_shop_id::text, 0));
  if (select count(*) from public.training_programs p where p.shop_id = p_shop_id and p.status <> 'archived') >= 50 then
    raise exception 'A shop can have at most 50 training programs that are not archived.' using errcode = '23514';
  end if;
  perform set_config('washlink.training_write', new_id::text, true);
  insert into public.training_programs (id, shop_id, owner_id, title, status_changed_at)
  values (new_id, p_shop_id, shop_owner, p_title, now())
  returning * into created;
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

create or replace function public.update_training_program_draft(
  p_program_id uuid, p_title text, p_objectives text, p_skills_to_learn text[], p_terms text,
  p_min_training_days integer, p_assessment_checklist text[], p_training_pay_amount numeric,
  p_training_pay_currency text, p_training_pay_period text, p_training_pay_details text,
  p_reimbursement_details text, p_expected_updated_at timestamptz)
returns public.training_programs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs := public.lock_owned_training_program(p_program_id);
begin
  if target.status <> 'draft' then
    raise exception 'An open training program cannot be edited.' using errcode = '42501';
  end if;
  if target.updated_at is distinct from p_expected_updated_at then
    raise exception 'This training program changed. Refresh and try again.' using errcode = '55000';
  end if;
  perform set_config('washlink.training_write', target.id::text, true);
  update public.training_programs
  set title = p_title, objectives = p_objectives, skills_to_learn = coalesce(p_skills_to_learn, '{}'),
      terms = p_terms, min_training_days = coalesce(p_min_training_days, target.min_training_days),
      assessment_checklist = coalesce(p_assessment_checklist, '{}'),
      training_pay_amount = p_training_pay_amount, training_pay_currency = p_training_pay_currency,
      training_pay_period = p_training_pay_period, training_pay_details = p_training_pay_details,
      reimbursement_details = p_reimbursement_details
  where id = target.id
  returning * into target;
  perform set_config('washlink.training_write', '', true);
  return target;
end;
$$;

create or replace function public.delete_training_program_draft(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs := public.lock_owned_training_program(p_program_id);
begin
  if target.status <> 'draft' then
    raise exception 'Only draft training programs can be deleted.' using errcode = '42501';
  end if;
  perform set_config('washlink.training_write', target.id::text, true);
  delete from public.training_programs where id = target.id;
  perform set_config('washlink.training_write', '', true);
end;
$$;

create or replace function public.add_training_session(
  p_program_id uuid, p_session_date date, p_session_kind text,
  p_start_time time default null, p_end_time time default null, p_location text default null)
returns public.training_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs := public.lock_owned_training_program(p_program_id);
  manila_today date := (now() at time zone 'Asia/Manila')::date;
  new_id uuid := gen_random_uuid();
  created public.training_sessions;
begin
  if target.status not in ('draft', 'open') then
    raise exception 'Sessions can be added only while the program is a draft or open.' using errcode = '23514';
  end if;
  if p_session_date is null or p_session_date < manila_today or p_session_date > manila_today + 365 then
    raise exception 'Choose a session date from today up to one year ahead.' using errcode = '23514';
  end if;
  if (select count(*) from public.training_sessions s where s.program_id = target.id and s.status = 'scheduled') >= 30 then
    raise exception 'A training program can have at most 30 scheduled sessions.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.training_write', new_id::text, true);
    insert into public.training_sessions (id, program_id, session_date, start_time, end_time, location, session_kind)
    values (new_id, target.id, p_session_date, p_start_time, p_end_time, nullif(btrim(p_location), ''), p_session_kind)
    returning * into created;
  exception when unique_violation then
    raise exception 'A session is already scheduled on this date.' using errcode = '23505';
  end;
  perform public.touch_training_schedule(target.id);
  perform set_config('washlink.training_write', '', true);
  return created;
end;
$$;

create or replace function public.cancel_training_session(p_session_id uuid, p_reason text)
returns public.training_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  program_ref uuid := (select s.program_id from public.training_sessions s where s.id = p_session_id);
  target public.training_programs := public.lock_owned_training_program(program_ref);
  session_row public.training_sessions;
  reason text := nullif(btrim(p_reason), '');
begin
  select * into session_row from public.training_sessions s where s.id = p_session_id for update;
  if target.status not in ('draft', 'open') or session_row.status <> 'scheduled' then
    raise exception 'This session cannot be cancelled.' using errcode = '23514';
  end if;
  if exists (select 1 from public.training_attendance_records r where r.session_id = p_session_id) then
    raise exception 'Attendance was recorded for this session; it cannot be cancelled.' using errcode = '42501';
  end if;
  if reason is null or char_length(reason) not between 10 and 300 then
    raise exception 'Give a reason of 10 to 300 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.training_write', session_row.id::text, true);
  update public.training_sessions
  set status = 'cancelled', cancel_reason = reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = session_row.id returning * into session_row;
  perform public.touch_training_schedule(target.id);
  perform set_config('washlink.training_write', '', true);
  return session_row;
end;
$$;

create or replace function public.delete_training_session_draft(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  program_ref uuid := (select s.program_id from public.training_sessions s where s.id = p_session_id);
  target public.training_programs := public.lock_owned_training_program(program_ref);
begin
  if target.status <> 'draft' then
    raise exception 'Sessions can be deleted only while the program is a draft. Cancel it instead.' using errcode = '42501';
  end if;
  perform set_config('washlink.training_write', p_session_id::text, true);
  delete from public.training_sessions where id = p_session_id;
  perform public.touch_training_schedule(target.id);
  perform set_config('washlink.training_write', '', true);
end;
$$;

create or replace function public.transition_training_program(
  p_program_id uuid, p_from_status text, p_to_status text, p_owner_attestation_version text default null)
returns public.training_programs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.training_programs := public.lock_owned_training_program(p_program_id);
  pair text := coalesce(p_from_status, '') || '>' || coalesce(p_to_status, '');
begin
  if target.status is distinct from p_from_status then
    raise exception 'This training program changed. Refresh and try again.' using errcode = '55000';
  end if;
  if pair not in ('draft>open', 'open>closed', 'closed>archived') then
    raise exception 'This training program status change is not allowed.' using errcode = '42501';
  end if;
  if pair = 'draft>open' then
    if not public.is_verified_shop_owner(target.shop_id) then
      raise exception 'Only a verified shop can open training programs.' using errcode = '42501';
    end if;
    if target.objectives is null or target.terms is null or cardinality(target.assessment_checklist) = 0 then
      raise exception 'Add objectives, terms and at least one checklist item before opening.' using errcode = '23514';
    end if;
    if public.training_upcoming_supervised_days(target.id) < target.min_training_days
       or exists (select 1 from public.training_sessions s where s.program_id = target.id and s.status = 'scheduled'
                  and s.session_date < (now() at time zone 'Asia/Manila')::date) then
      raise exception 'Schedule at least % upcoming supervised training days (and no past sessions) before opening.',
        target.min_training_days using errcode = '23514';
    end if;
    if p_owner_attestation_version is distinct from 'w6_owner_v1' then
      raise exception 'Confirm the free-training statement before opening.' using errcode = '23514';
    end if;
  elsif pair = 'closed>archived' and exists (
    select 1 from public.training_enrollments e
    where e.program_id = target.id
      and (e.status = 'invited'
           or (e.status = 'accepted'
               and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment')))) then
    raise exception 'Training is still in progress in this program.' using errcode = '23514';
  end if;
  perform set_config('washlink.training_write', target.id::text, true);
  update public.training_programs
  set status = p_to_status, status_changed_at = now(),
      opened_at = case when pair = 'draft>open' then now() else opened_at end,
      owner_attestation_version = case when pair = 'draft>open' then 'w6_owner_v1' else owner_attestation_version end,
      owner_attested_at = case when pair = 'draft>open' then now() else owner_attested_at end
  where id = target.id returning * into target;
  perform set_config('washlink.training_write', '', true);
  return target;
end;
$$;

revoke all on function public.lock_owned_training_program(uuid) from public, anon, authenticated, service_role;
revoke all on function public.training_upcoming_supervised_days(uuid) from public, anon, authenticated, service_role;
revoke all on function public.touch_training_schedule(uuid) from public, anon, authenticated, service_role;
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.create_training_program(uuid, text)',
    'public.update_training_program_draft(uuid, text, text, text[], text, integer, text[], numeric, text, text, text, text, timestamptz)',
    'public.delete_training_program_draft(uuid)',
    'public.add_training_session(uuid, date, text, time, time, text)',
    'public.cancel_training_session(uuid, text)',
    'public.delete_training_session_draft(uuid)',
    'public.transition_training_program(uuid, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.transition_training_program(uuid, text, text, text);
-- drop function if exists public.delete_training_session_draft(uuid);
-- drop function if exists public.cancel_training_session(uuid, text);
-- drop function if exists public.add_training_session(uuid, date, text, time, time, text);
-- drop function if exists public.delete_training_program_draft(uuid);
-- drop function if exists public.update_training_program_draft(uuid, text, text, text[], text, integer, text[], numeric, text, text, text, text, timestamptz);
-- drop function if exists public.create_training_program(uuid, text);
-- drop function if exists public.touch_training_schedule(uuid);
-- drop function if exists public.training_upcoming_supervised_days(uuid);
-- drop function if exists public.lock_owned_training_program(uuid);
