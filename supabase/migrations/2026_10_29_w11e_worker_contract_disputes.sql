-- =============================================================
-- WashLink W11e - reported contract problems ("disputes") between the two parties of a worker contract, read by a
-- WashLink platform administrator while open (spec A, E, F; D-47; W11 PLAN 3.5, P69-P71). Requires w2a, w9c, w11a.
-- Idempotent.
-- A dispute never changes a contract (P69): no W11 function writes worker_contracts, contract_versions or acceptances,
-- and the W9 decline / terminate / accept / activate RPCs never read this table (J16).
-- P71: every INSERT / UPDATE goes through the W11 definer RPCs (w11f, w11g) under the transaction-local flag
--      washlink.contract_dispute_write = <dispute id>; no client role has a write grant; write policies deny all; a
--      trusted session without the flag is refused too. FK set-null (a party / the closing administrator removed)
--      passes; deletes only by cascade (the contract removed by W9 retention).
-- Immutable after insert: id, contract_id, raised_by_role, category, statement, contract_status_at_raise, created_at
-- (raised_by except its FK set-null). One response by the other party. open -> closed | withdrawn only; closed and
-- withdrawn rows are final. first_viewed_by_admin_at is stamped once and does not change the revision.
-- Reads: NO client raw select (deny-all select policy, fix cycle 1 N3); parties read through my_contract_disputes() and a
-- super_admin through the w11g queue (contract fields only while open, N4) and the audited case read (w11g).
-- =============================================================

create table if not exists public.worker_contract_disputes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.worker_contracts(id) on delete cascade,
  raised_by uuid references public.profiles(id) on delete set null,
  raised_by_role text not null,
  category text not null,
  statement text not null,
  contract_status_at_raise text not null,
  response_statement text,
  response_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  status text not null default 'open',
  resolution_kind text,
  resolution_note text,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  withdrawn_at timestamptz,
  first_viewed_by_admin_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wcd_raised_by_role_check check (raised_by_role in ('worker', 'owner')),
  constraint wcd_category_check check (category in ('owner_ended_contract', 'worker_ended_contract', 'contract_terms', 'amendment',
                                                    'acceptance_record', 'other')),
  constraint wcd_statement_length check (char_length(statement) between 20 and 1000),
  constraint wcd_response_length check (char_length(response_statement) between 20 and 1000),
  constraint wcd_response_consistency check ((response_statement is null) = (responded_at is null)),
  constraint wcd_status_check check (status in ('open', 'closed', 'withdrawn')),
  constraint wcd_resolution_kind_check check (resolution_kind in ('information_shared', 'referred_outside_washlink', 'no_platform_action')),
  constraint wcd_resolution_note_length check (char_length(resolution_note) between 20 and 1000),
  constraint wcd_revision_check check (revision >= 1),
  constraint wcd_status_consistency check (
    (status = 'open' and resolution_kind is null and resolution_note is null and closed_at is null and withdrawn_at is null)
    or (status = 'closed' and resolution_kind is not null and resolution_note is not null and closed_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null and resolution_kind is null and resolution_note is null and closed_at is null))
);
create unique index if not exists worker_contract_disputes_one_open_per_party
  on public.worker_contract_disputes (contract_id, raised_by_role) where status = 'open';
create index if not exists worker_contract_disputes_status_idx on public.worker_contract_disputes (status, created_at);
create index if not exists worker_contract_disputes_contract_idx on public.worker_contract_disputes (contract_id);
create index if not exists worker_contract_disputes_raised_by_idx on public.worker_contract_disputes (raised_by);
create index if not exists worker_contract_disputes_response_by_idx on public.worker_contract_disputes (response_by);
create index if not exists worker_contract_disputes_closed_by_idx on public.worker_contract_disputes (closed_by);
comment on table public.worker_contract_disputes is
  'W11: a contract problem reported to WashLink by the worker or the owner of a sent contract (D-47); the other party may answer once; a WashLink platform administrator reads the contract only while the problem is open (every read audited) and closes it with a note to both parties. WashLink never changes, restarts or ends a contract, decides pay or decides legal rights.';

create or replace function public.worker_contract_disputes_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.contract_dispute_write', true), '');
  changed text[];
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.worker_contracts c where c.id = old.contract_id) then
      return old;   -- FK cascade: the contract is gone (W9 retention)
    end if;
    raise exception 'Reported contract problems cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.worker_contract_disputes'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- a party or the closing administrator account was removed; the record stays
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Reported contract problems change only through WashLink.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.statement := btrim(new.statement);
    new.status := 'open';
    new.response_statement := null; new.response_by := null; new.responded_at := null;
    new.resolution_kind := null; new.resolution_note := null; new.closed_by := null; new.closed_at := null;
    new.withdrawn_at := null; new.first_viewed_by_admin_at := null;
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  select coalesce(array_agg(e.key), '{}') into changed from jsonb_each(to_jsonb(new)) e
  where e.value is distinct from (to_jsonb(old) -> e.key);
  if old.status <> 'open'
     or not changed <@ array['response_statement', 'response_by', 'responded_at', 'status', 'resolution_kind', 'resolution_note',
                             'closed_by', 'closed_at', 'withdrawn_at', 'first_viewed_by_admin_at', 'revision', 'updated_at']
     or (changed && array['response_statement', 'response_by', 'responded_at'] and old.response_statement is not null)
     or (new.status is distinct from old.status and new.status not in ('closed', 'withdrawn'))
     or (new.first_viewed_by_admin_at is distinct from old.first_viewed_by_admin_at and old.first_viewed_by_admin_at is not null) then
    raise exception 'Reported contract problems cannot be edited.' using errcode = '42501';
  end if;
  if new.response_statement is distinct from old.response_statement then
    new.response_statement := btrim(new.response_statement);
    new.response_by := auth.uid();
    new.responded_at := now();
  end if;
  if new.status = 'closed' and old.status = 'open' then
    new.resolution_note := btrim(new.resolution_note);
    new.closed_by := auth.uid();
    new.closed_at := now();
  elsif new.status = 'withdrawn' and old.status = 'open' then
    new.withdrawn_at := now();
  end if;
  if new.first_viewed_by_admin_at is distinct from old.first_viewed_by_admin_at then
    new.first_viewed_by_admin_at := now();
  end if;
  new.updated_at := now();
  if changed <@ array['first_viewed_by_admin_at', 'updated_at'] then
    new.revision := old.revision;   -- a first case view is not a change of the dispute
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.worker_contract_disputes_guard_write() from public, anon, authenticated, service_role;
drop trigger if exists worker_contract_disputes_guard_write on public.worker_contract_disputes;
create trigger worker_contract_disputes_guard_write
  before insert or update or delete on public.worker_contract_disputes
  for each row execute function public.worker_contract_disputes_guard_write();

alter table public.worker_contract_disputes enable row level security;
revoke all on table public.worker_contract_disputes from public, anon, authenticated, service_role;
grant select on table public.worker_contract_disputes to authenticated;

drop policy if exists "wcd_select_super_admin" on public.worker_contract_disputes;
drop policy if exists "worker_contract_disputes_no_client_select" on public.worker_contract_disputes;
create policy "worker_contract_disputes_no_client_select" on public.worker_contract_disputes
  for select to authenticated using (false);
drop policy if exists "worker_contract_disputes_no_client_insert" on public.worker_contract_disputes;
create policy "worker_contract_disputes_no_client_insert" on public.worker_contract_disputes
  for insert to authenticated with check (false);
drop policy if exists "worker_contract_disputes_no_client_update" on public.worker_contract_disputes;
create policy "worker_contract_disputes_no_client_update" on public.worker_contract_disputes
  for update to authenticated using (false);
drop policy if exists "worker_contract_disputes_no_client_delete" on public.worker_contract_disputes;
create policy "worker_contract_disputes_no_client_delete" on public.worker_contract_disputes
  for delete to authenticated using (false);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W11e: supabase_realtime is FOR ALL TABLES and would publish worker_contract_disputes (D-10 diff). Aborting.';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'worker_contract_disputes') then
    alter publication supabase_realtime drop table public.worker_contract_disputes;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a; roll back w11f..w11i first)
-- IRREVERSIBLE LOSS of reported contract problems, responses and closing notes: export first with a trusted
--   copy public.worker_contract_disputes to '<file>'.
-- -------------------------------------------------------------
-- drop table if exists public.worker_contract_disputes;   -- drops its guard trigger, policies and indexes
-- drop function if exists public.worker_contract_disputes_guard_write();
