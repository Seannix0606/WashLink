-- =============================================================
-- WashLink W9a - schema preflight for worker contracts (D-10 rows 38 and 39; w3d0 / w4a / w5a / w6a / w7a / w8a
-- pattern). The W9 guards, RPCs, reads, retention and producers resolve columns and functions at run time; drift
-- would surface later as failing sends or account deletions. This migration aborts instead, naming every missing
-- column / function, and refuses any pre-existing public relation or function named worker_contract*,
-- contract_version*, contract_acceptance*, contract_problem_term*, contract_acknowledgement* or
-- retained_job_application* (also *_worker_contract*) that W9 did not create (comment must start `W9`, or `W8/W9` for
-- the W9 tables named contract_*: the committed w8a preflight, re-run by j19_w8_review_polish, refuses any contract_*
-- relation whose comment does not start with `W8`; w9j comments every W9 function). Read-only check: creates nothing.
-- Sorts (and is staged) before w9b..w9j.
-- Idempotent.
-- =============================================================

do $$
declare
  missing text;
  foreign_objects text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'profiles.id', 'profiles.role', 'profiles.full_name',
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.address',
    'worker_profiles.profile_id',
    'worker_classification_options.classification_key', 'worker_classification_options.label',
    'worker_classification_options.sort_order', 'worker_classification_options.needs_extra_acknowledgement',
    'contract_template_sections.section_number', 'contract_template_sections.title',
    'contract_template_sections.review_notice', 'contract_template_sections.owner_terms_allowed',
    'contract_template_placeholders.placeholder_key',
    'contract_templates.scope', 'contract_templates.owner_id', 'contract_templates.status', 'contract_templates.name',
    'contract_template_versions.template_id', 'contract_template_versions.version_number',
    'contract_template_versions.base_platform_version_id', 'contract_template_versions.content_hash',
    'contract_template_clauses.version_id', 'contract_template_clauses.clause_key', 'contract_template_clauses.kind',
    'contract_template_clauses.body', 'contract_template_clauses.requires_owner_input',
    'job_applications.status', 'job_applications.submitted_at', 'job_applications.shop_id', 'job_applications.owner_id',
    'job_applications.worker_id', 'job_applications.decided_at', 'job_applications.opening_snapshot',
    'training_enrollments.id', 'training_enrollments.shop_id', 'training_enrollments.owner_id',
    'training_enrollments.worker_id', 'training_enrollments.program_id',
    'workforce_audit_events.id', 'workforce_audit_events.action', 'notifications.idempotency_key'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.render_contract_template_clause(text, jsonb)',
    'public.contract_template_placeholders_in(text)',
    'public.contract_template_normalize_text(text)',
    'public.contract_template_clause_hash(integer, integer, text, text, text, text)',
    'public.contract_template_checked_shop_terms(jsonb)',
    'public.contract_template_shop_terms(uuid)',
    'public.contract_template_latest_platform_version()',
    'public.training_enrollment_is_completed(uuid)',
    'public.training_enrollment_is_live(uuid)',
    'public.shop_has_recorded_verification(uuid)',
    'public.is_verified_shop_owner(uuid)',
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)',
    'public.notification_safe_label(text, text)',
    'public.is_trusted_db_session()',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)',
    'public.current_user_profile_role()',
    'public.is_super_admin()'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W9 preflight: missing columns/functions required by worker contracts: % (D-10 row 39)', missing;
  end if;

  select string_agg(x.name, ', ' order by x.name) into foreign_objects
  from (
    select c.relname::text as name, coalesce(obj_description(c.oid, 'pg_class'), '') as note
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
    union all
    select p.oid::regprocedure::text, coalesce(obj_description(p.oid, 'pg_proc'), '')
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  ) x
  where (x.name ~ '^(public\.)?(worker_contract|contract_version|contract_acceptance|contract_problem_term|contract_acknowledgement|retained_job_application)'
         or x.name ~ '_worker_contract')
    and x.note not like 'W9%' and x.note not like 'W8/W9 contract module (created by W9)%';
  if foreign_objects is not null then
    raise exception 'W9 preflight: worker contract objects exist that W9 did not create: % (D-10 row 38)', foreign_objects;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
