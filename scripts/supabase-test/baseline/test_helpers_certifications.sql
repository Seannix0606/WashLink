-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W7 certifications. Seeded AFTER test_helpers.sql (second sql_paths entry of the
-- staged .local-supabase-test workdir only). Same rules as test_helpers.sql: SECURITY INVOKER, transaction-local
-- identity switching, fixtures must start in a trusted session (test_helpers.act_as_service()) and END in one.
-- Training evidence and certificates are created through the REAL W6 / W7 RPCs acting as the shop owner; the
-- backdated sessions / acceptance (W6 R3) and test_helpers.backdate_certification are TEST-ONLY time shifts (W7 R7).

-- As the owner (email), records `present` on every past scheduled supervised session of the program on or after
-- the acceptance date, then a passed assessment with every checklist item met. Returns the enrollment id.
create or replace function test_helpers.record_training_completion(p_enrollment uuid, p_owner_email text)
returns uuid language plpgsql security invoker as $$
declare
  enrollment public.training_enrollments;
  session_ids uuid[];
  checklist_length integer;
  session_id uuid;
begin
  perform test_helpers.assert_service_session();
  select * into strict enrollment from public.training_enrollments where id = p_enrollment;
  select cardinality(p.assessment_checklist) into checklist_length from public.training_programs p where p.id = enrollment.program_id;
  select coalesce(array_agg(s.id order by s.session_date), '{}') into session_ids from public.training_sessions s
  where s.program_id = enrollment.program_id and s.status = 'scheduled' and s.session_kind = 'supervised_training'
    and s.session_date <= test_helpers.manila_today()
    and s.session_date >= (enrollment.accepted_at at time zone 'Asia/Manila')::date
    and not exists (select 1 from public.training_attendance_records r where r.enrollment_id = p_enrollment and r.session_id = s.id);
  perform test_helpers.act_as_owner(p_owner_email);
  foreach session_id in array session_ids loop
    perform public.record_training_attendance(p_enrollment, session_id, 'present');
  end loop;
  perform public.record_training_assessment(p_enrollment, array_fill(true, array[checklist_length]), 'passed');
  perform test_helpers.act_as_service();
  return p_enrollment;
end $$;

-- A program of p_shop with 3 past supervised sessions (today-3 .. today-1), opened, an accepted enrollment of
-- p_worker (accepted 10 days ago) and its completion recorded by the owner. Returns the enrollment id.
create or replace function test_helpers.complete_training(p_shop uuid, p_worker uuid, p_owner_email text)
returns uuid language plpgsql security invoker as $$
declare
  program_id uuid;
  enrollment_id uuid;
begin
  perform test_helpers.assert_service_session();
  program_id := test_helpers.create_training_program(p_shop);
  perform test_helpers.add_training_session(program_id, test_helpers.manila_today() - n) from generate_series(1, 3) n;
  perform test_helpers.open_training_program(program_id);
  enrollment_id := test_helpers.create_accepted_enrollment(program_id, p_worker);
  return test_helpers.record_training_completion(enrollment_id, p_owner_email);
end $$;

-- complete_training, then issue_certification as the owner (current assessment, attestation w7_issuer_v1).
-- Returns the certification id. Audited and notified like any owner issue.
create or replace function test_helpers.issue_test_certification(p_shop uuid, p_worker uuid, p_owner_email text)
returns uuid language plpgsql security invoker as $$
declare
  enrollment_id uuid;
  assessment_id uuid;
  certification_id uuid;
begin
  perform test_helpers.assert_service_session();
  enrollment_id := test_helpers.complete_training(p_shop, p_worker, p_owner_email);
  assessment_id := public.current_training_assessment_id(enrollment_id);
  perform test_helpers.act_as_owner(p_owner_email);
  certification_id := (public.issue_certification(enrollment_id, assessment_id, 'w7_issuer_v1')).id;
  perform test_helpers.act_as_service();
  return certification_id;
end $$;

-- TEST-ONLY time shift (W7 R7): moves a certificate's issue / approval / expiry stamps, its status history and its
-- re-assessments p_days into the past. The W7 guards refuse this for every session, so the fixture disables them
-- for the one statement (superuser, inside the test transaction) and re-enables them.
create or replace function test_helpers.backdate_certification(p_certification uuid, p_days integer)
returns uuid language plpgsql security invoker as $$
declare
  shift interval := make_interval(days => p_days);
begin
  perform test_helpers.assert_service_session();
  alter table public.certifications disable trigger certifications_guard_write;
  update public.certifications set issued_at = issued_at - shift, approved_at = approved_at - shift, expires_at = expires_at - shift
  where id = p_certification;
  alter table public.certifications enable trigger certifications_guard_write;
  alter table public.certification_status_events disable trigger certification_status_events_guard_write;
  update public.certification_status_events set created_at = created_at - shift where certification_id = p_certification;
  alter table public.certification_status_events enable trigger certification_status_events_guard_write;
  alter table public.certification_reassessments disable trigger certification_reassessments_guard_write;
  update public.certification_reassessments set recorded_at = recorded_at - shift, assessed_on = assessed_on - p_days
  where certification_id = p_certification;
  alter table public.certification_reassessments enable trigger certification_reassessments_guard_write;
  return p_certification;
end $$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.backdate_certification(uuid, integer);
-- drop function if exists test_helpers.issue_test_certification(uuid, uuid, text);
-- drop function if exists test_helpers.complete_training(uuid, uuid, text);
-- drop function if exists test_helpers.record_training_completion(uuid, text);
