-- =============================================================
-- WashLink W10f - owner relationship reads (W10 PLAN 3.6, P57, P61, P63; D-3, D-38). Requires w10c..w10e. Idempotent.
-- Definer, scoped to auth.uid(); a wrong role or no JWT returns 0 rows (no error, no existence oracle). Status, reason
-- and counts are derived LIVE as of Manila today (P63), so a passed end date shows `ended` before the expiry job runs.
-- Worker: own progress toward the informational goal (count, remaining, goal reached, policy) and own relationships.
-- Owner: own relationship rows with workers only (worker name snapshot, status, reason, contracts with this owner);
--   never the worker's total, remaining, goal or other owners (D-38). Nobody else reads anything here.
-- No contacts, contract text, pay, end reasons or notes. Granted to authenticated only.
-- status_changed_at is the stored "since" stamp; it is NULL when the live status differs from the stored one (e.g. an
-- end date passed before the expiry job ran), so the UI never shows a stale "since" date.
-- =============================================================

create or replace function public.my_owner_relationship_progress()
returns table (minimum_distinct_owners integer, default_minimum integer, qualifying_owner_count integer, remaining_owner_count integer,
               goal_reached boolean, enforcement text, policy_revision integer, counted_as_of date)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.integer_value, p.default_value, x.owner_count, greatest(p.integer_value - x.owner_count, 0), x.owner_count >= p.integer_value,
         p.enforcement, p.revision, x.as_of
  from public.workforce_policies p
  cross join lateral (select (now() at time zone 'Asia/Manila')::date as as_of) d
  cross join lateral (select d.as_of, public.worker_distinct_qualifying_owner_count(auth.uid(), d.as_of) as owner_count) x
  where p.policy_key = 'minimum_distinct_owners'
    and auth.uid() is not null and coalesce(public.current_user_profile_role() = 'worker', false);
$$;

create or replace function public.my_owner_relationships()
returns table (relationship_id uuid, owner_name text, owner_removed boolean, shop_names text[], status text, status_reason text,
               counts_toward_goal boolean, qualifying_contract_count integer, accepted_contract_count integer,
               first_accepted_at timestamptz, status_changed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.owner_name_snapshot, r.owner_id is null,
         coalesce((select array_agg(distinct c.shop_name_snapshot order by c.shop_name_snapshot) from public.worker_contracts c
                   where r.owner_id is not null and c.worker_id = r.worker_id and c.owner_id = r.owner_id and c.accepted_at is not null),
                  '{}'::text[]),
         coalesce(l.status, r.status), coalesce(l.status_reason, r.status_reason), coalesce(l.status, r.status) = 'active',
         coalesce(l.qualifying_contract_count, r.qualifying_contract_count),
         (select count(*)::integer from public.worker_contracts c
          where r.owner_id is not null and c.worker_id = r.worker_id and c.owner_id = r.owner_id and c.accepted_at is not null),
         r.first_accepted_at, case when coalesce(l.status, r.status) = r.status then r.status_changed_at end
  from public.worker_owner_relationships r
  left join lateral (select d.* from public.worker_owner_relationship_derive(r.worker_id, r.owner_id, null) d
                     where r.owner_id is not null and d.has_accepted_contract) l on true
  where r.worker_id = auth.uid() and auth.uid() is not null and coalesce(public.current_user_profile_role() = 'worker', false)
  order by array_position(array['active', 'suspended', 'pending_start', 'ended', 'owner_removed'], coalesce(l.status, r.status)),
           r.owner_name_snapshot, r.id;
$$;

create or replace function public.owner_worker_relationships()
returns table (relationship_id uuid, worker_id uuid, worker_name text, status text, status_reason text, contracts_with_you_count integer,
               first_accepted_at timestamptz, status_changed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.worker_id, r.worker_name_snapshot, coalesce(l.status, r.status), coalesce(l.status_reason, r.status_reason),
         (select count(*)::integer from public.worker_contracts c
          where c.worker_id = r.worker_id and c.owner_id = r.owner_id and c.accepted_at is not null),
         r.first_accepted_at, case when coalesce(l.status, r.status) = r.status then r.status_changed_at end
  from public.worker_owner_relationships r
  left join lateral (select d.* from public.worker_owner_relationship_derive(r.worker_id, r.owner_id, null) d
                     where d.has_accepted_contract) l on true
  where r.owner_id = auth.uid() and auth.uid() is not null and coalesce(public.current_user_profile_role() = 'owner', false)
  order by array_position(array['active', 'suspended', 'pending_start', 'ended'], coalesce(l.status, r.status)),
           r.worker_name_snapshot, r.id;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['my_owner_relationship_progress()', 'my_owner_relationships()', 'owner_worker_relationships()'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a)
-- -------------------------------------------------------------
-- drop function if exists public.owner_worker_relationships(), public.my_owner_relationships(), public.my_owner_relationship_progress();
