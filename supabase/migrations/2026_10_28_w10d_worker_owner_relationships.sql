-- =============================================================
-- WashLink W10d - worker-to-owner relationships (W10 PLAN 3.4, P55, P58, P61; D-36, D-38). Requires w2a, w5b, w9c,
-- w10a. Idempotent.
-- One row per (worker, owner), derived from the W9 contracts and kept in sync by the w10e triggers. Contracts are the
-- source of truth (P55): no client role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE, write
-- policies deny all, and the BEFORE guard (every session) allows an INSERT / UPDATE only under the transaction-local
-- flag washlink.owner_relationship_write = <worker_id>:<owner_id> set by the internal refresh. A trusted session
-- cannot write rows without deliberately setting the internal flag; the audit trigger (w10g) still records such
-- writes. Owner account removed (FK set null): the row becomes owner_removed (terminal, the owner
-- name snapshot stays for the worker). Worker account removed: the rows go with the worker profile (cascade).
-- Direct reads: the worker its own rows only. Owners read their rows only through owner_worker_relationships()
-- (w10f), never counts_toward_goal or qualifying_contract_count (D-38); nobody else (W11 adds dispute access).
-- =============================================================

create table if not exists public.worker_owner_relationships (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null deferrable initially deferred,
  owner_name_snapshot text not null,
  worker_name_snapshot text not null,
  status text not null,
  status_reason text not null,
  counts_toward_goal boolean generated always as (status = 'active') stored,
  qualifying_contract_count integer not null default 0,
  first_accepted_at timestamptz not null,
  last_active_at timestamptz,
  ended_at timestamptz,
  owner_removed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  constraint wor_worker_owner_unique unique (worker_id, owner_id),
  constraint wor_status_check check (status in ('pending_start', 'active', 'suspended', 'ended', 'owner_removed')),
  constraint wor_status_reason_check check (status_reason in ('contract_accepted_not_started', 'contract_active',
    'owner_verification_not_current', 'shop_removed', 'shop_owner_changed', 'owner_role_changed', 'contract_terminated',
    'contract_expired', 'owner_account_removed')),
  constraint wor_reason_matches_status check (
    (status = 'pending_start' and status_reason = 'contract_accepted_not_started')
    or (status = 'active' and status_reason = 'contract_active')
    or (status = 'suspended' and status_reason in ('owner_verification_not_current', 'shop_removed', 'shop_owner_changed', 'owner_role_changed'))
    or (status = 'ended' and status_reason in ('contract_terminated', 'contract_expired'))
    or (status = 'owner_removed' and status_reason = 'owner_account_removed')),
  constraint wor_owner_removed_consistency check (((status = 'owner_removed') = (owner_id is null))
                                                  and (status <> 'owner_removed' or owner_removed_at is not null)),
  constraint wor_qualifying_count_check check ((status = 'active' and qualifying_contract_count >= 1)
                                               or (status <> 'active' and qualifying_contract_count = 0)),
  constraint wor_ended_consistency check (status <> 'ended' or ended_at is not null),
  constraint wor_snapshot_lengths check (char_length(owner_name_snapshot) <= 200 and char_length(worker_name_snapshot) <= 200),
  constraint wor_revision_check check (revision >= 1)
);
create index if not exists worker_owner_relationships_worker_status_idx on public.worker_owner_relationships (worker_id, status);
create index if not exists worker_owner_relationships_owner_status_idx on public.worker_owner_relationships (owner_id, status);
comment on table public.worker_owner_relationships is
  'W10: derived worker-to-owner relationship (D-36), one row per (worker, owner), created at the first accepted contract and kept in sync with the W9 contracts by WashLink only. Statuses pending_start / active / suspended / ended / owner_removed; only active counts toward the informational three-distinct-owner goal (D-3).';

-- -------------------------------------------------------------
-- 1) Guard (definer; every session)
-- -------------------------------------------------------------
create or replace function public.worker_owner_relationships_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.owner_relationship_write', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id) then
      return old;   -- FK cascade: the worker account is gone
    end if;
    raise exception 'Owner relationships are kept by WashLink.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'owner_removed' then
      raise exception 'Owner relationships are changed only by WashLink.' using errcode = '42501';
    end if;
    -- counts_toward_goal is generated (not computed yet in a BEFORE trigger): compared without it.
    if public.is_orphaned_fk_set_null('public.worker_owner_relationships'::regclass, to_jsonb(old) - 'counts_toward_goal',
                                      to_jsonb(new) - 'counts_toward_goal') then
      new.status := 'owner_removed';   -- the owner account was deleted: terminal
      new.status_reason := 'owner_account_removed';
      new.qualifying_contract_count := 0;
      new.owner_removed_at := now();
      new.status_changed_at := now();
      new.revision := old.revision + 1;
      new.updated_at := now();
      return new;
    end if;
    if write_flag is distinct from (old.worker_id::text || ':' || coalesce(old.owner_id::text, ''))
       or new.id is distinct from old.id or new.worker_id is distinct from old.worker_id or new.owner_id is distinct from old.owner_id
       or new.first_accepted_at is distinct from old.first_accepted_at or new.created_at is distinct from old.created_at then
      raise exception 'Owner relationships are changed only by WashLink.' using errcode = '42501';
    end if;
    new.owner_removed_at := old.owner_removed_at;
    new.revision := old.revision + 1;
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
    else
      new.status_changed_at := old.status_changed_at;
    end if;
    return new;
  end if;
  if new.owner_id is null or write_flag is distinct from (new.worker_id::text || ':' || new.owner_id::text) then
    raise exception 'Owner relationships are changed only by WashLink.' using errcode = '42501';
  end if;
  new.owner_removed_at := null;
  new.revision := 1;
  new.status_changed_at := now();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.worker_owner_relationships_guard_write() from public, anon, authenticated, service_role;
drop trigger if exists worker_owner_relationships_guard_write on public.worker_owner_relationships;
create trigger worker_owner_relationships_guard_write
  before insert or update or delete on public.worker_owner_relationships
  for each row execute function public.worker_owner_relationships_guard_write();

-- -------------------------------------------------------------
-- 2) RLS (select only): the worker its own rows. Owners have no direct read (D-38): they use the definer RPC
--    owner_worker_relationships() (w10f), which never returns the goal, counts or other owners.
-- -------------------------------------------------------------
alter table public.worker_owner_relationships enable row level security;
revoke all on table public.worker_owner_relationships from public, anon, authenticated, service_role;
grant select on table public.worker_owner_relationships to authenticated;
drop policy if exists "wor_select_parties" on public.worker_owner_relationships;
drop policy if exists "wor_select_own_worker" on public.worker_owner_relationships;
create policy "wor_select_own_worker" on public.worker_owner_relationships
  for select to authenticated
  using (worker_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false));
drop policy if exists "worker_owner_relationships_no_client_insert" on public.worker_owner_relationships;
create policy "worker_owner_relationships_no_client_insert" on public.worker_owner_relationships
  for insert to authenticated with check (false);
drop policy if exists "worker_owner_relationships_no_client_update" on public.worker_owner_relationships;
create policy "worker_owner_relationships_no_client_update" on public.worker_owner_relationships
  for update to authenticated using (false);
drop policy if exists "worker_owner_relationships_no_client_delete" on public.worker_owner_relationships;
create policy "worker_owner_relationships_no_client_delete" on public.worker_owner_relationships
  for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 3) Realtime: neither W10 table is ever published (w9i pattern).
-- -------------------------------------------------------------
do $$
declare
  published text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W10d: supabase_realtime is FOR ALL TABLES and would publish the owner relationship tables (D-10 diff). Aborting.';
  end if;
  for published in
    select pt.tablename::text from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
      and pt.tablename in ('workforce_policies', 'worker_owner_relationships')
  loop
    execute format('alter publication supabase_realtime drop table public.%I', published);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a; roll back w10g, w10f and w10e first)
-- IRREVERSIBLE for the stored rows (status history, owner_removed snapshots): export first with a trusted
--   copy public.worker_owner_relationships to '<file>'. Every non-owner_removed row is re-derivable from the contracts
--   by re-applying w10d..w10g (the w10g backfill).
-- -------------------------------------------------------------
-- drop table if exists public.worker_owner_relationships;   -- drops its guard trigger, policies and indexes
-- drop function if exists public.worker_owner_relationships_guard_write();
