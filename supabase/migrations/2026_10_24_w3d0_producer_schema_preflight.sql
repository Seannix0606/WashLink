-- =============================================================
-- WashLink W3d0 - schema preflight for the W3d audit / notification producers (D-10 row 20).
-- plpgsql resolves columns at run time and an audit failure aborts the business action, so
-- column drift would surface later as failing shop updates, unlinks or account deletions.
-- This migration aborts instead, naming every missing column / function. Read-only check:
-- creates nothing. Sorts (and is staged) between w3c and w3d. Idempotent.
-- =============================================================

do $$
declare
  missing text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.address', 'shops.verification_status',
    'shops.verification_submitted_at', 'shops.verification_reviewed_by', 'shops.verification_reviewed_at',
    'worker_roster_link_codes.worker_row_id', 'worker_roster_link_codes.expires_at',
    'workers.id', 'workers.owner_id', 'workers.user_id', 'workers.name',
    'worker_profiles.profile_id', 'profiles.id', 'profiles.role',
    'workforce_audit_events.id', 'workforce_audit_events.subject_type', 'workforce_audit_events.subject_id',
    'workforce_audit_events.action', 'workforce_audit_events.payload', 'workforce_audit_events.actor_id',
    'workforce_audit_events.actor_role', 'workforce_audit_events.created_at'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));
  select concat_ws(', ', missing, string_agg(f.sig, ', ')) into missing
  from unnest(array[
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.enqueue_notification(uuid, text, text, text, text, text, uuid)',
    'public.notification_safe_label(text, text)', 'public.is_super_admin()', 'public.is_trusted_db_session()'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;
  if missing <> '' then
    raise exception 'W3d preflight: missing columns/functions required by the audit producers: % (D-10 row 20)', missing;
  end if;
end $$;

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W3 rollbacks in reverse order d, d0, c, b, a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
