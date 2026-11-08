-- =============================================================
-- WashLink W5a - schema preflight for job applications (D-10 rows 24 and 25; w3d0 / w4a pattern).
-- The W5 snapshot, guard, RPCs and producers resolve columns and functions at run time; drift
-- would surface later as failing applications, opening closes or account deletions (R9). This
-- migration aborts instead, naming every missing column / function, and refuses a pre-existing
-- `public.job_applications` that W5 did not create (its table comment must start with `W5`).
-- Read-only check: creates nothing. Sorts (and is staged) before w5b..w5e. Idempotent.
-- =============================================================

do $$
declare
  missing text;
  existing_comment text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    -- job_openings: identity, lifecycle and every column copied into the snapshot (w5b)
    'job_openings.id', 'job_openings.shop_id', 'job_openings.owner_id', 'job_openings.status',
    'job_openings.updated_at', 'job_openings.first_published_at', 'job_openings.application_deadline',
    'job_openings.title', 'job_openings.description', 'job_openings.duties', 'job_openings.work_location',
    'job_openings.openings_count', 'job_openings.job_type', 'job_openings.required_skills',
    'job_openings.minimum_years_experience', 'job_openings.experience_requirement',
    'job_openings.availability_requirement', 'job_openings.schedule_details',
    'job_openings.compensation_min_amount', 'job_openings.compensation_max_amount',
    'job_openings.compensation_currency', 'job_openings.compensation_period',
    'job_openings.compensation_details', 'job_openings.benefits', 'job_openings.other_terms',
    'job_openings.minimum_qualifications', 'job_openings.preferred_qualifications',
    'job_openings.required_training', 'job_openings.applicant_requirement',
    'job_openings.certification_expectations', 'job_openings.application_instructions',
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.address',
    'worker_profiles.profile_id', 'worker_profiles.headline', 'worker_profiles.experience_summary',
    'worker_profiles.years_of_experience', 'worker_profiles.skills', 'worker_profiles.preferred_locations',
    'worker_profiles.availability_status', 'worker_profiles.availability_notes', 'worker_profiles.updated_at',
    'profiles.id', 'profiles.role', 'profiles.full_name',
    'workforce_audit_events.id', 'workforce_audit_events.action', 'workforce_audit_events.subject_type',
    'workforce_audit_events.subject_id'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)',
    'public.notification_safe_label(text, text)',
    'public.shop_has_recorded_verification(uuid)',
    'public.is_verified_shop_owner(uuid)',
    'public.current_user_profile_role()',
    'public.is_trusted_db_session()',
    'public.transition_job_opening(uuid, text, text)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W5 preflight: missing columns/functions required by job applications: % (D-10 row 25)', missing;
  end if;

  if to_regclass('public.job_applications') is not null then
    existing_comment := obj_description('public.job_applications'::regclass, 'pg_class');
    if existing_comment is null or existing_comment not like 'W5%' then
      raise exception 'W5 preflight: public.job_applications already exists and was not created by W5 (D-10 row 24)';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W5 rollbacks in reverse order e, d, c, b, a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
