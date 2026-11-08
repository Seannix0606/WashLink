-- =============================================================
-- WashLink W3a - pin pg_temp LAST in the search_path of every W2 / pre-W2 definer function
-- and the W2 invoker helpers (closes R-1, W2/REVIEW.md; W3 PLAN P10).
-- Without pg_temp listed, Postgres searches the temp schema FIRST for relations, so a session
-- that can create temp tables could shadow profiles / shops inside definer code.
-- ALTER only: no function body is touched and no committed migration is edited.
-- A listed signature that does not exist aborts the migration (production may differ, D-10).
-- The final block aborts if ANY security definer function in public / washlink_private still
-- lacks pg_temp in its search_path (except the documented baseline handle_new_user).
-- Not altered: the baseline-only handle_new_user() (production name unknown, P4; D-10 row 17).
-- Any later `create or replace` of these functions must keep `public, pg_temp`
-- (CREATE OR REPLACE resets proconfig).
-- Idempotent.
-- =============================================================

do $$
declare
  signature text;
  target regprocedure;
begin
  foreach signature in array array[
    -- W2 security definer
    'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)',
    'public.current_user_profile_role()',
    'public.sanitize_profile_role_on_insert()',
    'public.guard_profile_protected_columns()',
    'public.guard_shop_insert()',
    'public.prevent_owner_verification_mutation()',
    'public.submit_shop_for_verification(uuid)',
    'public.guard_verification_document_write()',
    'public.is_verified_shop_owner(uuid)',
    'public.guard_booking_insert()',
    'public.guard_booking_update()',
    'public.guard_worker_roster_write()',
    'public.approved_shop_names_for_owner(uuid)',
    'public.unlink_my_roster_entry(uuid)',
    'public.list_my_roster_links()',
    'public.roster_link_code_hash(text)',
    'public.require_worker_caller()',
    'public.roster_link_check_rate_limit(uuid, bytea)',
    'public.create_roster_link_code(uuid)',
    'public.preview_roster_link_code(text)',
    'public.accept_roster_link_code(text)',
    -- W2 security invoker
    'public.is_trusted_db_session()',
    'public.profile_protected_column_changes(jsonb, jsonb)',
    'public.normalize_worker_text_list(text[], integer, text)',
    'public.normalize_worker_profile()',
    'public.stamp_worker_private_contact()',
    -- pre-W2 security definer
    'public.is_super_admin()',
    'public.set_booking_quote_from_shop_pricing()'
  ] loop
    target := to_regprocedure(signature);
    if target is null then
      raise exception 'W3a: % not found, search_path cannot be pinned (resolve in the D-10 diff, row 17)', signature;
    end if;
    execute format('alter function %s set search_path = public, pg_temp', target);
  end loop;

  -- The storage helper also resolves auth.* objects.
  target := to_regprocedure('public.can_manage_shop_verification_storage(text)');
  if target is null then
    raise exception 'W3a: public.can_manage_shop_verification_storage(text) not found (resolve in the D-10 diff, row 17)';
  end if;
  execute format('alter function %s set search_path = public, auth, pg_temp', target);
end $$;

-- Final assertion: no SECURITY DEFINER function in public / washlink_private without pg_temp
-- in its search_path. Baseline-only exclusion: public.handle_new_user() (P4, D-10 row 17).
do $$
declare
  unpinned text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname in ('public', 'washlink_private')
    and not (n.nspname = 'public' and p.proname = 'handle_new_user' and p.pronargs = 0)
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) c
      where c like 'search_path=%'
        and 'pg_temp' = any (string_to_array(replace(substr(c, 13), ' ', ''), ','))
    );
  if unpinned is not null then
    raise exception 'W3a: SECURITY DEFINER functions without pg_temp in search_path: % (pin them; D-10 row 17)', unpinned;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W3 rollbacks in reverse order d..a)
-- Re-opens R-1 (temp-schema shadowing).
-- -------------------------------------------------------------
-- do $$
-- declare
--   signature text;
--   target regprocedure;
-- begin
--   foreach signature in array array[
--     'public.is_orphaned_fk_set_null(regclass, jsonb, jsonb)', 'public.current_user_profile_role()',
--     'public.sanitize_profile_role_on_insert()', 'public.guard_profile_protected_columns()',
--     'public.guard_shop_insert()', 'public.prevent_owner_verification_mutation()',
--     'public.submit_shop_for_verification(uuid)', 'public.guard_verification_document_write()',
--     'public.is_verified_shop_owner(uuid)', 'public.guard_booking_insert()',
--     'public.guard_booking_update()', 'public.guard_worker_roster_write()',
--     'public.approved_shop_names_for_owner(uuid)', 'public.unlink_my_roster_entry(uuid)',
--     'public.list_my_roster_links()', 'public.roster_link_code_hash(text)',
--     'public.require_worker_caller()', 'public.roster_link_check_rate_limit(uuid, bytea)',
--     'public.create_roster_link_code(uuid)', 'public.preview_roster_link_code(text)',
--     'public.accept_roster_link_code(text)', 'public.is_trusted_db_session()',
--     'public.profile_protected_column_changes(jsonb, jsonb)',
--     'public.normalize_worker_text_list(text[], integer, text)',
--     'public.normalize_worker_profile()', 'public.stamp_worker_private_contact()',
--     'public.is_super_admin()', 'public.set_booking_quote_from_shop_pricing()'
--   ] loop
--     target := to_regprocedure(signature);
--     if target is not null then
--       execute format('alter function %s set search_path = public', target);
--     end if;
--   end loop;
--   target := to_regprocedure('public.can_manage_shop_verification_storage(text)');
--   if target is not null then
--     execute format('alter function %s set search_path = public, auth', target);
--   end if;
-- end $$;
