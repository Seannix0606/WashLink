-- =============================================================
-- WashLink W9d - sealed contract version records: the P46 version guard, rendered clauses, problem-term flags and
-- acceptance records (spec E; W9 PLAN 3.4, P46-P48, P51). Requires w8b, w9b, w9c. Idempotent.
-- Clauses and flags are inserted only while their version is being sealed (washlink.worker_contract_seal = version id,
-- created_txid = sealed_txid = txid_current()); never updated; deleted only with their version (FK cascade).
-- P47 no fabricated acceptance: a contract_acceptances row is inserted only under the write flag AND with
--   party_id = auth.uid() whose role and contract party match party_role (every session: a trusted session without a
--   JWT cannot insert one at all); version number, sealed hash, statement text, party name, accepted_at and the record
--   label "Acceptance record — not an e-signature" are set by the server. No signature image, typed name, IP or
--   device data exists. Immutable; deleted only with its contract or version. RLS follows the version.
-- =============================================================

-- P46 version guard (definer; every session, no trusted bypass).
create or replace function public.contract_versions_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.worker_contract_write', true), '');
  seal_flag text := coalesce(current_setting('washlink.worker_contract_seal', true), '');
  changed text[];
  tv record;
  base record;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.worker_contracts c where c.id = old.contract_id) then
      return old;   -- FK cascade: the contract is gone
    end if;
    if write_flag = old.contract_id::text and old.state = 'draft' then
      return old;   -- an unsent draft (discard, termination, expiry, party removal)
    end if;
    raise exception 'Sent contract versions cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.contract_versions'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- template lineage or the creating account is gone; the sealed text stays
    end if;
    select coalesce(array_agg(e.key), '{}') into changed from jsonb_each(to_jsonb(new)) e
    where e.value is distinct from (to_jsonb(old) -> e.key);
    if old.state <> 'draft' and not changed <@ array['state', 'responded_at', 'decline_note', 'updated_at'] then
      raise exception 'Sent contract versions cannot be edited.' using errcode = '42501';
    end if;
    if write_flag is distinct from old.contract_id::text then
      raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
    end if;
    if old.state <> 'draft' then
      if new.state is distinct from old.state
         and (old.state || '>' || new.state) not in ('sent_for_review>accepted', 'sent_for_review>declined', 'sent_for_review>withdrawn',
                                                     'accepted>superseded') then
        raise exception 'This contract change is not allowed.' using errcode = '42501';
      end if;
    elsif new.state = 'draft' then
      if not changed <@ array['classification_key', 'classification_label', 'editable_bodies', 'shop_terms', 'owner_values', 'start_date',
                              'end_date', 'draft_revision', 'updated_at'] then
        raise exception 'This contract change is not allowed.' using errcode = '42501';
      end if;
      new.classification_label := (select o.label from public.worker_classification_options o where o.classification_key = new.classification_key);
    elsif new.state = 'sent_for_review' then
      if seal_flag is distinct from old.id::text or new.sealed_txid is distinct from txid_current()
         or not changed <@ array['state', 'render_values', 'rendered_text', 'content_hash', 'flag_count', 'sealed_at', 'sealed_txid', 'sent_at',
                                 'updated_at'] then
        raise exception 'This contract change is not allowed.' using errcode = '42501';
      end if;
      new.sealed_at := now(); new.sent_at := now();
    else
      raise exception 'This contract change is not allowed.' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if write_flag is distinct from new.contract_id::text then
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  if new.version_number is distinct from (select coalesce(max(v.version_number), 0) + 1 from public.contract_versions v
                                          where v.contract_id = new.contract_id) then
    raise exception 'Contract versions are numbered in order.' using errcode = '23514';
  end if;
  -- Lineage stamps come from the referenced rows, never from the caller.
  select v.id, v.base_platform_version_id, v.content_hash, v.version_number, t.name into tv
  from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id where v.id = new.template_version_id;
  select v.id, v.content_hash, v.version_number, t.scope into base
  from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id where v.id = new.base_platform_version_id;
  if base.id is null or base.scope <> 'platform'
     or (new.template_version_id is not null and (tv.id is null or new.base_platform_version_id <> coalesce(tv.base_platform_version_id, tv.id))) then
    raise exception 'A contract version must be based on a standard template version.' using errcode = '23514';
  end if;
  new.template_content_hash := tv.content_hash; new.template_version_number := tv.version_number;
  new.template_name_snapshot := left(coalesce(tv.name, new.template_name_snapshot, 'WashLink worker agreement - draft'), 200);
  new.base_platform_content_hash := base.content_hash; new.base_platform_version_number := base.version_number;
  new.classification_label := (select o.label from public.worker_classification_options o where o.classification_key = new.classification_key);
  new.state := 'draft'; new.draft_revision := 1;
  new.render_values := null; new.rendered_text := null; new.content_hash := null; new.flag_count := null;
  new.sealed_at := null; new.sealed_txid := null; new.sent_at := null; new.responded_at := null; new.decline_note := null;
  new.created_by := auth.uid(); new.created_at := now(); new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.contract_version_clauses (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.contract_versions(id) on delete cascade,
  section_number smallint not null references public.contract_template_sections(section_number) on delete restrict,
  section_title text not null,
  review_notice text not null,
  position smallint not null,
  clause_key text,
  kind text not null,
  heading text not null,
  body text not null,
  standard_heading text,
  standard_body text,
  change text not null,
  edited_in text,
  clause_hash text not null,
  created_txid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cvc_position_check check (position between 1 and 99),
  constraint cvc_position_unique unique (version_id, section_number, position),
  constraint cvc_kind_check check (kind in ('locked_safeguard', 'editable', 'shop_specific')
                                   and ((clause_key is null) = (kind = 'shop_specific'))),
  constraint cvc_text_length check (char_length(heading) between 1 and 400 and char_length(body) between 1 and 12000),
  constraint cvc_standard_check check (((kind = 'shop_specific') = (standard_body is null)) and ((standard_heading is null) = (standard_body is null))),
  constraint cvc_change_check check (change in ('unchanged', 'edited', 'added_by_shop')
                                     and ((change = 'added_by_shop') = (kind = 'shop_specific'))
                                     and (kind <> 'locked_safeguard' or change = 'unchanged')),
  constraint cvc_edited_in_check check ((edited_in in ('template', 'contract') and change <> 'unchanged')
                                        or (edited_in is null and change = 'unchanged')),
  constraint cvc_clause_hash_check check (clause_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists contract_version_clauses_section_idx on public.contract_version_clauses (section_number);
comment on table public.contract_version_clauses is
  'W8/W9 contract module (created by W9): rendered clauses of a sealed contract version, with the base standard clause rendered with the same values (diff vs the standard) and where an edit was made (template / contract). Immutable.';

create table if not exists public.contract_version_flags (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.contract_versions(id) on delete cascade,
  section_number smallint,
  position smallint,
  value_key text,
  rule_key text not null references public.contract_problem_term_rules(rule_key) on delete restrict,
  category text not null,
  excerpt text not null,
  created_txid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cvf_location_check check ((section_number is null) = (position is null) and (value_key is null) <> (section_number is null)
                                       and (value_key is null or value_key in ('role_title', 'schedule_summary', 'pay_details'))),
  constraint cvf_excerpt_length check (char_length(excerpt) between 1 and 160)
);
create index if not exists contract_version_flags_version_idx on public.contract_version_flags (version_id);
create index if not exists contract_version_flags_rule_idx on public.contract_version_flags (rule_key);
comment on table public.contract_version_flags is
  'W8/W9 contract module (created by W9): problem-term keyword matches in owner-written text of a sealed version (D-33). Informational only: an automatic keyword check that may miss problems or flag acceptable text; not legal advice; WashLink does not check whether terms are lawful. Immutable.';

create table if not exists public.contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.worker_contracts(id) on delete cascade,
  version_id uuid not null references public.contract_versions(id) on delete cascade,
  version_number integer not null,
  version_content_hash text not null,
  party_role text not null,
  party_id uuid references public.profiles(id) on delete set null deferrable initially deferred,
  party_name_snapshot text not null,
  statement_key text not null references public.contract_acknowledgement_texts(ack_key) on delete restrict,
  statement_text text not null,
  contractor_ack_key text references public.contract_acknowledgement_texts(ack_key) on delete restrict,
  contractor_ack_text text,
  accepted_at timestamptz not null default now(),
  record_label text not null default 'Acceptance record — not an e-signature',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ca_party_role_check check (party_role in ('owner', 'worker')),
  constraint ca_version_party_unique unique (version_id, party_role),
  constraint ca_hash_check check (version_content_hash ~ '^[0-9a-f]{64}$'),
  constraint ca_name_length check (char_length(party_name_snapshot) between 1 and 200),
  constraint ca_contractor_ack_check check ((contractor_ack_key is null) = (contractor_ack_text is null)),
  constraint ca_record_label_check check (record_label = 'Acceptance record — not an e-signature')
);
create index if not exists contract_acceptances_contract_idx on public.contract_acceptances (contract_id);
create index if not exists contract_acceptances_party_idx on public.contract_acceptances (party_id);
create index if not exists contract_acceptances_statement_idx on public.contract_acceptances (statement_key);
create index if not exists contract_acceptances_contractor_ack_idx on public.contract_acceptances (contractor_ack_key);
comment on table public.contract_acceptances is
  'W8/W9 contract module (created by W9): Acceptance record — not an e-signature. Who (party and name snapshot) accepted which sealed version (number and sha256 hash) with which statement, and when. Created only by the accepting party inside the W9 RPCs (owner at send, worker at accept); never fabricated, never changed (P47).';

-- -------------------------------------------------------------
-- 1) Guards for clauses, flags and acceptances (definer; every session; no trusted bypass).
-- -------------------------------------------------------------
create or replace function public.contract_version_records_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.worker_contract_write', true), '');
  seal_flag text := coalesce(current_setting('washlink.worker_contract_seal', true), '');
  v public.contract_versions;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.contract_versions x where x.id = old.version_id) then
      return old;   -- FK cascade: the version (or its contract) is gone
    end if;
    raise exception 'Sent contract versions cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Sent contract versions cannot be edited.' using errcode = '42501';
  end if;
  select * into v from public.contract_versions x where x.id = new.version_id;
  if v.id is null or write_flag is distinct from v.contract_id::text then
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  if seal_flag is distinct from v.id::text or v.state <> 'sent_for_review' or v.sealed_txid is distinct from txid_current() then
    raise exception 'Sent contract versions cannot be edited.' using errcode = '42501';   -- P46: only while sealing
  end if;
  new.created_txid := txid_current();
  if tg_table_name = 'contract_version_clauses' then
    new.clause_hash := public.contract_template_clause_hash(new.section_number, new.position, new.clause_key, new.kind, new.heading, new.body);
  end if;
  new.created_at := now(); new.updated_at := now();
  return new;
end;
$$;

create or replace function public.contract_acceptances_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.worker_contract_write', true), '');
  seal_flag text := coalesce(current_setting('washlink.worker_contract_seal', true), '');
  c public.worker_contracts;
  v public.contract_versions;
  needs_extra boolean;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.contract_versions x where x.id = old.version_id)
       or not exists (select 1 from public.worker_contracts x where x.id = old.contract_id) then
      return old;   -- FK cascade only
    end if;
    raise exception 'Acceptance records cannot be changed.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.contract_acceptances'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- the party's account is gone; the record and its name snapshot stay
    end if;
    raise exception 'Acceptance records cannot be changed.' using errcode = '42501';
  end if;
  if write_flag is distinct from new.contract_id::text then
    raise exception 'Contracts are changed only through WashLink.' using errcode = '42501';
  end if;
  select * into c from public.worker_contracts x where x.id = new.contract_id;
  select * into v from public.contract_versions x where x.id = new.version_id and x.contract_id = new.contract_id;
  -- P47: only the accepting party, signed in, for itself (no trusted or third-party insert, also with the flag).
  if auth.uid() is null or new.party_id is distinct from auth.uid() or c.id is null or v.id is null
     or not ((new.party_role = 'owner' and c.owner_id = auth.uid() and coalesce(public.current_user_profile_role() = 'owner', false))
             or (new.party_role = 'worker' and c.worker_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false))) then
    raise exception 'Acceptance records are created only by the accepting party.' using errcode = '42501';
  end if;
  if v.state <> 'sent_for_review' or v.content_hash is null
     or (new.party_role = 'owner' and (seal_flag is distinct from v.id::text or v.sealed_txid is distinct from txid_current()))
     or (new.party_role = 'worker' and c.pending_version_id is distinct from v.id) then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if new.version_content_hash is distinct from v.content_hash then
    raise exception 'This contract changed. Read the new version before you accept.' using errcode = '55000';
  end if;
  select o.needs_extra_acknowledgement into needs_extra from public.worker_classification_options o
  where o.classification_key = v.classification_key;
  if new.statement_key is distinct from (case new.party_role when 'owner' then 'w9_owner_send_v1' else 'w9_worker_accept_v1' end)
     or new.contractor_ack_key is distinct from (case when needs_extra then case new.party_role when 'owner' then 'w9_contractor_owner_v1'
                                                                         else 'w9_contractor_worker_v1' end end) then
    raise exception 'Confirm the required statements before continuing.' using errcode = '23514';
  end if;
  new.version_number := v.version_number;
  new.statement_text := (select t.statement_text from public.contract_acknowledgement_texts t where t.ack_key = new.statement_key);
  new.contractor_ack_text := (select t.statement_text from public.contract_acknowledgement_texts t where t.ack_key = new.contractor_ack_key);
  new.party_name_snapshot := left(coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = auth.uid())), ''),
                                           'Name not provided on WashLink'), 200);
  new.accepted_at := now(); new.record_label := 'Acceptance record — not an e-signature';
  new.created_at := now(); new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['contract_versions', 'contract_versions_guard_write'],
    array['contract_version_clauses', 'contract_version_records_guard_write'],
    array['contract_version_flags', 'contract_version_records_guard_write'],
    array['contract_acceptances', 'contract_acceptances_guard_write']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[1] || '_guard_write', item[1]);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.%I()',
                   item[1] || '_guard_write', item[1], item[2]);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2) RLS (select only): rows follow their version through the invoker's own RLS (owner: own contracts; worker:
--    sealed versions only). Deny-all writes.
-- -------------------------------------------------------------
alter table public.contract_version_clauses enable row level security;
alter table public.contract_version_flags enable row level security;
alter table public.contract_acceptances enable row level security;
revoke all on table public.contract_version_clauses, public.contract_version_flags, public.contract_acceptances
  from public, anon, authenticated, service_role;
grant select on table public.contract_version_clauses, public.contract_version_flags, public.contract_acceptances to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contract_version_clauses', 'contract_version_flags', 'contract_acceptances'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_readable_version', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.contract_versions v where v.id = version_id))',
                   table_name || '_select_readable_version', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a; roll back w9e first)
-- IRREVERSIBLE LOSS of every rendered clause, flag and acceptance record: export first (trusted copy).
-- -------------------------------------------------------------
-- drop trigger if exists contract_acceptances_guard_write on public.contract_acceptances;
-- drop trigger if exists contract_version_flags_guard_write on public.contract_version_flags;
-- drop trigger if exists contract_version_clauses_guard_write on public.contract_version_clauses;
-- drop table if exists public.contract_acceptances;   -- drops its policies and indexes
-- drop table if exists public.contract_version_flags;
-- drop table if exists public.contract_version_clauses;
-- drop trigger if exists contract_versions_guard_write on public.contract_versions;
-- drop function if exists public.contract_acceptances_guard_write(), public.contract_version_records_guard_write(),
--   public.contract_versions_guard_write();
