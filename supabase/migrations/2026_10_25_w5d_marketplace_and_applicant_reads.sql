-- =============================================================
-- WashLink W5d - marketplace search and the owner's applicant read path (spec C, A; W5 PLAN P21, P22).
-- Requires w2f (worker_profiles), w4b, w4c, w5b. Idempotent.
--
-- search_job_openings: SECURITY INVOKER, so the job_openings / shops RLS decides; additionally
--   only worker accounts get rows (owners, customers and super_admin get none; anon cannot run it).
--   Pay filters use stated values only: no conversion between periods, no estimate.
-- applicant_profiles_for_job_opening: definer; worker_profiles fields + profiles.full_name for
--   SENT applications (submitted_at set) in submitted, under_review, shortlisted, accepted
--   (D-13), only for the CURRENT owner of the opening's shop (fix cycle 1). Never reads
--   worker_private_contacts (D-14). No worker_profiles policy is widened (P21).
-- applicant_verified_certifications: workflow-issued certifications only (P22). W5 returns no
--   rows because no certification records exist yet; W7 replaces the body, same signature.
-- =============================================================

create or replace function public.search_job_openings(
  p_query text default null,
  p_location text default null,
  p_job_type text default null,
  p_applicant_requirement text default null,
  p_required_skill text default null,
  p_pay_stated boolean default null,
  p_min_pay_amount numeric default null,
  p_pay_period text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  job_opening_id uuid,
  shop_id uuid,
  shop_name text,
  title text,
  work_location text,
  job_type text,
  applicant_requirement text,
  required_skills text[],
  compensation_min_amount numeric,
  compensation_max_amount numeric,
  compensation_currency text,
  compensation_period text,
  application_deadline date,
  first_published_at timestamptz,
  my_application_status text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  query_text text := nullif(btrim(p_query), '');
  location_text text := nullif(btrim(p_location), '');
  job_type_text text := nullif(btrim(p_job_type), '');
  requirement_text text := nullif(btrim(p_applicant_requirement), '');
  skill_text text := nullif(btrim(p_required_skill), '');
  period_text text := nullif(btrim(p_pay_period), '');
  query_pattern text;
  location_pattern text;
  manila_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if greatest(char_length(query_text), char_length(location_text), char_length(job_type_text),
              char_length(requirement_text), char_length(skill_text), char_length(period_text)) > 80 then
    raise exception 'Search filters must be 80 characters or fewer.' using errcode = '22023';
  end if;
  if p_min_pay_amount is not null and period_text is null then
    raise exception 'Choose a pay period to filter by pay amount.' using errcode = '22023';
  end if;
  if p_min_pay_amount < 0 then
    raise exception 'The minimum pay amount cannot be negative.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 1000 then
    raise exception 'Results are limited to 1-50 per page and an offset of 0-1000.' using errcode = '22023';
  end if;
  -- Escape LIKE wildcards and the escape character itself (default ILIKE escape is backslash).
  query_pattern := '%' || replace(replace(replace(query_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  location_pattern := '%' || replace(replace(replace(location_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  if coalesce(public.current_user_profile_role(), '') <> 'worker' then
    return;
  end if;

  return query
  select j.id, j.shop_id, s.name, j.title, j.work_location, j.job_type, j.applicant_requirement,
         j.required_skills, j.compensation_min_amount, j.compensation_max_amount,
         j.compensation_currency, j.compensation_period, j.application_deadline, j.first_published_at,
         (select a.status from public.job_applications a
          where a.job_opening_id = j.id and a.worker_id = auth.uid() and a.status <> 'withdrawn'
          limit 1)
  from public.job_openings j
  left join public.shops s on s.id = j.shop_id
  where j.status = 'published'
    and public.shop_has_recorded_verification(j.shop_id)
    and (j.application_deadline is null or j.application_deadline >= manila_today)
    and (query_text is null
         or j.title ilike query_pattern or j.description ilike query_pattern
         or j.work_location ilike query_pattern or j.schedule_details ilike query_pattern)
    and (location_text is null or j.work_location ilike location_pattern)
    and (job_type_text is null or j.job_type = job_type_text)
    and (requirement_text is null or j.applicant_requirement = requirement_text)
    and (skill_text is null or exists (
           select 1 from unnest(j.required_skills) skill where lower(skill) = lower(skill_text)))
    and (p_pay_stated is null
         or p_pay_stated = (j.compensation_min_amount is not null or j.compensation_max_amount is not null))
    and (period_text is null or j.compensation_period = period_text)
    and (p_min_pay_amount is null
         or coalesce(j.compensation_max_amount, j.compensation_min_amount) >= p_min_pay_amount)
  order by j.first_published_at desc, j.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.search_job_openings(text, text, text, text, text, boolean, numeric, text, integer, integer)
  from public, anon, service_role;
grant execute on function public.search_job_openings(text, text, text, text, text, boolean, numeric, text, integer, integer)
  to authenticated;

-- -------------------------------------------------------------
-- Owner read of applicant profiles for one own opening (sharing statuses only).
-- -------------------------------------------------------------
create or replace function public.applicant_profiles_for_job_opening(p_job_opening_id uuid)
returns table (
  application_id uuid,
  display_name text,
  headline text,
  experience_summary text,
  years_of_experience smallint,
  skills text[],
  preferred_locations text[],
  availability_status text,
  availability_notes text,
  profile_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_job_opening_owner(p_job_opening_id) then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  return query
  select a.id,
         coalesce(nullif(btrim(p.full_name), ''), 'Applicant'),
         wp.headline, wp.experience_summary, wp.years_of_experience, wp.skills,
         wp.preferred_locations, wp.availability_status, wp.availability_notes, wp.updated_at
  from public.job_applications a
  join public.worker_profiles wp on wp.profile_id = a.worker_id
  left join public.profiles p on p.id = a.worker_id
  where a.job_opening_id = p_job_opening_id
    and a.owner_id = auth.uid()
    and a.submitted_at is not null
    and a.status in ('submitted', 'under_review', 'shortlisted', 'accepted')
  order by a.submitted_at, a.id;
end;
$$;

revoke all on function public.applicant_profiles_for_job_opening(uuid) from public, anon, service_role;
grant execute on function public.applicant_profiles_for_job_opening(uuid) to authenticated;

-- -------------------------------------------------------------
-- Verified certifications of an applicant (P22). Empty until W7.
-- -------------------------------------------------------------
create or replace function public.applicant_verified_certifications(p_application_id uuid)
returns table (
  certification_id uuid,
  certification_title text,
  issuing_shop_name text,
  issued_at timestamptz,
  expires_at timestamptz
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
  -- W5: no certification records exist yet (W7 issues them through the workflow). Never reads
  -- worker-entered text.
  return;
end;
$$;

comment on function public.applicant_verified_certifications(uuid) is
  'W5: authorised, returns zero rows (no certification records before W7). W7 replaces the body with active, workflow-issued certifications and keeps this signature.';

revoke all on function public.applicant_verified_certifications(uuid) from public, anon, service_role;
grant execute on function public.applicant_verified_certifications(uuid) to authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W5 rollbacks in reverse order e, d, c, b, a)
-- -------------------------------------------------------------
-- drop function if exists public.applicant_verified_certifications(uuid);
-- drop function if exists public.applicant_profiles_for_job_opening(uuid);
-- drop function if exists public.search_job_openings(text, text, text, text, text, boolean, numeric, text, integer, integer);
