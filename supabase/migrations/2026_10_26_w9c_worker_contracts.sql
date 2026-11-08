-- =============================================================
-- WashLink W9c - worker contracts and contract versions (spec E, F, H; W9 PLAN 3.3, P45-P50, P53). Requires w2a, w2f,
-- w5b, w6c, w8b, w8c, w9a, w9b. Idempotent.
-- P45: every write goes through a W9 definer RPC under the transaction-local flag washlink.worker_contract_write =
--      <contract id>; no client role (anon, authenticated, service_role) has INSERT / UPDATE / DELETE. A trusted session
--      may repair the status columns of worker_contracts only (audited trusted_session; never versions).
-- P46: a version is `draft` (inputs editable by the owner RPC only) until sent; sending seals it (rendered_text, sha256
--      content_hash, render_values, flag_count, sealed_at, sealed_txid, clauses, flags, owner acceptance) in one
--      transaction under washlink.worker_contract_seal = <version id>. After sealing only `state` and the response stamps
--      change, through the state machine; anything else -> 42501 `Sent contract versions cannot be edited.`
-- P49: classification_key is NOT NULL with NO default (D-26). P53: party / origin FKs are ON DELETE SET NULL (w9i).
-- Private to the parties: owner (role owner, owner_id) and worker (worker_id, once sent). Nobody else reads rows.
-- The ON DELETE SET NULL FKs are DEFERRABLE INITIALLY DEFERRED: one account deletion can null several FKs of the same
-- row in separate cascade steps, and a row inserted in the same transaction is re-checked on every update.
-- =============================================================

create table if not exists public.worker_contracts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null deferrable initially deferred,
  owner_id uuid references public.profiles(id) on delete set null deferrable initially deferred,
  worker_id uuid references public.worker_profiles(profile_id) on delete set null deferrable initially deferred,
  origin text not null,
  job_application_id uuid references public.job_applications(id) on delete set null deferrable initially deferred,
  training_enrollment_id uuid references public.training_enrollments(id) on delete set null deferrable initially deferred,
  status text not null default 'draft',
  current_version_id uuid,   -- FKs to contract_versions added below (deferrable)
  pending_version_id uuid,
  shop_name_snapshot text not null,
  shop_address_snapshot text not null,
  owner_name_snapshot text not null,
  worker_name_snapshot text not null,
  start_date date,
  end_date date,
  revision integer not null default 1,
  sent_at timestamptz,
  accepted_at timestamptz,
  activated_at timestamptz,
  ended_at timestamptz,
  ended_by text,
  end_reason text,
  decline_note text,
  owner_removed_at timestamptz,
  shop_removed_at timestamptz,
  worker_removed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wc_origin_check check (origin in ('accepted_application', 'completed_training')),
  constraint wc_status_check check (status in ('draft', 'sent_for_review', 'accepted', 'declined', 'withdrawn', 'active', 'expired',
                                               'terminated')),
  constraint wc_snapshot_lengths check (char_length(shop_name_snapshot) <= 200 and char_length(shop_address_snapshot) <= 200
                                        and char_length(owner_name_snapshot) <= 200 and char_length(worker_name_snapshot) <= 200),
  constraint wc_dates_check check (end_date is null or start_date is null or end_date >= start_date),
  constraint wc_revision_check check (revision >= 1),
  constraint wc_ended_by_check check (ended_by in ('worker', 'owner', 'system', 'trusted_session')),
  constraint wc_end_reason_length check (char_length(end_reason) between 10 and 500),
  constraint wc_decline_note_length check (char_length(decline_note) <= 500),
  constraint wc_lifecycle_consistency check (
    ((status = 'draft') = (sent_at is null))
    and (status not in ('accepted', 'active', 'expired', 'terminated') or (accepted_at is not null and current_version_id is not null))
    and (status <> 'active' or activated_at is not null)
    and (status not in ('declined', 'withdrawn', 'expired', 'terminated') or ended_at is not null)
    and (status <> 'terminated' or (ended_by is not null and (ended_by = 'trusted_session' or end_reason is not null))))
);
create unique index if not exists worker_contracts_one_open_per_shop_worker on public.worker_contracts (shop_id, worker_id)
  where status in ('draft', 'sent_for_review', 'accepted', 'active');
create index if not exists worker_contracts_owner_status_idx on public.worker_contracts (owner_id, status);
create index if not exists worker_contracts_worker_status_idx on public.worker_contracts (worker_id, status);
create index if not exists worker_contracts_shop_idx on public.worker_contracts (shop_id);
create index if not exists worker_contracts_application_idx on public.worker_contracts (job_application_id);
create index if not exists worker_contracts_enrollment_idx on public.worker_contracts (training_enrollment_id);
comment on table public.worker_contracts is
  'W9: a worker contract between a shop owner and a worker (D-31), private to the two parties. Statuses draft / sent_for_review / accepted / declined / withdrawn / active / expired / terminated. Changed only through the W9 RPCs; kept with name snapshots after owner / shop removal (D-35) and, when accepted, after worker removal (D-32).';

create table if not exists public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.worker_contracts(id) on delete cascade,
  version_number integer not null,
  kind text not null,
  state text not null default 'draft',
  template_version_id uuid references public.contract_template_versions(id) on delete set null deferrable initially deferred,
  template_content_hash text,
  template_name_snapshot text not null,
  template_version_number integer,
  base_platform_version_id uuid not null references public.contract_template_versions(id) on delete restrict,
  base_platform_content_hash text not null,
  base_platform_version_number integer not null,
  classification_key text not null references public.worker_classification_options(classification_key) on delete restrict,
  classification_label text not null,
  editable_bodies jsonb not null default '{}'::jsonb,
  shop_terms jsonb not null default '[]'::jsonb,
  owner_values jsonb not null default '{}'::jsonb,
  start_date date not null,
  end_date date,
  draft_revision integer not null default 1,
  render_values jsonb,
  rendered_text text,
  content_hash text,
  flag_count integer,
  sealed_at timestamptz,
  sealed_txid bigint,
  sent_at timestamptz,
  responded_at timestamptz,
  decline_note text,
  created_by uuid references public.profiles(id) on delete set null deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cv_version_number_check check (version_number >= 1),
  constraint cv_contract_version_unique unique (contract_id, version_number),
  constraint cv_kind_check check (kind in ('initial', 'amendment') and ((kind = 'initial') = (version_number = 1))),
  constraint cv_state_check check (state in ('draft', 'sent_for_review', 'accepted', 'declined', 'withdrawn', 'superseded')),
  constraint cv_hashes_check check ((template_content_hash is null or template_content_hash ~ '^[0-9a-f]{64}$')
                                    and base_platform_content_hash ~ '^[0-9a-f]{64}$' and (content_hash is null or content_hash ~ '^[0-9a-f]{64}$')),
  constraint cv_inputs_shape check (jsonb_typeof(editable_bodies) = 'object' and jsonb_typeof(shop_terms) = 'array'
                                    and jsonb_typeof(owner_values) = 'object'
                                    and owner_values - array['role_title', 'schedule_summary', 'pay_details'] = '{}'::jsonb
                                    and pg_column_size(editable_bodies) + pg_column_size(shop_terms) <= 400000),
  constraint cv_dates_check check (end_date is null or end_date >= start_date),
  constraint cv_draft_revision_check check (draft_revision >= 1),
  constraint cv_text_length check (char_length(rendered_text) <= 200000 and char_length(template_name_snapshot) <= 200),
  constraint cv_flag_count_check check (flag_count >= 0),
  constraint cv_decline_note_length check (decline_note is null or (char_length(decline_note) <= 500 and state = 'declined')),
  constraint cv_seal_consistency check (
    num_nulls(rendered_text, render_values, content_hash, flag_count, sealed_at, sealed_txid, sent_at) in (0, 7)
    and ((state = 'draft') = (rendered_text is null))
    and (state not in ('accepted', 'declined', 'withdrawn', 'superseded') or responded_at is not null))
);
create unique index if not exists contract_versions_one_open_per_contract on public.contract_versions (contract_id)
  where state in ('draft', 'sent_for_review');
create index if not exists contract_versions_template_version_idx on public.contract_versions (template_version_id);
create index if not exists contract_versions_base_platform_idx on public.contract_versions (base_platform_version_id);
create index if not exists contract_versions_classification_idx on public.contract_versions (classification_key);
create index if not exists contract_versions_created_by_idx on public.contract_versions (created_by);
create index if not exists contract_versions_contract_state_idx on public.contract_versions (contract_id, state);
comment on table public.contract_versions is
  'W8/W9 contract module (created by W9): versions of a worker contract. Draft inputs (classification, dates, owner values, editable bodies, shop terms) until sent; then sealed for every session with its own rendered plain text and sha256 content_hash (P46, P48). Template ids are lineage only; hashes are copied. Every change after acceptance is a new amendment version (D-34).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'worker_contracts_current_version_id_fkey'
                 and conrelid = 'public.worker_contracts'::regclass) then
    alter table public.worker_contracts add constraint worker_contracts_current_version_id_fkey
      foreign key (current_version_id) references public.contract_versions(id) on delete no action deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'worker_contracts_pending_version_id_fkey'
                 and conrelid = 'public.worker_contracts'::regclass) then
    alter table public.worker_contracts add constraint worker_contracts_pending_version_id_fkey
      foreign key (pending_version_id) references public.contract_versions(id) on delete no action deferrable initially deferred;
  end if;
end $$;
create index if not exists worker_contracts_current_version_idx on public.worker_contracts (current_version_id);
create index if not exists worker_contracts_pending_version_idx on public.worker_contracts (pending_version_id);

-- -------------------------------------------------------------
-- 1) Guard (definer; every session): insert / update / delete only under the flag (or the FK cascade); a trusted
--    session may repair status columns only. The P46 version guard lives in w9d, next to the other sealed records.
-- -------------------------------------------------------------
create or replace function public.worker_contracts_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.worker_contract_write', true), '');
  changed text[];
begin
  if tg_op = 'DELETE' then
    -- Never-sent drafts (owner discard, owner / shop removal) and never-accepted contracts of a removed worker (w9i).
    if write_flag = old.id::text and (old.sent_at is null or (old.worker_id is null and old.accepted_at is null)) then
      return old;
    end if;
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.worker_contracts'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- a party, the shop or the origin record is gone (w9i stamps and cleans up)
    end if;
    select coalesce(array_agg(e.key), '{}') into changed from jsonb_each(to_jsonb(new)) e
    where e.value is distinct from (to_jsonb(old) -> e.key);
    if changed && array['id', 'shop_id', 'owner_id', 'worker_id', 'origin', 'job_application_id', 'training_enrollment_id', 'created_at'] then
      raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
    end if;
    if write_flag is distinct from old.id::text then
      if not (public.is_trusted_db_session() and auth.uid() is null)
         or not changed <@ array['status', 'status_changed_at', 'ended_at', 'ended_by', 'end_reason', 'activated_at', 'revision', 'updated_at'] then
        raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
      end if;
      if new.status = 'terminated' and old.status is distinct from 'terminated' then   -- audited trusted repair
        new.ended_by := 'trusted_session';
        new.ended_at := coalesce(new.ended_at, now());
      end if;
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_changed_at := now();
    end if;
    return new;
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  new.status := 'draft';
  new.revision := 1;
  new.current_version_id := null;
  new.pending_version_id := null;
  new.sent_at := null; new.accepted_at := null; new.activated_at := null; new.ended_at := null;
  new.ended_by := null; new.end_reason := null; new.decline_note := null;
  new.owner_removed_at := null; new.shop_removed_at := null; new.worker_removed_at := null;
  new.status_changed_at := now();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['worker_contracts', 'worker_contracts_guard_write']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[2], item[1]);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.%I()',
                   item[2], item[1], item[2]);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2) RLS (select only). Contracts: the owner (role owner, owner_id) every own row; the worker once sent. Versions:
--    owner all; worker sealed only. Nobody else (super_admin, customers, anon: nothing; W11 adds dispute access).
-- -------------------------------------------------------------
alter table public.worker_contracts enable row level security;
alter table public.contract_versions enable row level security;
revoke all on table public.worker_contracts, public.contract_versions from public, anon, authenticated, service_role;
grant select on table public.worker_contracts, public.contract_versions to authenticated;

drop policy if exists "wc_select_parties" on public.worker_contracts;
create policy "wc_select_parties" on public.worker_contracts
  for select to authenticated
  using ((owner_id = auth.uid() and coalesce(public.current_user_profile_role() = 'owner', false))
         or (worker_id = auth.uid() and sent_at is not null));
drop policy if exists "cv_select_parties" on public.contract_versions;
create policy "cv_select_parties" on public.contract_versions
  for select to authenticated
  using (exists (select 1 from public.worker_contracts c where c.id = contract_id
                 and ((c.owner_id = auth.uid() and coalesce(public.current_user_profile_role() = 'owner', false))
                      or (c.worker_id = auth.uid() and c.sent_at is not null and state <> 'draft'))));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['worker_contracts', 'contract_versions'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

-- Realtime exclusion of every W9 table: w9i (after the last W9 table exists).
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a; roll back w9d first)
-- IRREVERSIBLE LOSS of every worker contract, sealed version and acceptance: export first with a trusted
--   copy public.worker_contracts to '<file>' (and contract_versions, contract_version_clauses, contract_version_flags,
--   contract_acceptances). Drop the guards before the tables (the delete guards refuse sealed rows).
-- -------------------------------------------------------------
-- drop trigger if exists worker_contracts_guard_write on public.worker_contracts;
-- alter table public.worker_contracts drop constraint if exists worker_contracts_current_version_id_fkey;
-- alter table public.worker_contracts drop constraint if exists worker_contracts_pending_version_id_fkey;
-- drop table if exists public.contract_versions;   -- drops its policies and indexes
-- drop table if exists public.worker_contracts;
-- drop function if exists public.worker_contracts_guard_write();
