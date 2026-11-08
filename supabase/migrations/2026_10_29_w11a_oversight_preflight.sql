-- =============================================================
-- WashLink W11a - schema preflight for the WashLink certification review, contract disputes and the role-aware
-- dashboard summaries (W11 PLAN 3.1; D-10; w7a / w9a / w10a pattern).
-- The W11 guards, holds, RPCs, reads and summaries resolve columns and functions at run time; drift would surface later
-- as failing certificate changes, shop review requests or dashboard loads. This migration aborts instead, naming every
-- missing column / function, and refuses any pre-existing public relation or function named
-- certification_platform_review*, worker_contract_dispute* or *dashboard_summary* that W11 did not create (its comment
-- must start `W11`; w11i comments every W11 function). Read-only check: creates nothing. Sorts (and is staged) before
-- w11b..w11i. Idempotent.
-- =============================================================

do $$
declare
  missing text;
  foreign_objects text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'certifications.status', 'certifications.status_reason', 'certifications.shop_id', 'certifications.owner_id',
    'certifications.worker_id', 'certifications.expires_at', 'certifications.program_title_snapshot',
    'certifications.shop_name_snapshot',
    'certification_status_events.event', 'certification_status_events.reason', 'certification_status_events.review_request_id',
    'certification_status_events.actor_role',
    'certification_review_requests.status', 'certification_review_requests.requested_at',
    'certification_review_requests.decided_at', 'certification_review_requests.withdrawn_at',
    'worker_contracts.status', 'worker_contracts.sent_at', 'worker_contracts.ended_at', 'worker_contracts.ended_by',
    'worker_contracts.end_reason', 'worker_contracts.owner_id', 'worker_contracts.worker_id', 'worker_contracts.shop_id',
    'contract_versions.rendered_text', 'contract_versions.content_hash', 'contract_versions.sealed_at',
    'contract_acceptances.party_role', 'contract_acceptances.version_content_hash'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.is_super_admin()',
    'public.current_user_profile_role()',
    'public.shop_has_recorded_verification(uuid)',
    'public.certification_effective_status(text, timestamptz, timestamptz)',
    'public.certification_reason_or_fail(text)',
    'public.worker_contract_effective_status(text, date)',
    'public.worker_owner_relationship_derive(uuid, uuid, date)',
    'public.my_owner_relationship_progress()',
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)',
    'public.notification_safe_label(text, text)',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)',
    'public.training_enrollment_is_completed(uuid)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W11 preflight: missing columns/functions required by WashLink reviews, disputes and dashboards: % (D-10)', missing;
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
  where (x.name ~ '^(public\.)?(certification_platform_review|worker_contract_dispute)' or x.name ~ 'dashboard_summary')
    and x.note not like 'W11%';
  if foreign_objects is not null then
    raise exception 'W11 preflight: review / dispute / dashboard objects exist that W11 did not create: % (D-10)', foreign_objects;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
