-- =============================================================
-- WashLink W10a - schema preflight for owner relationships and workforce policies (W10 PLAN 3.1; D-10; w9a pattern).
-- The W10 guards, derivation, sync triggers and reads resolve columns and functions at run time; drift would surface
-- later as failing contract, shop or profile updates. This migration aborts instead, naming every missing column /
-- function, and refuses any pre-existing public relation or function named workforce_polic* or
-- worker_owner_relationship* that W10 did not create (its comment must start `W10`; w10g comments every W10
-- function). Read-only check: creates nothing. Sorts (and is staged) before w10b..w10g.
-- Idempotent.
-- =============================================================

do $$
declare
  missing text;
  foreign_objects text;
begin
  select string_agg(r.item, ', ' order by r.item) into missing
  from unnest(array[
    'worker_contracts.status', 'worker_contracts.owner_id', 'worker_contracts.shop_id', 'worker_contracts.worker_id',
    'worker_contracts.activated_at', 'worker_contracts.ended_at', 'worker_contracts.accepted_at',
    'worker_contracts.current_version_id', 'worker_contracts.end_date', 'worker_contracts.owner_name_snapshot',
    'worker_contracts.worker_name_snapshot', 'worker_contracts.shop_name_snapshot',
    'contract_versions.content_hash',
    'contract_acceptances.party_role', 'contract_acceptances.version_id', 'contract_acceptances.version_content_hash',
    'shops.owner_id', 'shops.verification_status', 'shops.verification_reviewed_by', 'shops.verification_reviewed_at',
    'shops.is_active',
    'profiles.id', 'profiles.role', 'worker_profiles.profile_id'
  ]) as r(item)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(r.item, '.', 1)
      and c.column_name = split_part(r.item, '.', 2));

  select concat_ws(', ', missing, string_agg(f.sig, ', ' order by f.sig)) into missing
  from unnest(array[
    'public.worker_contracts_guard_write()',
    'public.worker_contract_effective_status(text, date)',
    'public.shop_has_recorded_verification(uuid)',
    'public.record_workforce_audit_event(text, text, uuid, uuid, jsonb)',
    'public.is_trusted_db_session()',
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)',
    'public.current_user_profile_role()',
    'public.is_super_admin()',
    'public.worker_contract_changed_by()',
    'public.contract_template_normalize_text(text)'
  ]) as f(sig)
  where to_regprocedure(f.sig) is null;

  if coalesce(missing, '') <> '' then
    raise exception 'W10 preflight: missing columns/functions required by owner relationships: % (D-10)', missing;
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
  where x.name ~ '^(public\.)?(workforce_polic|worker_owner_relationship)'
    and x.note not like 'W10%';
  if foreign_objects is not null then
    raise exception 'W10 preflight: owner relationship / workforce policy objects exist that W10 did not create: % (D-10)', foreign_objects;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a)
-- Nothing to roll back: this migration only asserts and creates no object.
-- -------------------------------------------------------------
