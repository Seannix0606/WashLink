-- =============================================================
-- WashLink W13a - schema preflight for the W13 hardening (W13 PLAN 3.1; D-10; w11a / w14a pattern).
-- W13 drops the W3 raw super_admin audit select (w13b), adds a paged moderation queue (w13c) and replaces exactly one
-- function body, worker_contracts_audit() (w13d, the two contract expiry notice strings only). This migration aborts
-- instead of letting a later step fail half way, naming every missing object:
--   table workforce_audit_events, view shop_verification_review_log, functions admin_workforce_audit_log(...),
--   admin_job_opening_moderation_queue(text), worker_contracts_audit(), worker_contract_notify(uuid,uuid,bigint,text,text).
-- D-10 drift: it also aborts unless md5(prosrc) of worker_contracts_audit() is exactly the w9j body
-- (70f3611014d8f651ce15dc230a820540) or the w13d body (aebb4ecc7ac975d3c1d47dc20307774a, a re-run after W13); any other
-- production body must be reviewed by a human before w13d replaces it (fix cycle 1, W13 S4: the whole body is pinned,
-- not two strings). It also aborts when admin_job_opening_moderation_queue_page (or an overload) exists without a comment
-- that STARTS with `W13:` (W13 S4: a `W13` anywhere in the comment no longer counts). It only RAISES A NOTICE (no abort)
-- naming every select policy on workforce_audit_events other than wae_select_super_admin / wae_no_client_select (unknown
-- production policies, D-10). w13b makes wae_no_client_select RESTRICTIVE (W13 S1), so such a policy can no longer open
-- raw reads, but DEPLOYMENT_READINESS still requires a human to drop it. Re-run after W13 is idempotent (both pins hold).
-- Read-only check: creates nothing. Sorts (and is staged) before w13b..w13d.
-- =============================================================

do $$
declare
  missing text;
  audit_fn oid := to_regprocedure('public.worker_contracts_audit()');
  body_md5 text;
  page_fn oid := to_regprocedure('public.admin_job_opening_moderation_queue_page(text, timestamptz, uuid, integer)');
  other_policies text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from (
    select 'table public.workforce_audit_events' as item
    where to_regclass('public.workforce_audit_events') is null
       or (select c.relkind from pg_class c where c.oid = to_regclass('public.workforce_audit_events')) <> 'r'
    union all
    select 'view public.shop_verification_review_log'
    where to_regclass('public.shop_verification_review_log') is null
       or (select c.relkind from pg_class c where c.oid = to_regclass('public.shop_verification_review_log')) <> 'v'
    union all
    select 'function ' || f.sig
    from unnest(array[
      'public.admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer)',
      'public.admin_job_opening_moderation_queue(text)',
      'public.worker_contracts_audit()',
      'public.worker_contract_notify(uuid, uuid, bigint, text, text)',
      'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
      'public.is_super_admin()',
      'public.current_user_profile_role()'
    ]) as f(sig)
    where to_regprocedure(f.sig) is null
  ) r;
  if coalesce(missing, '') <> '' then
    raise exception 'W13 preflight: missing objects required by the W13 hardening: % (D-10)', missing;
  end if;

  select md5(p.prosrc) into body_md5 from pg_proc p where p.oid = audit_fn;
  if body_md5 not in ('70f3611014d8f651ce15dc230a820540',    -- w9j body (lines 31..115 of the w9j function), before W13
                      'aebb4ecc7ac975d3c1d47dc20307774a') then -- w13d body, a re-run after W13
    raise exception 'W13 preflight: worker_contracts_audit() is neither the w9j nor the w13d body (md5 %); a human must review it before w13d replaces it (D-10)',
      body_md5;
  end if;

  if page_fn is not null and coalesce(obj_description(page_fn, 'pg_proc'), '') not like 'W13:%' then
    raise exception 'W13 preflight: admin_job_opening_moderation_queue_page exists but W13 did not create it (D-10)';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_job_opening_moderation_queue_page'
             and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'W13:%') then
    raise exception 'W13 preflight: an admin_job_opening_moderation_queue_page overload exists that W13 did not create (D-10)';
  end if;

  select string_agg(format('%I (%s)', p.policyname, array_to_string(p.roles, ',')), ', ' order by p.policyname) into other_policies
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'workforce_audit_events' and p.cmd in ('SELECT', 'ALL')
    and p.policyname not in ('wae_select_super_admin', 'wae_no_client_select');
  if other_policies is not null then
    raise notice 'W13 preflight: workforce_audit_events has select policies W3 / W13 did not create: % (review them, D-10)', other_policies;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W13 rollbacks in reverse order d..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
