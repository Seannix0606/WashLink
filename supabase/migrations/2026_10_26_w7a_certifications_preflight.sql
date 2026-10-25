-- =============================================================
-- WashLink W7a - schema preflight for certifications (D-10 rows 33 and 34; w3d0 / w4a / w5a / w6a pattern).
-- The W7 guards, RPCs, apply gate and producers resolve columns and functions at run time; drift
-- would surface later as failing issues, renewals, applications or account deletions. This migration
-- aborts instead, naming every missing column / function, and refuses any pre-existing
-- `public.certification*` / `shop_certification_policies` object that W7 did not create (comment must
-- start `W7`). Read-only check: creates nothing. Sorts (and is staged) before w7b..w7h. Idempotent.
-- =============================================================

do $$
declare
  missing text;
  foreign_tables text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.verification_status', 'shops.verification_reviewed_by',
    'shops.verification_reviewed_at', 'shops.is_active',
    'training_enrollments.id', 'training_enrollments.program_id', 'training_enrollments.shop_id',
    'training_enrollments.owner_id', 'training_enrollments.worker_id', 'training_enrollments.status',
    'training_enrollments.accepted_at',
    'training_programs.id', 'training_programs.title', 'training_programs.min_training_days',
    'training_programs.assessment_checklist', 'training_programs.status',
    'training_assessments.id', 'training_assessments.enrollment_id', 'training_assessments.result',
    'training_assessments.assessed_by', 'training_assessments.assessor_role', 'training_assessments.assessor_display_name',
    'training_assessments.assessed_on', 'training_assessments.items_met', 'training_assessments.checklist_snapshot',
    'training_assessments.supersedes_id',
    'training_attendance_records.id', 'training_attendance_records.session_date', 'training_attendance_records.supersedes_id',
    'job_openings.applicant_requirement', 'job_applications.submitted_at',
    'worker_profiles.profile_id', 'profiles.full_name'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.training_enrollment_is_completed(uuid)',
    'public.training_enrollment_attended_days(uuid)',
    'public.lock_training_enrollment_for_recorder(uuid)',
    'public.is_current_training_program_owner(uuid)',
    'public.shop_has_recorded_verification(uuid)',
    'public.is_verified_shop_owner(uuid)',
    'public.job_application_apply_checks(uuid, uuid, uuid)',
    'public.applicant_verified_certifications(uuid)',
    'public.is_current_job_opening_owner(uuid)',
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)',
    'public.notification_safe_label(text, text)',
    'public.current_user_profile_role()',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W7 preflight: missing columns/functions required by certifications: % (D-10 row 34)', missing;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into foreign_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'p')
    and (c.relname like 'certification%' or c.relname = 'shop_certification_policies')
    and coalesce(obj_description(c.oid, 'pg_class'), '') not like 'W7%';
  if foreign_tables is not null then
    raise exception 'W7 preflight: certification objects exist that W7 did not create: % (D-10 row 33)', foreign_tables;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
