-- =============================================================
-- WashLink W11h - role-aware dashboard summaries (spec H; D-42, D-43; W11 PLAN 3.8, P65). Requires w4c, w5b, w5d, w6c,
-- w6d, w7g, w8g, w9h, w10f, w11d, w11g. Idempotent.
-- One definer, STABLE function per role, scoped to auth.uid() + the profile role: a wrong role or no JWT returns 0 rows
-- (no error, no existence oracle). Exactly one row otherwise. Integers, booleans, dates and the list of missing worker
-- profile field KEYS only: no names, free text, contacts or other parties' ids.
-- Each count reuses the read it summarises: where a definer / invoker read exists it is called directly (my_*, owner_*
-- reads filter on auth.uid() themselves); otherwise the read's own predicate is repeated (applications, training,
-- openings: the predicate of search_job_openings without its page limit; "applicable" = the shop can receive
-- applications, i.e. a recorded verification, as in search_job_openings, AND the worker can apply: a
-- certification_required opening counts only while the worker holds a current certificate (D-20, the W7 apply gate;
-- fix cycle 1 C5)).
-- Admin stranded suspensions (fix cycle 1 C4): suspended, basis issuer_unavailable, and certification_platform_review_blocker()
-- neither 'open' nor 'decided' (the rule of open / can_open); certificates at the 3-review limit stay counted (no route left).
-- =============================================================

create or replace function public.my_worker_dashboard_summary()
returns table (has_worker_profile boolean, profile_missing_fields text[], open_opening_count integer, draft_application_count integer,
               active_application_count integer, accepted_application_count integer, training_invitation_count integer,
               training_in_progress_count integer, next_training_date date, current_certification_count integer,
               expiring_30d_certification_count integer, suspended_or_revoked_certification_count integer,
               platform_review_available_count integer, open_platform_review_count integer, contract_offer_count integer,
               amendment_offer_count integer, accepted_not_started_count integer, active_contract_count integer,
               open_dispute_count integer, dispute_response_needed_count integer, counted_as_of timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select wp.profile_id is not null,
         array_remove(array[
           case when nullif(btrim(wp.headline), '') is null then 'headline' end,
           case when nullif(btrim(wp.experience_summary), '') is null then 'experience_summary' end,
           case when coalesce(cardinality(wp.skills), 0) = 0 then 'skills' end,
           case when coalesce(cardinality(wp.preferred_locations), 0) = 0 then 'preferred_locations' end,
           case when wp.availability_status is null then 'availability' end], null),
         (select count(*)::integer from public.job_openings j
          where j.status = 'published' and public.shop_has_recorded_verification(j.shop_id)
            and (j.application_deadline is null or j.application_deadline >= x.today)
            and (j.applicant_requirement <> 'certification_required' or x.certified)
            and not exists (select 1 from public.job_applications a where a.job_opening_id = j.id and a.worker_id = x.me and a.status <> 'withdrawn')),
         (select count(*)::integer from public.job_applications a where a.worker_id = x.me and a.status = 'draft'),
         (select count(*)::integer from public.job_applications a where a.worker_id = x.me and a.status in ('submitted', 'under_review', 'shortlisted')),
         (select count(*)::integer from public.job_applications a where a.worker_id = x.me and a.status = 'accepted'),
         (select count(*)::integer from public.training_enrollments e
          where e.worker_id = x.me and public.training_enrollment_progress_status_of(e.id) = 'invited'),
         (select count(*)::integer from public.training_enrollments e
          where e.worker_id = x.me and e.status = 'accepted'
            and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment')),
         (select min(s.session_date) from public.training_enrollments e join public.training_sessions s on s.program_id = e.program_id
          where e.worker_id = x.me and e.status = 'accepted' and s.status = 'scheduled' and s.session_date >= x.today
            and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment')),
         (select count(*)::integer from public.my_certifications() m where m.effective_status = 'active'),
         (select count(*)::integer from public.my_certifications() m where m.effective_status = 'active' and m.expires_at < now() + interval '30 days'),
         (select count(*)::integer from public.my_certifications() m where m.status in ('suspended', 'revoked')),
         (select count(*)::integer from public.my_certification_platform_reviews() r where r.can_open),
         (select count(*)::integer from public.my_certification_platform_reviews() r where r.open_review_id is not null),
         (select count(*)::integer from public.my_worker_contracts() k where k.pending_version_kind = 'initial'),
         (select count(*)::integer from public.my_worker_contracts() k where k.pending_version_kind = 'amendment'),
         (select count(*)::integer from public.my_worker_contracts() k where k.effective_status = 'accepted'),
         (select count(*)::integer from public.my_worker_contracts() k where k.effective_status = 'active'),
         (select count(*)::integer from public.my_contract_disputes() d where d.status = 'open'),
         (select count(*)::integer from public.my_contract_disputes() d where d.can_respond),
         now()
  from (select auth.uid() as me, (now() at time zone 'Asia/Manila')::date as today,
               auth.uid() is not null and public.worker_holds_current_certification(auth.uid()) as certified) x
  left join public.worker_profiles wp on wp.profile_id = x.me
  where x.me is not null and coalesce(public.current_user_profile_role() = 'worker', false);
$$;

create or replace function public.owner_dashboard_summary()
returns table (shop_count integer, verified_shop_count integer, shops_needing_verification_count integer, published_opening_count integer,
               draft_opening_count integer, new_application_count integer, in_review_application_count integer,
               training_invitation_pending_count integer, trainee_in_progress_count integer, ready_to_certify_count integer,
               open_shop_review_request_count integer, open_platform_review_count integer, expiring_certification_count integer,
               record_changed_certification_count integer, active_template_count integer, newer_standard_template_available boolean,
               contract_draft_count integer, offer_awaiting_worker_count integer, amendment_awaiting_worker_count integer,
               accepted_not_started_count integer, active_contract_count integer, relationship_needs_attention_count integer,
               open_dispute_count integer, dispute_response_needed_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with certs as (select oc.* from public.shops s cross join lateral public.owner_certifications(s.id) oc where s.owner_id = auth.uid()),
  contracts as (select * from public.owner_worker_contracts()),
  disputes as (select * from public.my_contract_disputes())
  select (select count(*)::integer from public.shops s where s.owner_id = x.me),
         (select count(*)::integer from public.shops s where s.owner_id = x.me and public.shop_has_recorded_verification(s.id)),
         (select count(*)::integer from public.shops s where s.owner_id = x.me and not public.shop_has_recorded_verification(s.id)),
         (select count(*)::integer from public.job_openings j where j.owner_id = x.me and j.status = 'published'
            and public.is_current_job_opening_owner(j.id)),
         (select count(*)::integer from public.job_openings j where j.owner_id = x.me and j.status = 'draft'
            and public.is_current_job_opening_owner(j.id)),
         (select count(*)::integer from public.job_applications a where a.owner_id = x.me and a.submitted_at is not null
            and public.is_current_job_opening_owner(a.job_opening_id) and a.status = 'submitted'),
         (select count(*)::integer from public.job_applications a where a.owner_id = x.me and a.submitted_at is not null
            and public.is_current_job_opening_owner(a.job_opening_id) and a.status in ('under_review', 'shortlisted')),
         (select count(*)::integer from public.training_enrollments e where e.owner_id = x.me
            and public.is_current_training_program_owner(e.program_id) and public.training_enrollment_progress_status_of(e.id) = 'invited'),
         (select count(*)::integer from public.training_enrollments e where e.owner_id = x.me and e.status = 'accepted'
            and public.is_current_training_program_owner(e.program_id)
            and public.training_enrollment_progress_status_of(e.id) in ('scheduled', 'in_progress', 'awaiting_assessment')),
         (select count(*)::integer from public.training_enrollments e where e.status = 'accepted'
            and public.is_current_training_program_owner(e.program_id) and public.training_enrollment_is_completed(e.id)
            and not exists (select 1 from public.certifications c where c.enrollment_id = e.id and c.renews_certification_id is null)),
         (select count(*)::integer from certs where certs.open_review_request_id is not null),
         (select count(*)::integer from public.owner_certification_platform_reviews() r where r.status = 'open'),
         (select count(*)::integer from certs where certs.effective_status = 'active' and certs.expires_at < now() + interval '30 days'),
         (select count(*)::integer from certs where certs.status in ('active', 'suspended') and certs.training_record_changed_after_issue),
         (select count(*)::integer from public.owner_contract_templates() t where t.status = 'active'),
         coalesce((select bool_or(t.newer_standard_available) from public.owner_contract_templates() t where t.status = 'active'), false),
         (select count(*)::integer from contracts where contracts.status = 'draft'),
         (select count(*)::integer from contracts where contracts.pending_version_kind = 'initial'),
         (select count(*)::integer from contracts where contracts.pending_version_kind = 'amendment'),
         (select count(*)::integer from contracts where contracts.effective_status = 'accepted'),
         (select count(*)::integer from contracts where contracts.effective_status = 'active'),
         (select count(*)::integer from public.owner_worker_relationships() r where r.status = 'suspended'),
         (select count(*)::integer from disputes where disputes.status = 'open'),
         (select count(*)::integer from disputes where disputes.can_respond)
  from (select auth.uid() as me) x
  where x.me is not null and coalesce(public.current_user_profile_role() = 'owner', false);
$$;

create or replace function public.admin_dashboard_summary()
returns table (shops_pending_review_count integer, open_platform_review_count integer, oldest_platform_review_opened_at timestamptz,
               overdue_shop_review_request_count integer, stranded_suspended_certification_count integer, open_dispute_count integer,
               unviewed_dispute_count integer, oldest_dispute_opened_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select count(*)::integer from public.shops s where s.verification_status in ('pending', 'changes_requested')),
         (select count(*)::integer from public.certification_platform_reviews p where p.status = 'open'),
         (select min(p.opened_at) from public.certification_platform_reviews p where p.status = 'open'),
         (select count(*)::integer from public.certification_review_requests r where r.status = 'open'
            and r.requested_at <= now() - make_interval(days => public.certification_platform_review_owner_decision_days())),
         (select count(*)::integer from public.certifications c where c.status = 'suspended'
            and public.certification_platform_review_basis(c.id) = 'issuer_unavailable'
            and coalesce(public.certification_platform_review_blocker(c.id), 'none') not in ('open', 'decided')),
         (select count(*)::integer from public.worker_contract_disputes d where d.status = 'open'),
         (select count(*)::integer from public.worker_contract_disputes d where d.status = 'open' and d.first_viewed_by_admin_at is null),
         (select min(d.created_at) from public.worker_contract_disputes d where d.status = 'open')
  where auth.uid() is not null and public.is_super_admin() and coalesce(public.current_user_profile_role() = 'super_admin', false);
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array['public.my_worker_dashboard_summary()', 'public.owner_dashboard_summary()', 'public.admin_dashboard_summary()'] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.admin_dashboard_summary();
-- drop function if exists public.owner_dashboard_summary();
-- drop function if exists public.my_worker_dashboard_summary();
