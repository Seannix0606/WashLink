-- =============================================================
-- WashLink W12d - batch functions of the scheduled workforce jobs (W12 PLAN 3.4, P83, P84; D-64, D-65; closes W10
-- REVIEW S2 / S3 / C8; W12 fix cycle 1 N3 / N4). Requires w9c..w9j, w10e, w12a. Idempotent. Internal: revoked from
-- every client role (service_role included); only the w12e runner calls them. No W7 / W9 / W10 function body is
-- replaced: the raw expire_worker_contracts(date) / refresh_worker_owner_relationships(date) keep their test-clock
-- parameter and stay internal; these batches take NO date (Manila today / the W10 default) and never wait on a lock:
--   * candidates are read WITHOUT a row lock (N3), in id / pair order after a cursor;
--   * per item, inside its own subtransaction: the W10 pair lock is TRIED first (pg_try_advisory_xact_lock on the exact
--     w10e key; re-entrant in this session, so the w10e sync trigger then passes straight through), and only then the
--     contract row is locked FOR UPDATE SKIP LOCKED and its versions FOR UPDATE NOWAIT. A busy pair or row raises
--     55P03 inside the subtransaction, which rolls back and releases what that item took: a skipped item holds no lock;
--   * any other error of one item (N4) is caught the same way: nothing of that item is written, it is counted as
--     skipped_failed and only its SQLSTATE is kept (at most 10 distinct codes; no ids, no message text);
--   * both batches move a cursor past every item they looked at, so a persistently failing or busy item is retried on
--     the next pass and never holds back the items after it;
--   * the w12e runner sets lock_timeout 1 s as a backstop for any other lock an item meets (55P03 -> skipped).
-- An item the run has processed keeps its row / pair lock until the run commits (one transaction per run).
-- Batch size 1..200, else 22023.
-- =============================================================

-- R3: copies the w10e key expression (hashtextextended('w10:' || worker || ':' || owner, 0)); a later w10e change must
-- change both (j16_w12_scheduler_locking detects divergence). True when either id is null (no pair to protect).
create or replace function public.worker_owner_pair_try_lock(p_worker uuid, p_owner uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker is null or p_owner is null then
    return true;
  end if;
  return pg_try_advisory_xact_lock(hashtextextended('w10:' || p_worker::text || ':' || p_owner::text, 0));
end;
$$;

-- Accepted / active contracts whose end date is before Manila today, with id after p_after_contract (null = from the
-- start), in id order, at most p_limit -> expired (same update as w9g, by 'system'). The W9 producers audit and notify
-- each party once; the W10 sync trigger refreshes the pair. pass_completed when fewer than p_limit candidates were left
-- after the cursor; last_contract_id is the last candidate looked at (processed, skipped or failed).
drop function if exists public.expire_worker_contracts_batch(integer);
drop function if exists public.expire_worker_contracts_batch(uuid, integer);
create function public.expire_worker_contracts_batch(p_after_contract uuid, p_limit integer)
returns table (processed integer, skipped_locked integer, skipped_failed integer, failed_sqlstates text[], last_contract_id uuid,
               pass_completed boolean, remaining integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  target record;
  seen integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Batch size must be between 1 and 200.' using errcode = '22023';
  end if;
  processed := 0;
  skipped_locked := 0;
  skipped_failed := 0;
  failed_sqlstates := '{}';
  for target in
    select c.id, c.worker_id, c.owner_id from public.worker_contracts c
    where c.status in ('accepted', 'active') and c.end_date < today and (p_after_contract is null or c.id > p_after_contract)
    order by c.id
    limit p_limit
  loop
    seen := seen + 1;
    last_contract_id := target.id;
    begin
      if not public.worker_owner_pair_try_lock(target.worker_id, target.owner_id) then
        raise exception 'W12: pair busy.' using errcode = '55P03';
      end if;
      perform 1 from public.worker_contracts c
      where c.id = target.id and c.status in ('accepted', 'active') and c.end_date < today
      for update skip locked;
      if not found then
        if exists (select 1 from public.worker_contracts c
                   where c.id = target.id and c.status in ('accepted', 'active') and c.end_date < today) then
          raise exception 'W12: contract busy.' using errcode = '55P03';
        end if;
        raise exception 'W12: no longer due.' using errcode = 'W12ND';   -- changed meanwhile: release the pair lock
      end if;
      perform 1 from public.contract_versions v where v.contract_id = target.id order by v.version_number for update nowait;
      perform set_config('washlink.worker_contract_write', target.id::text, true);
      perform public.worker_contract_close_open_versions(target.id);
      update public.worker_contracts
      set status = 'expired', ended_at = now(), ended_by = 'system', pending_version_id = null
      where id = target.id and status in ('accepted', 'active');
      perform set_config('washlink.worker_contract_write', '', true);
      processed := processed + 1;
    exception
      when lock_not_available then
        skipped_locked := skipped_locked + 1;
      when sqlstate 'W12ND' then
        null;
      when others then
        skipped_failed := skipped_failed + 1;
        if not (sqlstate = any (failed_sqlstates)) and cardinality(failed_sqlstates) < 10 then
          failed_sqlstates := failed_sqlstates || sqlstate;
        end if;
    end;
  end loop;
  perform set_config('washlink.worker_contract_write', '', true);
  pass_completed := seen < p_limit;
  select count(*)::integer into remaining from public.worker_contracts c
  where c.status in ('accepted', 'active') and c.end_date < today;
  return next;
end;
$$;

-- Distinct (worker, owner) pairs with an accepted contract after the cursor, in order, at most p_limit; each pair is
-- refreshed by the W10 function with its default date (Manila today) inside its own subtransaction. A pair whose lock is
-- busy is skipped_locked, a pair whose refresh raises is skipped_failed (SQLSTATE only); both are retried on the next
-- pass and the cursor still moves past them. pass_completed when fewer than p_limit pairs were left after the cursor.
drop function if exists public.refresh_worker_owner_relationships_batch(uuid, uuid, integer);
create function public.refresh_worker_owner_relationships_batch(p_after_worker uuid, p_after_owner uuid, p_limit integer)
returns table (processed integer, changed integer, skipped_locked integer, skipped_failed integer, failed_sqlstates text[],
               last_worker_id uuid, last_owner_id uuid, pass_completed boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  pair record;
  seen integer := 0;
  from_start boolean := p_after_worker is null or p_after_owner is null;
begin
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Batch size must be between 1 and 200.' using errcode = '22023';
  end if;
  processed := 0;
  changed := 0;
  skipped_locked := 0;
  skipped_failed := 0;
  failed_sqlstates := '{}';
  for pair in
    select distinct c.worker_id, c.owner_id from public.worker_contracts c
    where c.accepted_at is not null and c.worker_id is not null and c.owner_id is not null
      and (from_start or (c.worker_id, c.owner_id) > (p_after_worker, p_after_owner))
    order by c.worker_id, c.owner_id
    limit p_limit
  loop
    seen := seen + 1;
    last_worker_id := pair.worker_id;
    last_owner_id := pair.owner_id;
    begin
      if not public.worker_owner_pair_try_lock(pair.worker_id, pair.owner_id) then
        raise exception 'W12: pair busy.' using errcode = '55P03';
      end if;
      if public.refresh_worker_owner_relationship(pair.worker_id, pair.owner_id) then
        changed := changed + 1;
      end if;
      processed := processed + 1;
    exception
      when lock_not_available then
        skipped_locked := skipped_locked + 1;
      when others then
        skipped_failed := skipped_failed + 1;
        if not (sqlstate = any (failed_sqlstates)) and cardinality(failed_sqlstates) < 10 then
          failed_sqlstates := failed_sqlstates || sqlstate;
        end if;
    end;
  end loop;
  pass_completed := seen < p_limit;
  return next;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['worker_owner_pair_try_lock(uuid, uuid)', 'expire_worker_contracts_batch(uuid, integer)',
    'refresh_worker_owner_relationships_batch(uuid, uuid, integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W12 rollbacks in reverse order e..a; roll back w12e first, which calls these)
-- -------------------------------------------------------------
-- drop function if exists public.refresh_worker_owner_relationships_batch(uuid, uuid, integer);
-- drop function if exists public.expire_worker_contracts_batch(uuid, integer);
-- drop function if exists public.worker_owner_pair_try_lock(uuid, uuid);
