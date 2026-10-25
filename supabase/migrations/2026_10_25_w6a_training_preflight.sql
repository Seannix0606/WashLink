-- =============================================================
-- WashLink W6a - schema preflight for training (D-10 rows 29 and 30; w3d0 / w4a / w5a pattern).
-- The W6 guards, RPCs, booking gate and producers resolve columns and functions at run time;
-- drift would surface later as failing training actions, booking assignments or account
-- deletions. This migration aborts instead, naming every missing column / function, and refuses
-- any pre-existing `public.training_*` table that W6 did not create (comment must start `W6`).
-- Read-only check: creates nothing. Sorts (and is staged) before w6b..w6i. Idempotent.
-- =============================================================

do $$
declare
  missing text;
  foreign_tables text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.address',
    'workers.id', 'workers.owner_id', 'workers.user_id',
    'bookings.id', 'bookings.shop_id', 'bookings.assigned_worker_id', 'bookings.booking_status',
    'worker_profiles.profile_id',
    'profiles.id', 'profiles.role', 'profiles.full_name',
    'job_applications.id', 'job_applications.shop_id', 'job_applications.owner_id',
    'job_applications.worker_id', 'job_applications.status',
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
    'public.is_verified_shop_owner(uuid)',
    'public.shop_has_recorded_verification(uuid)',
    'public.current_user_profile_role()',
    'public.is_trusted_db_session()',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)',
    'public.normalize_worker_text_list(text[], integer, text)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W6 preflight: missing columns/functions required by training: % (D-10 row 30)', missing;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into foreign_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'p')
    and c.relname like 'training\_%'
    and coalesce(obj_description(c.oid, 'pg_class'), '') not like 'W6%';
  if foreign_tables is not null then
    raise exception 'W6 preflight: training objects exist that W6 did not create: % (D-10 row 29)', foreign_tables;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
