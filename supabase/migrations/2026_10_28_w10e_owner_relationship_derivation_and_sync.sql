-- =============================================================
-- WashLink W10e - owner relationship derivation, distinct-owner count and sync triggers (W10 PLAN 3.5, P56-P59, P63;
-- D-3, D-36; W9 REVIEW C6). Requires w4b, w9c..w9j, w10a, w10b, w10d. Idempotent.
-- Every function here is internal: definer, pinned, revoked from every client role.
-- P56 qualifying contract as of Manila date d: worker and owner set; status active and not (end_date < d); activated,
--   not ended; a worker acceptance of the current version whose hash equals that version's content_hash; a shop of the
--   SAME owner (C6) with a recorded verification; the owner's profile role is owner.
-- P57 count = count(distinct owner_id) over qualifying contracts, computed live from contracts only (never from
--   relationship rows, shops, openings, applications, roster links, training or certificates).
-- P58 relationship status precedence: active > suspended > pending_start > ended.
-- P59 the sync triggers are AFTER triggers with no RAISE on any contract or relationship state: they can never block a
--   worker's decline or termination. No trigger here reads workforce_policies. Pairs whose worker profile or owner
--   profile no longer exists are skipped (the w10d FK cascade / set-null handles them).
-- Lock order: worker_contracts row (W9 RPC) -> shops row -> pair advisory lock -> relationship row; the refresh
--   derives AFTER taking the pair lock (new statement snapshot under READ COMMITTED). Shop / profile triggers refresh
--   pairs in (worker_id, owner_id) order.
-- =============================================================

create or replace function public.worker_contract_qualifies(p_contract_id uuid, p_as_of date)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select c.worker_id is not null and c.owner_id is not null
           and c.status = 'active' and not coalesce(c.end_date < coalesce(p_as_of, (now() at time zone 'Asia/Manila')::date), false)
           and c.activated_at is not null and c.ended_at is null and c.shop_id is not null
           and exists (select 1 from public.contract_versions v join public.contract_acceptances a on a.version_id = v.id
                       where v.id = c.current_version_id and v.contract_id = c.id and a.contract_id = c.id and a.party_role = 'worker'
                         and v.content_hash is not null and a.version_content_hash = v.content_hash)
           and exists (select 1 from public.shops s where s.id = c.shop_id and s.owner_id = c.owner_id)
           and public.shop_has_recorded_verification(c.shop_id)
           and exists (select 1 from public.profiles p where p.id = c.owner_id and p.role::text = 'owner')
    from public.worker_contracts c where c.id = p_contract_id), false);
$$;

create or replace function public.worker_distinct_qualifying_owner_count(p_worker uuid, p_as_of date default null)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(distinct c.owner_id)::integer from public.worker_contracts c
  where p_worker is not null and c.worker_id = p_worker and c.owner_id is not null and c.status = 'active'
    and public.worker_contract_qualifies(c.id, coalesce(p_as_of, (now() at time zone 'Asia/Manila')::date));
$$;

-- One row always; status is null when the pair has no accepted contract.
create or replace function public.worker_owner_relationship_derive(p_worker uuid, p_owner uuid, p_as_of date default null)
returns table (status text, status_reason text, qualifying_contract_count integer, first_accepted_at timestamptz, has_accepted_contract boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := coalesce(p_as_of, (now() at time zone 'Asia/Manila')::date);
  qualifying integer;
  first_at timestamptz;
  any_live_active boolean;
  any_live_accepted boolean;
  last_expired boolean;
begin
  select count(*) filter (where public.worker_contract_qualifies(c.id, d)), min(c.accepted_at),
         coalesce(bool_or(c.status = 'active' and not coalesce(c.end_date < d, false) and c.ended_at is null), false),
         coalesce(bool_or(c.status = 'accepted' and not coalesce(c.end_date < d, false) and c.ended_at is null), false)
  into qualifying, first_at, any_live_active, any_live_accepted
  from public.worker_contracts c
  where p_worker is not null and p_owner is not null and c.worker_id = p_worker and c.owner_id = p_owner and c.accepted_at is not null;
  first_accepted_at := first_at;
  has_accepted_contract := first_at is not null;
  qualifying_contract_count := 0;
  if first_at is null then
    return next;
    return;
  end if;
  if qualifying > 0 then
    status := 'active';
    status_reason := 'contract_active';
    qualifying_contract_count := qualifying;
  elsif any_live_active then
    status := 'suspended';
    select case when bool_or(c.shop_id is null) then 'shop_removed'
                when bool_or(not exists (select 1 from public.shops s where s.id = c.shop_id and s.owner_id = c.owner_id)) then 'shop_owner_changed'
                when not exists (select 1 from public.profiles p where p.id = p_owner and p.role::text = 'owner') then 'owner_role_changed'
                else 'owner_verification_not_current' end
    into status_reason
    from public.worker_contracts c
    where c.worker_id = p_worker and c.owner_id = p_owner and c.status = 'active' and not coalesce(c.end_date < d, false)
      and c.ended_at is null and not public.worker_contract_qualifies(c.id, d);
  elsif any_live_accepted then
    status := 'pending_start';
    status_reason := 'contract_accepted_not_started';
  else
    status := 'ended';
    select c.status = 'expired' or (c.status in ('accepted', 'active') and coalesce(c.end_date < d, false)) into last_expired
    from public.worker_contracts c
    where c.worker_id = p_worker and c.owner_id = p_owner and c.accepted_at is not null
    order by coalesce(c.ended_at, ((c.end_date + 1)::timestamp at time zone 'Asia/Manila'), c.accepted_at) desc, c.id
    limit 1;
    status_reason := case when coalesce(last_expired, false) then 'contract_expired' else 'contract_terminated' end;
  end if;
  return next;
end;
$$;

-- Internal refresh of one pair (as of p_as_of, default Manila today). Returns true when the stored row changed.
-- No RAISE for any contract state; a no-op when either half is null or gone, or when the pair has no accepted
-- contract and no row.
create or replace function public.refresh_worker_owner_relationship(p_worker uuid, p_owner uuid, p_as_of date default null)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record;
  snap record;
  row_exists boolean;
  changed boolean;
begin
  if p_worker is null or p_owner is null
     or not exists (select 1 from public.worker_profiles wp where wp.profile_id = p_worker)
     or not exists (select 1 from public.profiles p where p.id = p_owner) then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('w10:' || p_worker::text || ':' || p_owner::text, 0));
  select * into r from public.worker_owner_relationship_derive(p_worker, p_owner, p_as_of);
  row_exists := exists (select 1 from public.worker_owner_relationships x where x.worker_id = p_worker and x.owner_id = p_owner);
  if not r.has_accepted_contract then
    if not row_exists then
      return false;
    end if;
    r.status := 'ended';   -- unreachable through W9 (accepted contracts are never deleted while both parties exist)
    r.status_reason := 'contract_terminated';
    r.qualifying_contract_count := 0;
  end if;
  select left(c.owner_name_snapshot, 200) as owner_name, left(c.worker_name_snapshot, 200) as worker_name into snap
  from public.worker_contracts c
  where c.worker_id = p_worker and c.owner_id = p_owner and c.accepted_at is not null
  order by c.accepted_at desc, c.id limit 1;
  perform set_config('washlink.owner_relationship_write', p_worker::text || ':' || p_owner::text, true);
  insert into public.worker_owner_relationships as w (worker_id, owner_id, owner_name_snapshot, worker_name_snapshot, status,
                                                      status_reason, qualifying_contract_count, first_accepted_at, last_active_at, ended_at)
  values (p_worker, p_owner, coalesce(snap.owner_name, 'Shop owner'), coalesce(snap.worker_name, 'Worker'), r.status, r.status_reason,
          r.qualifying_contract_count, coalesce(r.first_accepted_at, now()),
          case when r.status = 'active' then now() end, case when r.status = 'ended' then now() end)
  on conflict (worker_id, owner_id) do update
    set status = excluded.status, status_reason = excluded.status_reason, qualifying_contract_count = excluded.qualifying_contract_count,
        last_active_at = case when excluded.status = 'active' and w.status <> 'active' then now() else w.last_active_at end,
        ended_at = case when excluded.status <> 'ended' then null when w.status = 'ended' then w.ended_at else now() end
    where (w.status, w.status_reason, w.qualifying_contract_count)
          is distinct from (excluded.status, excluded.status_reason, excluded.qualifying_contract_count)
  returning true into changed;
  perform set_config('washlink.owner_relationship_write', '', true);
  return coalesce(changed, false);
end;
$$;

-- Internal (W12 schedules it): refreshes every pair with an accepted contract; returns the number of rows changed.
create or replace function public.refresh_worker_owner_relationships(p_as_of date default null)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Manila')::date);
  pair record;
  changed_count integer := 0;
begin
  if as_of < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The refresh date cannot be in the past.' using errcode = '22023';
  end if;
  for pair in select distinct c.worker_id, c.owner_id from public.worker_contracts c
              where c.accepted_at is not null and c.worker_id is not null and c.owner_id is not null
              order by c.worker_id, c.owner_id loop
    if public.refresh_worker_owner_relationship(pair.worker_id, pair.owner_id, as_of) then
      changed_count := changed_count + 1;
    end if;
  end loop;
  return changed_count;
end;
$$;

-- -------------------------------------------------------------
-- Sync triggers (AFTER; no RAISE)
-- -------------------------------------------------------------
create or replace function public.worker_contracts_sync_owner_relationship()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and not (new.status is distinct from old.status or new.owner_id is distinct from old.owner_id
     or new.shop_id is distinct from old.shop_id or new.worker_id is distinct from old.worker_id or new.end_date is distinct from old.end_date
     or new.activated_at is distinct from old.activated_at or new.ended_at is distinct from old.ended_at
     or new.accepted_at is distinct from old.accepted_at or new.current_version_id is distinct from old.current_version_id) then
    return null;
  end if;
  perform public.refresh_worker_owner_relationship(new.worker_id, new.owner_id);
  if tg_op = 'UPDATE' and (new.worker_id is distinct from old.worker_id or new.owner_id is distinct from old.owner_id) then
    perform public.refresh_worker_owner_relationship(old.worker_id, old.owner_id);
  end if;
  return null;
end;
$$;

create or replace function public.shops_sync_owner_relationships()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pair record;
begin
  for pair in select distinct c.worker_id, c.owner_id from public.worker_contracts c
              where c.shop_id = new.id and c.accepted_at is not null and c.worker_id is not null and c.owner_id is not null
              order by c.worker_id, c.owner_id loop
    perform public.refresh_worker_owner_relationship(pair.worker_id, pair.owner_id);
  end loop;
  return null;
end;
$$;

-- Owner role changes are trusted repairs only (D-8).
create or replace function public.profiles_sync_owner_relationships()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  pair record;
begin
  for pair in select distinct c.worker_id, c.owner_id from public.worker_contracts c
              where c.owner_id = new.id and c.accepted_at is not null and c.worker_id is not null
              order by c.worker_id, c.owner_id loop
    perform public.refresh_worker_owner_relationship(pair.worker_id, pair.owner_id);
  end loop;
  return null;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['worker_contract_qualifies(uuid, date)', 'worker_distinct_qualifying_owner_count(uuid, date)',
    'worker_owner_relationship_derive(uuid, uuid, date)', 'refresh_worker_owner_relationship(uuid, uuid, date)',
    'refresh_worker_owner_relationships(date)', 'worker_contracts_sync_owner_relationship()', 'shops_sync_owner_relationships()',
    'profiles_sync_owner_relationships()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
end $$;

drop trigger if exists worker_contracts_sync_owner_relationship on public.worker_contracts;
create trigger worker_contracts_sync_owner_relationship
  after insert or update on public.worker_contracts
  for each row execute function public.worker_contracts_sync_owner_relationship();
drop trigger if exists shops_sync_owner_relationships on public.shops;
create trigger shops_sync_owner_relationships
  after update of verification_status, verification_reviewed_by, verification_reviewed_at, is_active, owner_id on public.shops
  for each row
  when (old.verification_status is distinct from new.verification_status or old.verification_reviewed_by is distinct from new.verification_reviewed_by
        or old.verification_reviewed_at is distinct from new.verification_reviewed_at or old.is_active is distinct from new.is_active
        or old.owner_id is distinct from new.owner_id)
  execute function public.shops_sync_owner_relationships();
drop trigger if exists profiles_sync_owner_relationships on public.profiles;
create trigger profiles_sync_owner_relationships
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.profiles_sync_owner_relationships();

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a; roll back w10g and w10f first)
-- Drop the triggers FIRST so contract, shop and profile updates keep working.
-- -------------------------------------------------------------
-- drop trigger if exists worker_contracts_sync_owner_relationship on public.worker_contracts;
-- drop trigger if exists shops_sync_owner_relationships on public.shops;
-- drop trigger if exists profiles_sync_owner_relationships on public.profiles;
-- drop function if exists public.profiles_sync_owner_relationships(), public.shops_sync_owner_relationships(),
--   public.worker_contracts_sync_owner_relationship(), public.refresh_worker_owner_relationships(date),
--   public.refresh_worker_owner_relationship(uuid, uuid, date), public.worker_owner_relationship_derive(uuid, uuid, date),
--   public.worker_distinct_qualifying_owner_count(uuid, date), public.worker_contract_qualifies(uuid, date);
