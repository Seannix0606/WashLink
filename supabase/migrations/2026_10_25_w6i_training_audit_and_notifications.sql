-- =============================================================
-- WashLink W6i - training audit producers and notifications (spec I; W3 pattern; W6 PLAN 3.9, P29).
-- Requires w3b, w3c, w3d, w6b..w6g. Idempotent.
-- Audit payloads carry ids, status words, booleans and counts only: never ISO dates, notes,
-- comments, reasons, terms, pay or names. Notification texts carry no dates, pay, terms, notes,
-- comments, reasons or names; program titles / shop names go through notification_safe_label.
-- Keys embed the audit event id: one notification per recipient per event. A notification
-- problem never fails the action; an audit problem does (W3 rule, R6).
-- Cascade / trusted deletes and D-18 shop removal are audited and notify nobody (W6-L5).
-- =============================================================

create or replace function public.training_labels(p_program_id uuid, p_title_fallback text, p_shop_fallback text,
                                                  out program_label text, out shop_label text, out owner_recipient uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.notification_safe_label(coalesce(p.title, p_title_fallback), 'A training program'),
         public.notification_safe_label(coalesce(s.name, p_shop_fallback), 'The shop'),
         case when s.owner_id = p.owner_id then s.owner_id end
  from (select 1) one
  left join public.training_programs p on p.id = p_program_id
  left join public.shops s on s.id = p.shop_id;
$$;

create or replace function public.training_programs_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
  changed_by text;
begin
  if tg_op = 'DELETE' then
    changed_by := case when old.shop_id is not null and write_flag = 'shop_removed:' || old.shop_id::text then 'shop_removed'
                       when write_flag = old.id::text and auth.uid() is not null then 'owner' else 'trusted_session' end;
    perform public.record_workforce_audit_event('training_program.deleted', 'training_program', old.id, old.owner_id,
      jsonb_build_object('training_program_id', old.id, 'shop_id', old.shop_id, 'from_status', old.status, 'deleted_by', changed_by));
    return null;
  end if;
  changed_by := case when write_flag = new.id::text and auth.uid() is not null then 'owner' else 'trusted_session' end;
  if tg_op = 'INSERT' then
    perform public.record_workforce_audit_event('training_program.created', 'training_program', new.id, new.owner_id,
      jsonb_build_object('training_program_id', new.id, 'shop_id', new.shop_id, 'to_status', new.status, 'changed_by', changed_by));
  elsif new.status is distinct from old.status then
    perform public.record_workforce_audit_event('training_program.status_changed', 'training_program', new.id, new.owner_id,
      jsonb_build_object('training_program_id', new.id, 'shop_id', new.shop_id, 'from_status', old.status,
                         'to_status', new.status, 'changed_by', changed_by));
  end if;
  return null;
end;
$$;

create or replace function public.training_sessions_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
  row_data public.training_sessions := case when tg_op = 'DELETE' then old else new end;
  program public.training_programs;
  labels record;
  changed_by text;
  event_id bigint;
  enrollee record;
begin
  select * into program from public.training_programs p where p.id = row_data.program_id;
  if tg_op = 'DELETE' then
    changed_by := case when program.id is null then 'program_removed'
                       when write_flag = old.id::text and auth.uid() is not null then 'owner' else 'trusted_session' end;
    perform public.record_workforce_audit_event('training_session.deleted', 'training_program', old.program_id, program.owner_id,
      jsonb_build_object('training_program_id', old.program_id, 'session_id', old.id, 'session_kind', old.session_kind,
                         'deleted_by', changed_by));
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  changed_by := case when write_flag = new.id::text and auth.uid() is not null then 'owner' else 'trusted_session' end;
  event_id := public.record_workforce_audit_event(
    case when tg_op = 'INSERT' then 'training_session.added' else 'training_session.cancelled' end,
    'training_program', new.program_id, program.owner_id,
    jsonb_build_object('training_program_id', new.program_id, 'session_id', new.id, 'session_kind', new.session_kind,
                       'to_status', new.status, 'changed_by', changed_by));
  if program.status = 'open' and changed_by = 'owner' then
    labels := public.training_labels(program.id, null, null);
    for enrollee in
      select e.id, e.worker_id from public.training_enrollments e
      where e.program_id = program.id and e.status in ('invited', 'accepted')
    loop
      perform public.enqueue_notification_safely(enrollee.worker_id, 'training.schedule_changed', 'Training schedule changed',
        format('%s at %s has a schedule change. Check the dates.', labels.program_label, labels.shop_label),
        format('training_schedule:%s:%s', new.id, event_id), 'training_enrollment', enrollee.id);
    end loop;
  end if;
  return null;
end;
$$;

create or replace function public.training_program_trainers_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
  row_data public.training_program_trainers := case when tg_op = 'DELETE' then old else new end;
  labels record := public.training_labels(row_data.program_id, null, null);
  changed_by text;
  event_id bigint;
begin
  if tg_op = 'DELETE' then
    changed_by := case when not exists (select 1 from public.training_programs p where p.id = old.program_id) then 'program_removed'
                       when not exists (select 1 from public.profiles pr where pr.id = old.trainer_id) then 'trainer_account_deleted'
                       else 'trusted_session' end;
    perform public.record_workforce_audit_event('training_trainer.deleted', 'training_program', old.program_id, old.trainer_id,
      jsonb_build_object('training_program_id', old.program_id, 'deleted_by', changed_by));
    return null;
  end if;
  if tg_op = 'UPDATE' and not (old.revoked_at is null and new.revoked_at is not null) then
    return null;   -- roster row removed (FK set null): authority already ended, nothing to tell
  end if;
  changed_by := case when write_flag = new.id::text and auth.uid() is not null then 'owner'
                     when write_flag = 'roster_unlinked:' || new.roster_worker_id::text then 'roster_unlinked'   -- w6f
                     else 'trusted_session' end;
  event_id := public.record_workforce_audit_event(
    case when tg_op = 'INSERT' then 'training_trainer.designated' else 'training_trainer.revoked' end,
    'training_program', new.program_id, new.trainer_id,
    jsonb_build_object('training_program_id', new.program_id, 'changed_by', changed_by));
  if changed_by in ('owner', 'roster_unlinked') then
    perform public.enqueue_notification_safely(new.trainer_id, 'training.trainer_role', 'Trainer role',
      format(case when tg_op = 'INSERT' then 'You are a trainer for %s.' else 'You are no longer a trainer for %s.' end,
             labels.program_label),
      format('training_trainer:%s:%s', new.id, event_id), 'training_program', new.program_id);
  end if;
  return null;
end;
$$;

create or replace function public.training_enrollments_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
  row_data public.training_enrollments := case when tg_op = 'DELETE' then old else new end;
  labels record := public.training_labels(row_data.program_id, row_data.program_title_snapshot, row_data.shop_name_snapshot);
  changed_by text;
  event_id bigint;
begin
  if tg_op = 'DELETE' then
    changed_by := case when not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id)
                       then 'worker_profile_deleted' else 'trusted_session' end;
    perform public.record_workforce_audit_event('training_enrollment.deleted', 'training_enrollment', old.id, old.worker_id,
      jsonb_build_object('training_program_id', old.program_id, 'enrollment_id', old.id, 'from_status', old.status,
                         'deleted_by', changed_by));
    return null;
  end if;
  if tg_op = 'UPDATE' and old.shop_id is not null and new.shop_id is null then
    perform public.record_workforce_audit_event('training_enrollment.shop_removed', 'training_enrollment', new.id, new.worker_id,
      jsonb_build_object('training_program_id', new.program_id, 'enrollment_id', new.id, 'from_status', old.status,
                         'changed_by', 'shop_removed'));
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  changed_by := case when write_flag = new.id::text and auth.uid() = new.worker_id then 'worker'
                     when write_flag = new.id::text and auth.uid() = new.owner_id then 'owner' else 'trusted_session' end;
  event_id := public.record_workforce_audit_event(
    case when tg_op = 'INSERT' then 'training_enrollment.invited' else 'training_enrollment.status_changed' end,
    'training_enrollment', new.id, new.worker_id,
    jsonb_build_object('training_program_id', new.program_id, 'shop_id', new.shop_id, 'enrollment_id', new.id,
                       'from_status', case when tg_op = 'UPDATE' then old.status end, 'to_status', new.status,
                       'changed_by', changed_by));
  if tg_op = 'INSERT' and changed_by = 'owner' then
    perform public.enqueue_notification_safely(new.worker_id, 'training.invited', 'Training invitation',
      format('%s invited you to %s. Read the free-training notice before you decide.', labels.shop_label, labels.program_label),
      format('training_invite:%s:%s', new.id, event_id), 'training_enrollment', new.id);
  elsif changed_by = 'worker' and labels.owner_recipient is not null and labels.owner_recipient = new.owner_id then
    perform public.enqueue_notification_safely(labels.owner_recipient, 'training.response', 'Training response',
      format('A worker %s %s.', case new.status when 'accepted' then 'accepted' when 'declined' then 'declined' else 'left' end,
             labels.program_label),
      format('training_response:%s:%s', new.id, event_id), 'training_enrollment', new.id);
  elsif changed_by = 'owner' and new.status = 'cancelled' then
    perform public.enqueue_notification_safely(new.worker_id, 'training.cancelled', 'Training cancelled',
      format('%s cancelled your enrollment in %s.', labels.shop_label, labels.program_label),
      format('training_cancel:%s:%s', new.id, event_id), 'training_enrollment', new.id);
  end if;
  return null;
end;
$$;

-- Attendance and assessments (one function; tg_table_name tells them apart).
create or replace function public.training_evidence_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  kind text := case tg_table_name when 'training_attendance_records' then 'training_attendance' else 'training_assessment' end;
  enrollment public.training_enrollments;
  labels record;
  is_correction boolean := (row_data ->> 'supersedes_id') is not null;
  payload jsonb;
  event_id bigint;
begin
  select * into enrollment from public.training_enrollments e where e.id = (row_data ->> 'enrollment_id')::uuid;
  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event(kind || '.deleted', 'training_enrollment', (row_data ->> 'enrollment_id')::uuid,
      enrollment.worker_id,
      jsonb_build_object('enrollment_id', row_data ->> 'enrollment_id', 'is_correction', is_correction,
                         'deleted_by', case when enrollment.id is null then 'enrollment_removed' else 'trusted_session' end));
    return null;
  end if;
  labels := public.training_labels(enrollment.program_id, enrollment.program_title_snapshot, enrollment.shop_name_snapshot);
  payload := jsonb_build_object('training_program_id', enrollment.program_id, 'enrollment_id', enrollment.id,
    'recorder_role', coalesce(row_data ->> 'recorder_role', row_data ->> 'assessor_role'), 'is_correction', is_correction,
    'attended_training_days', public.training_enrollment_attended_days(enrollment.id),
    'required_training_days', (select p.min_training_days from public.training_programs p where p.id = enrollment.program_id));
  if kind = 'training_attendance' then
    payload := payload || jsonb_build_object('session_id', row_data ->> 'session_id', 'attendance_status', row_data ->> 'attendance_status',
      'session_kind', (select s.session_kind from public.training_sessions s where s.id = (row_data ->> 'session_id')::uuid));
  else
    payload := payload || jsonb_build_object('result', row_data ->> 'result',
      'items_met_count', (select count(*) from jsonb_array_elements(row_data -> 'items_met') item where item = 'true'::jsonb),
      'items_total', jsonb_array_length(row_data -> 'items_met'));
  end if;
  event_id := public.record_workforce_audit_event(kind || case when is_correction then '.corrected' else '.recorded' end,
    'training_enrollment', enrollment.id, enrollment.worker_id, payload);
  if kind = 'training_attendance' and is_correction then
    perform public.enqueue_notification_safely(enrollment.worker_id, 'training.record_corrected', 'Training record corrected',
      format('A training record for %s was corrected.', labels.program_label),
      format('training_attendance:%s:%s', row_data ->> 'id', event_id), 'training_enrollment', enrollment.id);
  elsif kind = 'training_assessment' then
    perform public.enqueue_notification_safely(enrollment.worker_id, 'training.assessment', 'Training assessment',
      format('%s: assessment recorded, %s', labels.program_label,
             case when row_data ->> 'result' <> 'passed' then 'Not passed.'
                  when public.training_enrollment_is_completed(enrollment.id) then 'Passed. Training completed.'
                  else 'Passed.' end),
      format('training_assessment:%s:%s', row_data ->> 'id', event_id), 'training_enrollment', enrollment.id);
    if row_data ->> 'assessor_role' = 'trainer' and labels.owner_recipient is not null
       and labels.owner_recipient = enrollment.owner_id then
      perform public.enqueue_notification_safely(labels.owner_recipient, 'training.assessment', 'Training assessment',
        format('A trainer recorded an assessment for %s.', labels.program_label),
        format('training_assessment:%s:%s', row_data ->> 'id', event_id), 'training_enrollment', enrollment.id);
    end if;
  end if;
  return null;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['training_programs', 'training_programs_audit'],
    array['training_sessions', 'training_sessions_audit'],
    array['training_program_trainers', 'training_program_trainers_audit'],
    array['training_enrollments', 'training_enrollments_audit'],
    array['training_attendance_records', 'training_evidence_audit'],
    array['training_assessments', 'training_evidence_audit']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[1] || '_audit', item[1]);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.%I()',
                   item[1] || '_audit', item[1], item[2]);
  end loop;
end $$;

revoke all on function public.training_labels(uuid, text, text) from public, anon, authenticated, service_role;

-- W3a pin assertion repeated (D-10 row 17).
do $$
declare
  unpinned text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into unpinned
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname in ('public', 'washlink_private')
    and not (n.nspname = 'public' and p.proname = 'handle_new_user' and p.pronargs = 0)
    and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c
                    where c like 'search_path=%'
                      and 'pg_temp' = any (string_to_array(replace(substr(c, 13), ' ', ''), ',')));
  if unpinned is not null then
    raise exception 'W6i: SECURITY DEFINER functions without pg_temp in search_path: % (pin them; D-10 row 17)', unpinned;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- Audit rows and notifications already written stay (append-only, P11).
-- -------------------------------------------------------------
-- drop trigger if exists training_assessments_audit on public.training_assessments;
-- drop trigger if exists training_attendance_records_audit on public.training_attendance_records;
-- drop trigger if exists training_enrollments_audit on public.training_enrollments;
-- drop trigger if exists training_program_trainers_audit on public.training_program_trainers;
-- drop trigger if exists training_sessions_audit on public.training_sessions;
-- drop trigger if exists training_programs_audit on public.training_programs;
-- drop function if exists public.training_evidence_audit();
-- drop function if exists public.training_enrollments_audit();
-- drop function if exists public.training_program_trainers_audit();
-- drop function if exists public.training_sessions_audit();
-- drop function if exists public.training_programs_audit();
-- drop function if exists public.training_labels(uuid, text, text);
