-- =============================================================
-- WashLink W4a - schema preflight for job openings (D-10 rows 21 and 23; w3d0 pattern).
-- The W4 guard, audit producer and verified-shop rule resolve columns and functions at run
-- time; drift would surface later as failing shop or account deletions (R5). This migration
-- aborts instead, naming every missing column / function, and refuses a pre-existing
-- `public.job_openings` that W4 did not create (its table comment must start with `W4`).
-- Read-only check: creates nothing. Sorts (and is staged) before w4b..w4d. Idempotent.
-- =============================================================

do $$
declare
  missing text;
  existing_comment text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'shops.id', 'shops.owner_id', 'shops.name', 'shops.address', 'shops.is_active',
    'shops.verification_status', 'shops.verification_reviewed_by', 'shops.verification_reviewed_at',
    'profiles.id', 'profiles.role',
    'workforce_audit_events.id', 'workforce_audit_events.action', 'workforce_audit_events.subject_type',
    'workforce_audit_events.subject_id', 'workforce_audit_events.payload'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.is_verified_shop_owner(uuid)',
    'public.approved_shop_names_for_owner(uuid)',
    'public.current_user_profile_role()',
    'public.is_trusted_db_session()',
    'public.is_super_admin()',
    'public.normalize_worker_text_list(text[], integer, text)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W4 preflight: missing columns/functions required by job openings: % (D-10 row 23)', missing;
  end if;

  if to_regclass('public.job_openings') is not null then
    existing_comment := obj_description('public.job_openings'::regclass, 'pg_class');
    if existing_comment is null or existing_comment not like 'W4%' then
      raise exception 'W4 preflight: public.job_openings already exists and was not created by W4 (D-10 row 21)';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W4 rollbacks in reverse order d, c, b, a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
