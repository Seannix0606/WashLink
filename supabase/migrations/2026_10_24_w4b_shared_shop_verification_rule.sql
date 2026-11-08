-- =============================================================
-- WashLink W4b - one verified-shop rule (W4 PLAN P15; closes carry-forward R-2, W2/REVIEW.md).
-- Requires 2026_10_24_w2a, w2b, w2d, w3a and the w4a preflight. Idempotent.
--
-- shop_has_recorded_verification(shop) = approved AND verification_reviewed_by set AND
-- verification_reviewed_at set AND is_active. Used by:
--   - is_verified_shop_owner(uuid)        (publish / resume gate; same signature and result)
--   - approved_shop_names_for_owner(uuid) (roster link preview and list_my_roster_links)
--   - the worker read policy on job_openings (w4c)
-- Intended behaviour change (R-2, D-10 row 22): the roster preview / list_my_roster_links no
-- longer list approved shops without a recorded review.
-- CREATE OR REPLACE resets proconfig: every body below re-pins `public, pg_temp` (W3a).
-- =============================================================

-- -------------------------------------------------------------
-- 1) Shared predicate. Definer so RLS policies can call it as the caller; it reveals only
--    what the shops select policy already shows for approved active shops.
-- -------------------------------------------------------------
create or replace function public.shop_has_recorded_verification(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.shops s
    where s.id = p_shop_id
      and s.verification_status = 'approved'
      and s.verification_reviewed_by is not null
      and s.verification_reviewed_at is not null
      and s.is_active
  );
$$;

revoke all on function public.shop_has_recorded_verification(uuid) from public, anon;
grant execute on function public.shop_has_recorded_verification(uuid) to authenticated;

-- -------------------------------------------------------------
-- 2) Gate helper (w2b): same signature, same result, body uses the shared predicate.
-- -------------------------------------------------------------
create or replace function public.is_verified_shop_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_profile_role() = 'owner', false)
    and exists (
      select 1 from public.shops s
      where s.id = p_shop_id
        and s.owner_id = auth.uid()
    )
    and public.shop_has_recorded_verification(p_shop_id);
$$;

revoke all on function public.is_verified_shop_owner(uuid) from public, anon;
grant execute on function public.is_verified_shop_owner(uuid) to authenticated;

-- -------------------------------------------------------------
-- 3) Roster preview shop names (w2d): only shops with a recorded verification (R-2).
--    Same return type and ordering; internal (called by definer RPCs only).
-- -------------------------------------------------------------
create or replace function public.approved_shop_names_for_owner(p_owner_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(s.name order by s.name), '{}')
  from public.shops s
  where s.owner_id = p_owner_id and public.shop_has_recorded_verification(s.id);
$$;

revoke all on function public.approved_shop_names_for_owner(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W4 rollbacks in reverse order d, c, b, a;
-- run this block only after the w4c and w4d rollbacks). Re-opens R-2.
-- -------------------------------------------------------------
-- create or replace function public.is_verified_shop_owner(p_shop_id uuid)
-- returns boolean
-- language sql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
--   select coalesce(public.current_user_profile_role() = 'owner', false)
--     and exists (
--       select 1 from public.shops s
--       where s.id = p_shop_id
--         and s.owner_id = auth.uid()
--         and s.verification_status = 'approved'
--         and s.verification_reviewed_by is not null
--         and s.verification_reviewed_at is not null
--         and s.is_active
--     );
-- $$;
-- revoke all on function public.is_verified_shop_owner(uuid) from public, anon;
-- grant execute on function public.is_verified_shop_owner(uuid) to authenticated;
-- create or replace function public.approved_shop_names_for_owner(p_owner_id uuid)
-- returns text[]
-- language sql
-- stable
-- security definer
-- set search_path = public, pg_temp
-- as $$
--   select coalesce(array_agg(s.name order by s.name), '{}')
--   from public.shops s
--   where s.owner_id = p_owner_id and s.is_active and s.verification_status = 'approved';
-- $$;
-- revoke all on function public.approved_shop_names_for_owner(uuid) from public, anon, authenticated;
-- drop function if exists public.shop_has_recorded_verification(uuid);
