-- =============================================================
-- WashLink W8a - schema preflight for contract templates (D-10 rows 36 and 37; w3d0 / w4a / w5a / w6a / w7a pattern).
-- The W8 guards, RPCs, reads and producers resolve columns and functions at run time; drift would surface later
-- as failing saves or account deletions. This migration aborts instead, naming every missing column / function,
-- and refuses any pre-existing `public.contract_*` / `public.worker_classification_options` relation that W8 did
-- not create (comment must start `W8`), and any pre-existing public function whose name contains `contract_template`
-- without a `W8` comment (w8h comments every W8 function). Read-only check: creates nothing. Sorts (and is staged)
-- before w8b..w8h.
-- Idempotent.
-- =============================================================

do $$
declare
  missing text;
  foreign_tables text;
  foreign_functions text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'profiles.id', 'profiles.role', 'profiles.full_name',
    'workforce_audit_events.id', 'workforce_audit_events.action'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.current_user_profile_role()',
    'public.is_super_admin()',
    'public.is_trusted_db_session()',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W8 preflight: missing columns/functions required by contract templates: % (D-10 row 37)', missing;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into foreign_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'm', 'p', 'f')
    and (left(c.relname, 9) = 'contract_' or c.relname = 'worker_classification_options')
    and coalesce(obj_description(c.oid, 'pg_class'), '') not like 'W8%';
  if foreign_tables is not null then
    raise exception 'W8 preflight: contract objects exist that W8 did not create: % (D-10 row 36)', foreign_tables;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into foreign_functions
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and strpos(p.proname, 'contract_template') > 0
    and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'W8%';
  if foreign_functions is not null then
    raise exception 'W8 preflight: contract template functions exist that W8 did not create: % (D-10 row 36)', foreign_functions;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
