-- =============================================================
-- WashLink W7g - certification reads, the real applicant_verified_certifications and the D-20 apply
-- gate (spec D, B, C; D-12 -> D-20, D-13; W7 PLAN 3.7). Requires w5c, w5d, w6d, w7b..w7d. Idempotent.
-- Reads are definer functions for authenticated callers; effective_status is computed with now();
-- no contact columns; display names are a trimmed full_name or a role label.
-- applicant_verified_certifications(uuid): SAME signature and SAME authorisation as W5 (D-13
--   window); now returns the applicant's CURRENT (effective active) certificates from any shop,
--   never suspended / revoked / expired / superseded rows, reasons or history (W7-L4).
-- job_application_apply_checks(uuid, uuid, uuid): SAME signature, every W5 check in the same order;
--   ONE new check right after the deadline: certification_required openings need a current
--   shop-issued certification (D-20; create and draft -> submit). No lock on certificates (R3).
-- =============================================================

create or replace function public.my_certifications()
returns table (certification_id uuid, certification_title text, issuer_kind text, program_id uuid, enrollment_id uuid,
               renews_certification_id uuid, status text, effective_status text, status_reason text, status_changed_at timestamptz,
               issued_at timestamptz, expires_at timestamptz, validity_months integer, shop_name text, approver_display_name text,
               assessor_role text, assessor_display_name text, attended_training_days integer, required_training_days integer,
               shop_verification_status_at_issue text, shop_verified_at_at_issue timestamptz, issuing_shop_present boolean,
               issuing_shop_currently_verified boolean, renewal_window_open boolean, training_record_changed_after_issue boolean,
               open_review_request_id uuid, review_requests_used integer, review_window_ends_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.certification_title, c.issuer_kind, c.program_id, c.enrollment_id, c.renews_certification_id, c.status,
         public.certification_effective_status(c.status, c.expires_at, now()), c.status_reason, c.status_changed_at,
         c.issued_at, c.expires_at, c.validity_months::integer, c.shop_name_snapshot, c.approver_display_name,
         c.assessor_role, c.assessor_display_name, c.attended_training_days::integer, c.required_training_days::integer,
         c.shop_verification_status_at_issue, c.shop_verified_at_at_issue, s.id is not null,
         case when s.id is not null then public.shop_has_recorded_verification(s.id) end,
         c.status = 'active' and public.certification_renewal_window_open(c.expires_at, now()),
         not public.training_enrollment_is_completed(c.enrollment_id),
         (select r.id from public.certification_review_requests r where r.certification_id = c.id and r.status = 'open'),
         (select count(*)::integer from public.certification_review_requests r where r.certification_id = c.id),
         case when c.status in ('suspended', 'revoked') then
           (select max(ev.created_at) + interval '30 days' from public.certification_status_events ev
            where ev.certification_id = c.id and ev.event in ('suspended', 'revoked')) end
  from public.certifications c
  left join public.shops s on s.id = c.shop_id
  where auth.uid() is not null and c.worker_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false)
  order by c.issued_at desc, c.id;
$$;

create or replace function public.certification_history(p_certification_id uuid)
returns table (entry_kind text, entry_id text, event text, from_status text, to_status text, reason text, actor_role text,
               actor_display_name text, review_status text, worker_statement text, decision_reason text,
               decider_display_name text, occurred_at timestamptz, decided_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_read_certification(p_certification_id) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  return query
  select 'status_event'::text, ev.id::text, ev.event, ev.from_status, ev.to_status, ev.reason, ev.actor_role,
         ev.actor_display_name, null::text, null::text, null::text, null::text, ev.created_at, null::timestamptz
  from public.certification_status_events ev where ev.certification_id = p_certification_id
  union all
  select 'review_request'::text, r.id::text, null::text, null::text, null::text, null::text, 'worker'::text,
         null::text, r.status, r.worker_statement, r.decision_reason, r.decider_display_name, r.requested_at, r.decided_at
  from public.certification_review_requests r where r.certification_id = p_certification_id
  order by 13, 2;
end;
$$;

create or replace function public.owner_certifications(p_shop_id uuid)
returns table (certification_id uuid, worker_id uuid, worker_display_name text, certification_title text, program_id uuid,
               enrollment_id uuid, renews_certification_id uuid, status text, effective_status text, status_reason text,
               issued_at timestamptz, expires_at timestamptz, validity_months integer, training_record_changed_after_issue boolean,
               renewal_window_open boolean, latest_reassessment_id uuid, latest_reassessment_result text,
               latest_reassessment_assessed_on date, latest_reassessment_used boolean, open_review_request_id uuid,
               open_review_statement text, open_review_requested_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_certification_shop_owner(p_shop_id) then
    raise exception 'Shop not found.' using errcode = '42501';
  end if;
  return query
  select c.id, c.worker_id, coalesce(nullif(btrim(pr.full_name), ''), 'Worker'), c.certification_title, c.program_id,
         c.enrollment_id, c.renews_certification_id, c.status, public.certification_effective_status(c.status, c.expires_at, now()),
         c.status_reason, c.issued_at, c.expires_at, c.validity_months::integer,
         not public.training_enrollment_is_completed(c.enrollment_id),
         c.status = 'active' and public.certification_renewal_window_open(c.expires_at, now()),
         ra.id, ra.result, ra.assessed_on, exists (select 1 from public.certifications u where u.reassessment_id = ra.id),
         rr.id, rr.worker_statement, rr.requested_at
  from public.certifications c
  left join public.profiles pr on pr.id = c.worker_id
  left join lateral (select r.id, r.result, r.assessed_on from public.certification_reassessments r where r.certification_id = c.id
                     order by r.recorded_at desc, r.id desc limit 1) ra on true
  left join lateral (select q.id, q.worker_statement, q.requested_at from public.certification_review_requests q
                     where q.certification_id = c.id and q.status = 'open') rr on true
  where c.shop_id = p_shop_id and c.owner_id = auth.uid()
  order by (rr.id is null), c.issued_at desc, c.id;
end;
$$;

create or replace function public.certifiable_enrollments(p_program_id uuid)
returns table (enrollment_id uuid, worker_id uuid, worker_display_name text, attended_training_days integer,
               required_training_days integer, current_assessment_id uuid, assessed_on date, assessor_display_name text,
               validity_months integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_training_program_owner(p_program_id) then
    raise exception 'Training program not found.' using errcode = '42501';
  end if;
  return query
  select e.id, e.worker_id, coalesce(nullif(btrim(pr.full_name), ''), 'Trainee'), public.training_enrollment_attended_days(e.id),
         greatest(3, p.min_training_days)::integer, a.id, a.assessed_on, a.assessor_display_name,
         public.shop_certification_validity_months(e.shop_id)
  from public.training_enrollments e
  join public.training_programs p on p.id = e.program_id
  left join public.profiles pr on pr.id = e.worker_id
  left join public.training_assessments a on a.id = public.current_training_assessment_id(e.id)
  where e.program_id = p_program_id and e.status = 'accepted' and public.training_enrollment_is_completed(e.id)
    and not exists (select 1 from public.certifications c where c.enrollment_id = e.id and c.renews_certification_id is null)
  order by e.accepted_at, e.id;
end;
$$;

-- -------------------------------------------------------------
-- Replaced W5 bodies (same signatures, same authorisation / check order).
-- -------------------------------------------------------------
-- Review polish (W7-L16): + issuing_shop_currently_verified (never null; false if removed / inactive / unverified).
drop function if exists public.applicant_verified_certifications(uuid);
create function public.applicant_verified_certifications(p_application_id uuid)
returns table (
  certification_id uuid,
  certification_title text,
  issuing_shop_name text,
  issued_at timestamptz,
  expires_at timestamptz,
  issuing_shop_currently_verified boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target public.job_applications;
  caller_role text := coalesce(public.current_user_profile_role(), '');
begin
  select * into target from public.job_applications a where a.id = p_application_id;
  if not found or auth.uid() is null
     or not ((target.worker_id = auth.uid() and caller_role = 'worker')
             or (target.owner_id = auth.uid() and target.submitted_at is not null
                 and target.status in ('submitted', 'under_review', 'shortlisted', 'accepted')
                 and public.is_current_job_opening_owner(target.job_opening_id)))
  then
    raise exception 'Job application not found.' using errcode = '42501';
  end if;
  -- W7: workflow-issued certificates only, CURRENT (effective active) ones only. Never reads
  -- worker-entered text, reasons or history.
  return query
  select c.id, c.certification_title, c.shop_name_snapshot, c.issued_at, c.expires_at,
         c.shop_id is not null and public.shop_has_recorded_verification(c.shop_id)
  from public.certifications c
  where c.worker_id = target.worker_id
    and public.certification_effective_status(c.status, c.expires_at, now()) = 'active'
  order by c.issued_at desc, c.id;
end;
$$;

comment on function public.applicant_verified_certifications(uuid) is
  'W7: authorised as in W5 (D-13 window); returns the applicant''s current shop-issued certifications from any shop (never suspended, revoked, expired or superseded ones) and whether the issuing shop is currently verified and active. Not a government-recognized credential.';
revoke all on function public.applicant_verified_certifications(uuid) from public, anon, service_role;
grant execute on function public.applicant_verified_certifications(uuid) to authenticated;

create or replace function public.job_application_apply_checks(
  p_job_opening_id uuid,
  p_worker_id uuid,
  p_draft_id uuid default null
)
returns public.job_openings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  opening public.job_openings;
begin
  select * into opening from public.job_openings j where j.id = p_job_opening_id for share;
  if not found or opening.status = 'draft' then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  if opening.status = 'paused' then
    raise exception 'This job opening is paused and is not accepting applications.' using errcode = '23514';
  end if;
  if opening.status in ('closed', 'archived') then
    raise exception 'This job opening is closed.' using errcode = '23514';
  end if;
  if not public.shop_has_recorded_verification(opening.shop_id) then
    raise exception 'This shop cannot receive applications until its verification is reviewed.' using errcode = '23514';
  end if;
  if opening.application_deadline < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The application deadline for this opening has passed.' using errcode = '23514';
  end if;
  -- W7 (D-20): certification-required openings need a CURRENT shop-issued certification (any shop).
  if opening.applicant_requirement = 'certification_required' and not public.worker_holds_current_certification(p_worker_id) then
    raise exception 'This opening needs a current shop-issued certification recorded on WashLink.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('job_applications:' || p_worker_id::text, 0));
  if (select count(*) from public.job_applications a
      where a.job_opening_id = p_job_opening_id and a.worker_id = p_worker_id
        and a.id is distinct from p_draft_id) >= 3 then
    raise exception 'You cannot apply to this job opening again.' using errcode = '23514';
  end if;
  if (select count(*) from public.job_applications a
      where a.worker_id = p_worker_id and a.status in ('submitted', 'under_review', 'shortlisted')) >= 50 then
    raise exception 'You have reached the limit of 50 open applications.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('job_opening_apps:' || p_job_opening_id::text, 0));
  -- Sent, not withdrawn (a draft closed by the auto-close was never sent and does not count).
  if (select count(*) from public.job_applications a
      where a.job_opening_id = p_job_opening_id and a.submitted_at is not null
        and a.status <> 'withdrawn') >= 500 then
    raise exception 'This job opening is not accepting more applications.' using errcode = '23514';
  end if;
  return opening;
end;
$$;

revoke all on function public.job_application_apply_checks(uuid, uuid, uuid) from public, anon, authenticated, service_role;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.my_certifications()',
    'public.certification_history(uuid)',
    'public.owner_certifications(uuid)',
    'public.certifiable_enrollments(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a). Re-opens D-12.
-- Restore the W5 bodies verbatim: applicant_verified_certifications = the 2026_10_25_w5d block below (return type
-- differs: drop first); job_application_apply_checks = the 2026_10_25_w5c body (this body WITHOUT the D-20 if-block).
-- -------------------------------------------------------------
-- drop function if exists public.applicant_verified_certifications(uuid);
-- create or replace function public.applicant_verified_certifications(p_application_id uuid)
-- returns table (
--   certification_id uuid,
--   certification_title text,
--   issuing_shop_name text,
--   issued_at timestamptz,
--   expires_at timestamptz
-- )
-- language plpgsql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   target public.job_applications;
--   caller_role text := coalesce(public.current_user_profile_role(), '');
-- begin
--   select * into target from public.job_applications a where a.id = p_application_id;
--   if not found or auth.uid() is null
--      or not ((target.worker_id = auth.uid() and caller_role = 'worker')
--              or (target.owner_id = auth.uid() and target.submitted_at is not null
--                  and target.status in ('submitted', 'under_review', 'shortlisted', 'accepted')
--                  and public.is_current_job_opening_owner(target.job_opening_id)))
--   then
--     raise exception 'Job application not found.' using errcode = '42501';
--   end if;
--   -- W5: no certification records exist yet (W7 issues them through the workflow). Never reads
--   -- worker-entered text.
--   return;
-- end;
-- $$;
--
-- comment on function public.applicant_verified_certifications(uuid) is
--   'W5: authorised, returns zero rows (no certification records before W7). W7 replaces the body with active, workflow-issued certifications and keeps this signature.';
--
-- revoke all on function public.applicant_verified_certifications(uuid) from public, anon, service_role;
-- grant execute on function public.applicant_verified_certifications(uuid) to authenticated;
-- create or replace function public.job_application_apply_checks(
--   p_job_opening_id uuid,
--   p_worker_id uuid,
--   p_draft_id uuid default null
-- )
-- returns public.job_openings
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   opening public.job_openings;
-- begin
--   select * into opening from public.job_openings j where j.id = p_job_opening_id for share;
--   if not found or opening.status = 'draft' then
--     raise exception 'Job opening not found.' using errcode = '42501';
--   end if;
--   if opening.status = 'paused' then
--     raise exception 'This job opening is paused and is not accepting applications.' using errcode = '23514';
--   end if;
--   if opening.status in ('closed', 'archived') then
--     raise exception 'This job opening is closed.' using errcode = '23514';
--   end if;
--   if not public.shop_has_recorded_verification(opening.shop_id) then
--     raise exception 'This shop cannot receive applications until its verification is reviewed.' using errcode = '23514';
--   end if;
--   if opening.application_deadline < (now() at time zone 'Asia/Manila')::date then
--     raise exception 'The application deadline for this opening has passed.' using errcode = '23514';
--   end if;
--   perform pg_advisory_xact_lock(hashtextextended('job_applications:' || p_worker_id::text, 0));
--   if (select count(*) from public.job_applications a
--       where a.job_opening_id = p_job_opening_id and a.worker_id = p_worker_id
--         and a.id is distinct from p_draft_id) >= 3 then
--     raise exception 'You cannot apply to this job opening again.' using errcode = '23514';
--   end if;
--   if (select count(*) from public.job_applications a
--       where a.worker_id = p_worker_id and a.status in ('submitted', 'under_review', 'shortlisted')) >= 50 then
--     raise exception 'You have reached the limit of 50 open applications.' using errcode = '23514';
--   end if;
--   perform pg_advisory_xact_lock(hashtextextended('job_opening_apps:' || p_job_opening_id::text, 0));
--   -- Sent, not withdrawn (a draft closed by the auto-close was never sent and does not count).
--   if (select count(*) from public.job_applications a
--       where a.job_opening_id = p_job_opening_id and a.submitted_at is not null
--         and a.status <> 'withdrawn') >= 500 then
--     raise exception 'This job opening is not accepting more applications.' using errcode = '23514';
--   end if;
--   return opening;
-- end;
-- $$;
-- drop function if exists public.certifiable_enrollments(uuid);
-- drop function if exists public.owner_certifications(uuid);
-- drop function if exists public.certification_history(uuid);
-- drop function if exists public.my_certifications();
