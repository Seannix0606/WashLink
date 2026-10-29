-- =============================================================
-- WashLink W12a - schema preflight for the notification category registry and the scheduled workforce jobs (W12 PLAN
-- 3.1; D-10; w11a / w14a pattern).
-- The W12 registry trigger, job state guard, batch functions and runner resolve columns and functions at run time;
-- drift would surface later as silently skipped notices or failing scheduled runs. This migration aborts instead,
-- naming every missing column / function / the W3 writer trigger, and refuses any pre-existing public relation or
-- function named notification_categor* or workforce_scheduled_job* that W12 did not create (its comment must start
-- `W12`; w12e comments every W12 function and w12b / w12c every W12 table), and a trigger
-- notifications_guard_registered_category that W12 did not create. Re-run after W12 (idempotent): that trigger is
-- accepted only when public.notifications_guard_registered_category() already carries the `W12` comment.
-- NOTICE only (no abort): a scheduler job (`cron.job`) named washlink_% when a cron schema exists (registration is a
-- human step, P85). Existing notifications.category values missing from the seed are listed by w12b right after the seed.
-- Read-only check: creates nothing. Sorts (and is staged) before w12b..w12e.
-- =============================================================

do $$
declare
  missing text;
  foreign_objects text;
  w12_applied boolean;
  cron_jobs text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'notifications.id', 'notifications.recipient_id', 'notifications.category', 'notifications.title', 'notifications.body',
    'notifications.subject_type', 'notifications.subject_id', 'notifications.idempotency_key', 'notifications.created_at',
    'notifications.read_at',
    'worker_contracts.id', 'worker_contracts.worker_id', 'worker_contracts.owner_id', 'worker_contracts.status',
    'worker_contracts.end_date', 'worker_contracts.accepted_at', 'worker_contracts.pending_version_id',
    'worker_contracts.ended_at', 'worker_contracts.ended_by',
    'contract_versions.contract_id', 'contract_versions.version_number',
    'certifications.id', 'certifications.worker_id', 'certifications.status', 'certifications.expires_at'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.enqueue_notification(uuid, text, text, text, text, text, uuid)',
    'public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)',
    'public.notifications_guard_insert()',
    'public.enqueue_certification_expiry_notices(timestamptz)',
    'public.certification_effective_status(text, timestamptz, timestamptz)',
    'public.expire_worker_contracts(date)',
    'public.worker_contract_close_open_versions(uuid)',
    'public.refresh_worker_owner_relationship(uuid, uuid, date)',
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.is_trusted_db_session()',
    'public.is_super_admin()',
    'public.current_user_profile_role()'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if to_regprocedure('public.notifications_guard_insert()') is not null
     and not exists (select 1 from pg_trigger t where t.tgrelid = 'public.notifications'::regclass and not t.tgisinternal
                     and t.tgname = 'notifications_guard_insert'
                     and t.tgfoid = to_regprocedure('public.notifications_guard_insert()')) then
    missing := concat_ws(', ', nullif(missing, ''), 'trigger notifications.notifications_guard_insert');
  end if;

  if coalesce(missing, '') <> '' then
    raise exception 'W12 preflight: missing columns/functions required by the notification registry and scheduled jobs: % (D-10)', missing;
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
  where x.name ~ '^(public\.)?(notification_categor|workforce_scheduled_job)'
    and x.note not like 'W12%';
  if foreign_objects is not null then
    raise exception 'W12 preflight: registry / scheduled job objects exist that W12 did not create: % (D-10)', foreign_objects;
  end if;

  w12_applied := coalesce(obj_description(to_regprocedure('public.notifications_guard_registered_category()'), 'pg_proc') like 'W12%', false);
  if not w12_applied and exists (select 1 from pg_trigger t where t.tgrelid = 'public.notifications'::regclass and not t.tgisinternal
                                 and t.tgname = 'notifications_guard_registered_category') then
    raise exception 'W12 preflight: trigger notifications_guard_registered_category exists that W12 did not create (D-10)';
  end if;

  if to_regclass('cron.job') is not null then
    execute $q$select string_agg(jobname::text, ', ' order by jobname) from cron.job where jobname like 'washlink\_%'$q$ into cron_jobs;
    if cron_jobs is not null then
      raise notice 'W12 preflight: scheduler jobs already registered: % (registration is a human step; see the runbook)', cron_jobs;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W12 rollbacks in reverse order e..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
