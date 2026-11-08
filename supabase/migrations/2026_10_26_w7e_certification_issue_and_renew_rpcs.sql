-- =============================================================
-- WashLink W7e - issue, renew, re-assess and the per-shop validity setting (spec D, A; D-5, D-22;
-- W7 PLAN 3.5, P30, P32, P35). Requires w4b, w6d, w6g, w7b..w7d. Idempotent.
-- GLOBAL LOCK ORDER (issue / renew): shops row FOR SHARE -> training_programs FOR SHARE ->
--   training_enrollments FOR SHARE -> advisory training_evidence:<enrollment> (same key as the W6
--   recorders, so an evidence correction and an issue serialise) -> advisory certifications:<worker>
--   -> certifications row FOR UPDATE. Completion is re-read AFTER the locks (W6: not monotonic).
-- No RPC takes a date, a validity or any fee / charge parameter (P32, P35).
-- =============================================================

-- Takes the issue / renew locks in the global order; returns nothing (callers re-read rows).
create or replace function public.lock_certification_training(p_enrollment_id uuid, p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  enrollment public.training_enrollments;
begin
  select * into enrollment from public.training_enrollments e where e.id = p_enrollment_id;
  perform 1 from public.shops s where s.id = enrollment.shop_id for share;
  perform 1 from public.training_programs p where p.id = enrollment.program_id for share;
  perform 1 from public.training_enrollments e where e.id = p_enrollment_id for share;
  perform pg_advisory_xact_lock(hashtextextended('training_evidence:' || p_enrollment_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('certifications:' || coalesce(p_worker_id, enrollment.worker_id)::text, 0));
end;
$$;

-- Inserts a certification and its first status event under the flag (shared by issue and renew).
create or replace function public.insert_certification(
  p_enrollment public.training_enrollments, p_program public.training_programs, p_assessment public.training_assessments,
  p_renews public.certifications, p_reassessment_id uuid, p_evidence jsonb)
returns public.certifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid := gen_random_uuid();
  verification record := public.certification_shop_verification_snapshot(p_enrollment.shop_id);
  approver_name text := public.certification_actor_display_name(auth.uid(), 'Shop owner');
  shop_name text := (select s.name from public.shops s where s.id = p_enrollment.shop_id);
  created public.certifications;
begin
  -- Review polish: a legacy 'approved' row without a recorded reviewer / time is not a verification (23514, not 23502).
  if verification.verification_status is distinct from 'approved' or verification.verified_by is null
     or verification.verified_at is null then
    raise exception 'Only a verified shop can issue certifications.' using errcode = '23514';
  end if;
  perform set_config('washlink.certification_write', new_id::text, true);
  insert into public.certifications (id, worker_id, enrollment_id, program_id, assessment_id, renews_certification_id, reassessment_id,
    shop_id, owner_id, shop_name_snapshot, program_title_snapshot, certification_title, approved_by, approved_by_role,
    approver_display_name, assessor_id, assessor_role, assessor_display_name, attended_training_days, required_training_days,
    issuer_attestation_version, expires_at, shop_verification_status_at_issue, shop_verified_by_at_issue, shop_verified_at_at_issue,
    shop_verification_event_id, evidence_snapshot)
  values (new_id, p_enrollment.worker_id, p_enrollment.id, p_program.id, p_assessment.id, p_renews.id, p_reassessment_id,
    p_enrollment.shop_id, auth.uid(), left(coalesce(shop_name, p_enrollment.shop_name_snapshot), 200), left(p_program.title, 160),
    left(p_program.title, 160), auth.uid(), 'owner', approver_name, p_assessment.assessed_by, p_assessment.assessor_role,
    p_assessment.assessor_display_name, public.training_enrollment_attended_days(p_enrollment.id),
    greatest(3, p_program.min_training_days), public.certification_issuer_attestation_version(), 'infinity',
    verification.verification_status, verification.verified_by, verification.verified_at, verification.verification_event_id, p_evidence)
  returning * into created;
  insert into public.certification_status_events (certification_id, event, from_status, to_status, actor_display_name)
  values (new_id, case when p_renews.id is null then 'issued' else 'renewed' end, null, 'active', approver_name);
  perform set_config('washlink.certification_write', '', true);
  return created;
end;
$$;

create or replace function public.issue_certification(
  p_enrollment_id uuid, p_expected_assessment_id uuid, p_issuer_attestation_version text)
returns public.certifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  enrollment public.training_enrollments;
  program public.training_programs;
  assessment public.training_assessments;
  current_assessment uuid;
  no_renewal public.certifications;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'owner' then
    raise exception 'Only the shop owner can issue certifications.' using errcode = '42501';
  end if;
  -- Cheap unlocked pre-check: a foreign caller never takes the share / advisory locks (re-checked after them).
  if not exists (select 1 from public.training_enrollments e where e.id = p_enrollment_id and e.owner_id = auth.uid()
                 and public.is_current_certification_shop_owner(e.shop_id)) then
    raise exception 'Training enrollment not found.' using errcode = '42501';
  end if;
  perform public.lock_certification_training(p_enrollment_id, null);
  select * into enrollment from public.training_enrollments e where e.id = p_enrollment_id;
  if enrollment.id is null or enrollment.owner_id is distinct from auth.uid()
     or not public.is_current_certification_shop_owner(enrollment.shop_id) then
    raise exception 'Training enrollment not found.' using errcode = '42501';
  end if;
  select * into program from public.training_programs p where p.id = enrollment.program_id;
  if program.shop_id is distinct from enrollment.shop_id then
    raise exception 'Training enrollment not found.' using errcode = '42501';
  end if;
  if not public.is_verified_shop_owner(enrollment.shop_id) then
    raise exception 'Only a verified shop can issue certifications.' using errcode = '23514';
  end if;
  if p_issuer_attestation_version is distinct from public.certification_issuer_attestation_version() then
    raise exception 'Confirm the certification statement before issuing.' using errcode = '23514';
  end if;
  current_assessment := public.current_training_assessment_id(enrollment.id);
  select * into assessment from public.training_assessments a where a.id = current_assessment;
  if enrollment.status <> 'accepted' or not public.training_enrollment_is_completed(enrollment.id)
     or public.training_enrollment_attended_days(enrollment.id) < greatest(3, program.min_training_days)
     or assessment.result is distinct from 'passed' then
    raise exception 'This training is not completed. A certification needs at least 3 attended training days and a passed assessment.'
      using errcode = '23514';
  end if;
  if current_assessment is distinct from p_expected_assessment_id then
    raise exception 'The training record changed. Review it again.' using errcode = '55000';
  end if;
  if exists (select 1 from public.certifications c where c.enrollment_id = enrollment.id and c.renews_certification_id is null) then
    raise exception 'A certification was already issued for this training.' using errcode = '23505';
  end if;
  if public.worker_has_live_certification_for_program(enrollment.worker_id, program.id) then
    raise exception 'This worker already holds a current certification from this program.' using errcode = '23505';
  end if;
  return public.insert_certification(enrollment, program, assessment, no_renewal, null,
                                     public.certification_evidence_snapshot(enrollment.id, assessment.id));
end;
$$;

create or replace function public.set_shop_certification_validity(p_shop_id uuid, p_validity_months integer)
returns public.shop_certification_policies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.shop_certification_policies;
begin
  if not public.is_current_certification_shop_owner(p_shop_id) then
    raise exception 'Shop not found.' using errcode = '42501';
  end if;
  if p_validity_months is null or p_validity_months not between 1 and 36 then
    raise exception 'Validity must be 1 to 36 months.' using errcode = '23514';
  end if;
  perform 1 from public.shops s where s.id = p_shop_id for share;
  perform set_config('washlink.certification_write', p_shop_id::text, true);
  insert into public.shop_certification_policies (shop_id, validity_months) values (p_shop_id, p_validity_months)
  on conflict (shop_id) do update set validity_months = excluded.validity_months
  returning * into saved;
  perform set_config('washlink.certification_write', '', true);
  return saved;
end;
$$;

create or replace function public.record_certification_reassessment(
  p_certification_id uuid, p_items_met boolean[], p_result text, p_assessor_comment text default null,
  p_failure_reason text default null)
returns public.certification_reassessments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.certifications := (select c from public.certifications c where c.id = p_certification_id);
  locked record := public.lock_training_enrollment_for_recorder(target.enrollment_id);
  checklist text[] := (locked.program).assessment_checklist;
  fail_reason text := case when p_result = 'failed' then nullif(btrim(p_failure_reason), '') end;
  new_id uuid := gen_random_uuid();
  created public.certification_reassessments;
begin
  perform pg_advisory_xact_lock(hashtextextended('certifications:' || target.worker_id::text, 0));
  select * into target from public.certifications c where c.id = p_certification_id for update;
  if target.status <> 'active' then
    raise exception 'This certification cannot be renewed.' using errcode = '23514';
  end if;
  if not public.certification_renewal_window_open(target.expires_at, now()) then
    raise exception 'Re-assessment opens 60 days before expiry and closes 90 days after it.' using errcode = '23514';
  end if;
  if p_result is null or p_result not in ('passed', 'failed') then
    raise exception 'Choose passed or failed.' using errcode = '22023';
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
  perform set_config('washlink.certification_write', new_id::text, true);
  insert into public.certification_reassessments (id, certification_id, checklist_snapshot, items_met, result, failure_reason,
    assessor_comment, assessed_by, assessor_role, assessor_designation_id, assessor_display_name, assessed_on)
  values (new_id, target.id, checklist, p_items_met, p_result, fail_reason, p_assessor_comment, auth.uid(), locked.recorder_role,
    locked.designation_id, locked.display_name, (now() at time zone 'Asia/Manila')::date)
  returning * into created;
  perform set_config('washlink.certification_write', '', true);
  return created;
end;
$$;

create or replace function public.renew_certification(
  p_certification_id uuid, p_reassessment_id uuid, p_issuer_attestation_version text)
returns public.certifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous public.certifications := (select c from public.certifications c where c.id = p_certification_id);
  enrollment public.training_enrollments;
  program public.training_programs;
  assessment public.training_assessments;
  latest public.certification_reassessments;
  renewed public.certifications;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'owner' then
    raise exception 'Only the shop owner can issue certifications.' using errcode = '42501';
  end if;
  if previous.id is null or previous.owner_id is distinct from auth.uid()
     or not public.is_current_certification_shop_owner(previous.shop_id) then
    raise exception 'Certification not found.' using errcode = '42501';   -- unlocked pre-check; re-checked below
  end if;
  perform public.lock_certification_training(previous.enrollment_id, previous.worker_id);
  select * into previous from public.certifications c where c.id = p_certification_id for update;
  if previous.id is null or previous.owner_id is distinct from auth.uid()
     or not public.is_current_certification_shop_owner(previous.shop_id) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  if not public.is_verified_shop_owner(previous.shop_id) then
    raise exception 'Only a verified shop can issue certifications.' using errcode = '23514';
  end if;
  if p_issuer_attestation_version is distinct from public.certification_issuer_attestation_version() then
    raise exception 'Confirm the certification statement before issuing.' using errcode = '23514';
  end if;
  if previous.status <> 'active' then
    raise exception 'This certification cannot be renewed.' using errcode = '23514';
  end if;
  if not public.certification_renewal_window_open(previous.expires_at, now()) then
    raise exception 'Re-assessment opens 60 days before expiry and closes 90 days after it.' using errcode = '23514';
  end if;
  select * into latest from public.certification_reassessments r where r.certification_id = previous.id
  order by r.recorded_at desc, r.id desc limit 1;
  if latest.id is distinct from p_reassessment_id then
    raise exception 'The training record changed. Review it again.' using errcode = '55000';
  end if;
  if latest.result <> 'passed' or latest.assessed_on < (now() at time zone 'Asia/Manila')::date - 30
     or exists (select 1 from public.certifications c where c.reassessment_id = latest.id) then
    raise exception 'Record a passed re-assessment first.' using errcode = '23514';
  end if;
  if not public.training_enrollment_is_completed(previous.enrollment_id) then
    raise exception 'The training record no longer shows completion.' using errcode = '23514';
  end if;
  select * into enrollment from public.training_enrollments e where e.id = previous.enrollment_id;
  select * into program from public.training_programs p where p.id = previous.program_id;
  select * into assessment from public.training_assessments a where a.id = previous.assessment_id;
  perform set_config('washlink.certification_write', previous.id::text, true);
  update public.certifications set status = 'superseded' where id = previous.id;
  insert into public.certification_status_events (certification_id, event, from_status, to_status, actor_display_name)
  values (previous.id, 'superseded', 'active', 'superseded', public.certification_actor_display_name(auth.uid(), 'Shop owner'));
  renewed := public.insert_certification(enrollment, program, assessment, previous, latest.id,
    public.certification_evidence_snapshot(enrollment.id, assessment.id)
      || jsonb_build_object('renews_certification_id', previous.id, 'reassessment_id', latest.id, 'reassessed_on', latest.assessed_on,
                            'reassessor_role', latest.assessor_role, 'reassessor_display_name', latest.assessor_display_name,
                            'reassessment_items_met', to_jsonb(latest.items_met)));
  return renewed;
end;
$$;

revoke all on function public.lock_certification_training(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.insert_certification(public.training_enrollments, public.training_programs, public.training_assessments,
  public.certifications, uuid, jsonb) from public, anon, authenticated, service_role;
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.issue_certification(uuid, uuid, text)',
    'public.set_shop_certification_validity(uuid, integer)',
    'public.record_certification_reassessment(uuid, boolean[], text, text, text)',
    'public.renew_certification(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a)
-- -------------------------------------------------------------
-- drop function if exists public.renew_certification(uuid, uuid, text);
-- drop function if exists public.record_certification_reassessment(uuid, boolean[], text, text, text);
-- drop function if exists public.set_shop_certification_validity(uuid, integer);
-- drop function if exists public.issue_certification(uuid, uuid, text);
-- drop function if exists public.insert_certification(public.training_enrollments, public.training_programs,
--   public.training_assessments, public.certifications, uuid, jsonb);
-- drop function if exists public.lock_certification_training(uuid, uuid);
