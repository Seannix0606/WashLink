-- =============================================================
-- WashLink W7d - certification rule helpers (spec D; D-5, D-20, D-22; W7 PLAN P32, P33, 3.4).
-- Requires w4b, w6d, w7b, w7c. Idempotent. Internal (no client role) unless stated.
--   certification_effective_status(status, expires_at, at)  pure; authenticated. 'expired' when the
--     stored status is 'active' and at >= expires_at, else the stored status (expiry is derived).
--   shop_certification_validity_months(shop)               absent policy row = 12 (D-5); used by the w7b insert guard.
--   certification_renewal_window_open(expires_at, at)        expires_at - 60 days .. expires_at + 90 days.
--   worker_holds_current_certification(worker, at)           any shop, any program, effective active.
--   worker_has_live_certification_for_program(worker, prog)  active and not expired, or suspended.
--   certification_evidence_snapshot(enrollment, assessment)  CURRENT (non-superseded) records only.
--   current_training_assessment_id(enrollment), certification_shop_verification_snapshot(shop),
--   lock_certification_for_owner(certification)              FOR UPDATE; 42501 unless the current owner.
-- Functions taking p_at refuse a past value (22023): no "as of yesterday" answers.
-- =============================================================

-- -------------------------------------------------------------
-- Internal: validity that applies to a NEW issue / renewal (absent row = 12, D-5).
-- -------------------------------------------------------------
create or replace function public.shop_certification_validity_months(p_shop_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.validity_months::integer from public.shop_certification_policies p where p.shop_id = p_shop_id), 12);
$$;
revoke all on function public.shop_certification_validity_months(uuid) from public, anon, authenticated, service_role;

create or replace function public.certification_effective_status(p_status text, p_expires_at timestamptz, p_at timestamptz)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_status = 'active' and p_at >= p_expires_at then 'expired' else p_status end;
$$;
revoke all on function public.certification_effective_status(text, timestamptz, timestamptz) from public, anon, service_role;
grant execute on function public.certification_effective_status(text, timestamptz, timestamptz) to authenticated;

create or replace function public.certification_issuer_attestation_version()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select 'w7_issuer_v1'::text $$;
revoke all on function public.certification_issuer_attestation_version() from public, anon, service_role;
grant execute on function public.certification_issuer_attestation_version() to authenticated;

create or replace function public.certification_renewal_window_open(p_expires_at timestamptz, p_at timestamptz)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_at between p_expires_at - interval '60 days' and p_expires_at + interval '90 days', false);
$$;
revoke all on function public.certification_renewal_window_open(timestamptz, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.worker_holds_current_certification(p_worker uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_at < now() then
    raise exception 'A past time cannot be used.' using errcode = '22023';
  end if;
  return exists (select 1 from public.certifications c
                 where c.worker_id = p_worker
                   and public.certification_effective_status(c.status, c.expires_at, p_at) = 'active');
end;
$$;
revoke all on function public.worker_holds_current_certification(uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.worker_has_live_certification_for_program(p_worker uuid, p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.certifications c
                 where c.worker_id = p_worker and c.program_id = p_program
                   and public.certification_effective_status(c.status, c.expires_at, now()) in ('active', 'suspended'));
$$;
revoke all on function public.worker_has_live_certification_for_program(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.current_training_assessment_id(p_enrollment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id from public.training_assessments a
  where a.enrollment_id = p_enrollment_id
    and not exists (select 1 from public.training_assessments n where n.supersedes_id = a.id)
  order by a.signed_off_at desc, a.id
  limit 1;
$$;
revoke all on function public.current_training_assessment_id(uuid) from public, anon, authenticated, service_role;

-- Evidence the decision rests on, frozen at issue (CURRENT rows only: superseded rows are excluded).
create or replace function public.certification_evidence_snapshot(p_enrollment_id uuid, p_assessment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'snapshot_version', 1,
    'enrollment_id', e.id,
    'program_id', p.id,
    'program_title', p.title,
    'required_training_days', greatest(3, p.min_training_days),
    'attended_training_days', public.training_enrollment_attended_days(e.id),
    'attended_dates', coalesce(att.dates, '[]'::jsonb),
    'attendance_record_ids', coalesce(att.ids, '[]'::jsonb),
    'assessment_id', a.id,
    'assessment_result', a.result,
    'assessed_on', a.assessed_on,
    'assessor_role', a.assessor_role,
    'assessor_display_name', a.assessor_display_name,
    'checklist_snapshot', to_jsonb(a.checklist_snapshot),
    'items_met', to_jsonb(a.items_met),
    'accepted_at', e.accepted_at)
  from public.training_enrollments e
  join public.training_programs p on p.id = e.program_id
  left join public.training_assessments a on a.id = p_assessment_id and a.enrollment_id = e.id
  left join lateral (
    select jsonb_agg(distinct r.session_date) as dates, jsonb_agg(r.id order by r.session_date, r.id) as ids
    from public.training_attendance_records r
    join public.training_sessions s on s.id = r.session_id
    where r.enrollment_id = e.id and r.attendance_status = 'present'
      and s.session_kind = 'supervised_training' and s.status = 'scheduled'
      and not exists (select 1 from public.training_attendance_records n where n.supersedes_id = r.id)) att on true
  where e.id = p_enrollment_id;
$$;
revoke all on function public.certification_evidence_snapshot(uuid, uuid) from public, anon, authenticated, service_role;

-- R-4: the shop verification that stood at issue (status, reviewer, time, latest approval audit event).
create or replace function public.certification_shop_verification_snapshot(
  p_shop_id uuid, out verification_status text, out verified_by uuid, out verified_at timestamptz, out verification_event_id bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.verification_status, s.verification_reviewed_by, s.verification_reviewed_at,
         (select ev.id from public.workforce_audit_events ev
          where ev.action = 'shop.verification_decided' and ev.subject_type = 'shop' and ev.subject_id = s.id
            and ev.payload ->> 'to_status' = 'approved'
          order by ev.id desc limit 1)
  from public.shops s where s.id = p_shop_id;
$$;
revoke all on function public.certification_shop_verification_snapshot(uuid) from public, anon, authenticated, service_role;

-- Status / review RPCs: only the certification row is locked (then the review row).
create or replace function public.lock_certification_for_owner(p_certification_id uuid)
returns public.certifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.certifications;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'owner'
     or not exists (select 1 from public.certifications c where c.id = p_certification_id and c.owner_id = auth.uid()
                    and public.is_current_certification_shop_owner(c.shop_id)) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  select * into target from public.certifications c where c.id = p_certification_id for update;
  if target.owner_id is distinct from auth.uid() or not public.is_current_certification_shop_owner(target.shop_id) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  return target;
end;
$$;
revoke all on function public.lock_certification_for_owner(uuid) from public, anon, authenticated, service_role;

-- Display name for actors (trimmed full_name, else a role label). Never contact data.
create or replace function public.certification_actor_display_name(p_profile_id uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select left(coalesce(nullif(btrim(pr.full_name), ''), p_fallback), 200)
  from (select 1) one left join public.profiles pr on pr.id = p_profile_id;
$$;
revoke all on function public.certification_actor_display_name(uuid, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a; roll back w7e..w7h first)
-- -------------------------------------------------------------
-- drop function if exists public.certification_actor_display_name(uuid, text);
-- drop function if exists public.lock_certification_for_owner(uuid);
-- drop function if exists public.certification_shop_verification_snapshot(uuid);
-- drop function if exists public.certification_evidence_snapshot(uuid, uuid);
-- drop function if exists public.current_training_assessment_id(uuid);
-- drop function if exists public.worker_has_live_certification_for_program(uuid, uuid);
-- drop function if exists public.worker_holds_current_certification(uuid, timestamptz);
-- drop function if exists public.certification_renewal_window_open(timestamptz, timestamptz);
-- drop function if exists public.certification_issuer_attestation_version();
-- drop function if exists public.certification_effective_status(text, timestamptz, timestamptz);
-- drop function if exists public.shop_certification_validity_months(uuid);
