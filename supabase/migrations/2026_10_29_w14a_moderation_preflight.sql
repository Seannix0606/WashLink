-- =============================================================
-- WashLink W14a - schema preflight for job opening moderation, unreviewed approved shops, relationship lookups and
-- the redacted audit reads (W14 PLAN 3.1; D-10; w11a pattern).
-- The W14 guards, holds, RPCs and reads resolve columns and functions at run time; drift would surface later as
-- failing moderation actions or reads. This migration aborts instead, naming every missing column / function / the
-- W4 row trigger, and refuses any pre-existing public relation or function named job_opening_report*,
-- job_opening_moderation* or admin_access_record* that W14 did not create (its comment must start `W14`; w14i comments
-- every W14 function), and any trigger job_openings_guard_write_update, job_openings_guard_moderation,
-- job_openings_moderation_* or shops_zz_rereview_stamp that W14 did not create. Re-run after W14 (idempotent): those
-- triggers are accepted only when public.job_openings_guard_moderation() already carries the `W14` comment.
-- Read-only check: creates nothing. Sorts (and is staged) before w14b..w14i.
-- =============================================================

do $$
declare
  missing text;
  foreign_objects text;
  w14_applied boolean;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'job_openings.id', 'job_openings.shop_id', 'job_openings.owner_id', 'job_openings.status', 'job_openings.title',
    'job_openings.updated_at', 'job_openings.status_changed_at',
    'job_applications.job_opening_id', 'job_applications.status', 'job_applications.opening_snapshot',
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.is_active', 'shops.verification_status',
    'shops.verification_reviewed_by', 'shops.verification_reviewed_at', 'shops.verification_notes',
    'worker_owner_relationships.worker_id', 'worker_owner_relationships.owner_id', 'worker_owner_relationships.status',
    'worker_owner_relationships.status_reason', 'worker_owner_relationships.owner_name_snapshot',
    'worker_owner_relationships.worker_name_snapshot',
    'worker_contract_disputes.id', 'worker_contract_disputes.contract_id', 'worker_contract_disputes.status',
    'worker_contract_disputes.created_at',
    'workforce_audit_events.id', 'workforce_audit_events.actor_id', 'workforce_audit_events.actor_role',
    'workforce_audit_events.actor_kind', 'workforce_audit_events.action', 'workforce_audit_events.subject_type',
    'workforce_audit_events.subject_id', 'workforce_audit_events.subject_profile_id', 'workforce_audit_events.payload',
    'workforce_audit_events.created_at'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.job_openings_guard_write()',
    'public.job_opening_application_snapshot(public.job_openings)',
    'public.worker_has_applied_to_job_opening(uuid)',
    'public.shop_has_recorded_verification(uuid)',
    'public.is_super_admin()',
    'public.current_user_profile_role()',
    'public.is_trusted_db_session()',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)',
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)',
    'public.notification_safe_label(text, text)',
    'public.worker_distinct_qualifying_owner_count(uuid, date)',
    'public.publish_platform_contract_template_version(integer, jsonb)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.job_openings'::regclass and not t.tgisinternal
                 and t.tgname = 'job_openings_guard_write'
                 and t.tgfoid = to_regprocedure('public.job_openings_guard_write()')) then
    missing := concat_ws(', ', nullif(missing, ''), 'trigger job_openings.job_openings_guard_write');
  end if;

  if coalesce(missing, '') <> '' then
    raise exception 'W14 preflight: missing columns/functions required by job opening moderation and admin oversight: % (D-10)', missing;
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
  where x.name ~ '^(public\.)?(job_opening_report|job_opening_moderation|admin_access_record)'
    and x.note not like 'W14%';
  if foreign_objects is not null then
    raise exception 'W14 preflight: moderation / access objects exist that W14 did not create: % (D-10)', foreign_objects;
  end if;

  w14_applied := coalesce(obj_description(to_regprocedure('public.job_openings_guard_moderation()'), 'pg_proc') like 'W14%', false);
  select string_agg(t.tgname::text, ', ' order by t.tgname) into foreign_objects
  from pg_trigger t
  where not t.tgisinternal and not w14_applied
    and ((t.tgrelid = 'public.job_openings'::regclass
          and (t.tgname in ('job_openings_guard_write_update', 'job_openings_guard_moderation') or t.tgname like 'job_openings\_moderation\_%'))
         or (t.tgrelid = 'public.shops'::regclass and t.tgname = 'shops_zz_rereview_stamp'));
  if foreign_objects is not null then
    raise exception 'W14 preflight: triggers exist that W14 did not create: % (D-10)', foreign_objects;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
