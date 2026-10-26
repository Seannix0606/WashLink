-- =============================================================
-- WashLink W8c - contract templates, sealed template versions and their clauses (spec E, H; W8 PLAN 3.3, P37-P39,
-- P41, P43). Requires w2a, w8a, w8b. Idempotent.
-- P37: every write goes through a W8 definer RPC (or the w8e seed) under the transaction-local flag
--      washlink.contract_template_write = <template id>; no client role has INSERT / UPDATE / DELETE; no trusted
--      bypass for versions or clauses. P38: versions and clauses are write-once for EVERY session; a clause may be
--      inserted only in the transaction that inserted its version. P41: no classification column anywhere.
-- P43: clause_hash is server-computed on insert (contract_template_clause_hash, w8d); content_hash is checked
--      at commit (w8d). Templates have no worker / customer visibility (W9 sends contracts).
-- =============================================================

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  current_version_number integer not null default 1,
  derived_from_version_id uuid,   -- FK to contract_template_versions added below (lineage only)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ct_scope_check check (scope in ('platform', 'owner')),
  constraint ct_scope_owner_check check ((scope = 'platform') = (owner_id is null)),
  constraint ct_name_length check (char_length(name) between 3 and 120 and name = btrim(name)),
  constraint ct_status_check check (status in ('active', 'archived')),
  constraint ct_platform_always_active check (scope <> 'platform' or status = 'active'),
  constraint ct_current_version_check check (current_version_number >= 1)
);
create unique index if not exists one_platform_template on public.contract_templates (scope) where scope = 'platform';
create index if not exists contract_templates_owner_status_idx on public.contract_templates (owner_id, status);
create index if not exists contract_templates_derived_from_idx on public.contract_templates (derived_from_version_id);
comment on table public.contract_templates is
  'W8: contract templates. One platform template (the WashLink starter, draft, super_admin publishes versions) and owner templates derived from a platform version. No classification column (D-26). Changed only through the W8 RPCs; archived, never deleted, except by owner account deletion (D-29).';

create table if not exists public.contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  version_number integer not null,
  base_platform_version_id uuid references public.contract_template_versions(id) on delete restrict,
  review_status text not null default 'draft_requires_legal_review',
  content_hash text not null,
  edited_count smallint not null default 0,
  added_count smallint not null default 0,
  saved_by uuid references public.profiles(id) on delete set null,
  saved_by_role text not null,
  created_txid bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctv_version_number_check check (version_number >= 1),
  constraint ctv_template_version_unique unique (template_id, version_number),
  constraint ctv_review_status_check check (review_status = 'draft_requires_legal_review'),
  constraint ctv_content_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint ctv_counts_check check (edited_count >= 0 and added_count >= 0),
  constraint ctv_saved_by_role_check check (saved_by_role in ('owner', 'super_admin', 'trusted_session'))
);
create index if not exists contract_template_versions_base_idx on public.contract_template_versions (base_platform_version_id);
create index if not exists contract_template_versions_saved_by_idx on public.contract_template_versions (saved_by);
comment on table public.contract_template_versions is
  'W8: sealed, immutable contract template versions (a new version per save). review_status is always draft_requires_legal_review (D-28). content_hash = server-computed sha256 over the clause hashes, re-checked at commit.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contract_templates_derived_from_version_id_fkey'
                 and conrelid = 'public.contract_templates'::regclass) then
    alter table public.contract_templates add constraint contract_templates_derived_from_version_id_fkey
      foreign key (derived_from_version_id) references public.contract_template_versions(id) on delete set null;
  end if;
end $$;

create table if not exists public.contract_template_clauses (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.contract_template_versions(id) on delete cascade,
  section_number smallint not null references public.contract_template_sections(section_number) on delete restrict,
  position smallint not null,
  clause_key text,
  kind text not null,
  heading text not null,
  body text not null,
  source_clause_id uuid references public.contract_template_clauses(id) on delete restrict,
  requires_owner_input boolean not null default false,
  clause_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctc_position_check check (position between 1 and 99),
  constraint ctc_position_unique unique (version_id, section_number, position),
  constraint ctc_key_unique unique (version_id, clause_key),
  constraint ctc_key_check check (clause_key ~ '^[a-z][a-z0-9_]{2,59}$'),
  constraint ctc_key_null_only_for_shop_terms check ((clause_key is null) = (kind = 'shop_specific')),
  constraint ctc_kind_check check (kind in ('locked_safeguard', 'editable', 'shop_specific')),
  -- No control characters and no invisible format characters (U+200B..U+200F, U+2060, U+FEFF) that could hide text.
  constraint ctc_heading_length
    check (char_length(heading) between 3 and 160 and heading !~ '[\x01-\x1f\x7f\u200b-\u200f\u2060\ufeff]'),
  constraint ctc_body_length
    check (char_length(body) between 1 and 4000 and body !~ '[\x01-\x08\x0b-\x1f\x7f\u200b-\u200f\u2060\ufeff]'),
  constraint ctc_shop_terms_have_no_source check (kind <> 'shop_specific' or source_clause_id is null),
  constraint ctc_source_unique unique (version_id, source_clause_id),   -- each standard clause at most once per version
  constraint ctc_clause_hash_check check (clause_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists contract_template_clauses_source_idx on public.contract_template_clauses (source_clause_id);
create index if not exists contract_template_clauses_section_idx on public.contract_template_clauses (section_number);
comment on table public.contract_template_clauses is
  'W8: immutable clauses of a template version. locked_safeguard clauses are copied verbatim from the base platform version by the server; owners change only editable bodies and add shop_specific terms (D-27). Text is a draft that requires legal review.';

-- -------------------------------------------------------------
-- 1) Text normaliser (trim, CRLF / CR -> LF) and the guards (definer; every session, no trusted bypass).
-- -------------------------------------------------------------
create or replace function public.contract_template_normalize_text(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n'), E' \n\t');
$$;

create or replace function public.contract_templates_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.contract_template_write', true), '');
begin
  if tg_op = 'DELETE' then
    if old.scope = 'platform' then
      raise exception 'The standard contract template cannot be deleted.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p where p.id = old.owner_id) then
      return old;   -- FK cascade: the owner account is gone
    end if;
    raise exception 'Contract templates are changed only through WashLink.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.contract_templates'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- the version this template was started from is gone (lineage only)
    end if;
    if write_flag is distinct from old.id::text
       or exists (select 1 from jsonb_each(to_jsonb(new)) entry
                  where entry.key not in ('name', 'status', 'current_version_number', 'updated_at')
                    and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
      raise exception 'Contract templates are changed only through WashLink.' using errcode = '42501';
    end if;
    new.name := btrim(new.name);
    new.updated_at := now();
    return new;
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Contract templates are changed only through WashLink.' using errcode = '42501';
  end if;
  new.name := btrim(new.name);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.contract_template_versions_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.contract_template_write', true), '');
  template_scope text;
  base_scope text;
  next_number integer;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.contract_templates t where t.id = old.template_id) then
      return old;   -- FK cascade: the template is gone
    end if;
    raise exception 'Contract template versions cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.contract_template_versions'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- the saving account is gone (saved_by set null); the version stays as sealed
    end if;
    raise exception 'Contract template versions cannot be edited.' using errcode = '42501';
  end if;
  if write_flag is distinct from new.template_id::text then
    raise exception 'Contract templates are changed only through WashLink.' using errcode = '42501';
  end if;
  select t.scope into template_scope from public.contract_templates t where t.id = new.template_id;
  select t.scope into base_scope
  from public.contract_template_versions v join public.contract_templates t on t.id = v.template_id
  where v.id = new.base_platform_version_id;
  if (template_scope = 'platform' and new.base_platform_version_id is not null)
     or (template_scope = 'owner' and base_scope is distinct from 'platform') then
    raise exception 'An owner template version must be based on a standard template version.' using errcode = '23514';
  end if;
  select coalesce(max(v.version_number), 0) + 1 into next_number
  from public.contract_template_versions v where v.template_id = new.template_id;
  if new.version_number is distinct from next_number then
    raise exception 'Contract template versions are numbered in order.' using errcode = '23514';
  end if;
  new.saved_by := auth.uid();
  new.saved_by_role := case when auth.uid() is null then 'trusted_session' else public.current_user_profile_role() end;
  new.created_txid := txid_current();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.contract_template_clauses_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.contract_template_write', true), '');
  version_template_id uuid;
  version_txid bigint;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.contract_template_versions v where v.id = old.version_id) then
      return old;   -- FK cascade: the version is gone
    end if;
    raise exception 'Contract template versions cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Contract template versions cannot be edited.' using errcode = '42501';
  end if;
  select v.template_id, v.created_txid into version_template_id, version_txid
  from public.contract_template_versions v where v.id = new.version_id;
  if version_template_id is null or write_flag is distinct from version_template_id::text then
    raise exception 'Contract templates are changed only through WashLink.' using errcode = '42501';
  end if;
  if version_txid is distinct from txid_current() then
    raise exception 'Contract template versions cannot be edited.' using errcode = '42501';   -- P38: sealed version
  end if;
  new.heading := public.contract_template_normalize_text(new.heading);
  new.body := public.contract_template_normalize_text(new.body);
  if (new.heading || new.body) ~ '[\u200b-\u200f\u2060\ufeff]' then   -- friendly message before the CHECK backstop
    raise exception 'Remove invisible characters (such as zero-width spaces) from the text.' using errcode = '23514';
  end if;
  new.clause_hash := public.contract_template_clause_hash(new.section_number, new.position, new.clause_key, new.kind,
                                                          new.heading, new.body);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.contract_template_normalize_text(text) from public, anon, authenticated, service_role;
do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['contract_templates', 'contract_templates_guard_write'],
    array['contract_template_versions', 'contract_template_versions_guard_write'],
    array['contract_template_clauses', 'contract_template_clauses_guard_write']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[2], item[1]);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.%I()',
                   item[2], item[1], item[2]);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2) RLS (select only). Platform rows: role owner or super_admin. Owner rows: the owning owner only (no super_admin,
--    worker, customer or anon). Versions / clauses follow their template through the invoker's own RLS.
-- -------------------------------------------------------------
alter table public.contract_templates enable row level security;
alter table public.contract_template_versions enable row level security;
alter table public.contract_template_clauses enable row level security;
revoke all on table public.contract_templates, public.contract_template_versions, public.contract_template_clauses
  from public, anon, authenticated, service_role;
grant select on table public.contract_templates, public.contract_template_versions, public.contract_template_clauses to authenticated;

drop policy if exists "ct_select_platform_or_own" on public.contract_templates;
create policy "ct_select_platform_or_own" on public.contract_templates
  for select to authenticated
  using ((scope = 'platform' and coalesce(public.current_user_profile_role() in ('owner', 'super_admin'), false))
         or (scope = 'owner' and owner_id = auth.uid() and coalesce(public.current_user_profile_role() = 'owner', false)));
drop policy if exists "ctv_select_readable_template" on public.contract_template_versions;
create policy "ctv_select_readable_template" on public.contract_template_versions
  for select to authenticated
  using (exists (select 1 from public.contract_templates t where t.id = template_id));
drop policy if exists "ctc_select_readable_version" on public.contract_template_clauses;
create policy "ctc_select_readable_version" on public.contract_template_clauses
  for select to authenticated
  using (exists (select 1 from public.contract_template_versions v where v.id = version_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contract_templates', 'contract_template_versions', 'contract_template_clauses'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 3) Realtime: no W8 table is ever published (w6d / w7c pattern).
-- -------------------------------------------------------------
do $$
declare
  published text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W8c: supabase_realtime is FOR ALL TABLES and would publish the contract template tables (D-10 diff). Aborting.';
  end if;
  for published in
    select pt.tablename::text from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
      and pt.tablename in ('contract_template_sections', 'contract_template_placeholders', 'worker_classification_options',
                           'contract_templates', 'contract_template_versions', 'contract_template_clauses')
  loop
    execute format('alter publication supabase_realtime drop table public.%I', published);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a; roll back w8d first)
-- IRREVERSIBLE LOSS of owner templates and every saved version: export first with a trusted
--   copy public.contract_templates to '<file>' (and contract_template_versions, contract_template_clauses).
-- -------------------------------------------------------------
-- alter table public.contract_templates drop constraint if exists contract_templates_derived_from_version_id_fkey;
-- drop table if exists public.contract_template_clauses;   -- drops its trigger, policies and indexes
-- drop table if exists public.contract_template_versions;
-- drop table if exists public.contract_templates;
-- drop function if exists public.contract_template_clauses_guard_write();
-- drop function if exists public.contract_template_versions_guard_write();
-- drop function if exists public.contract_templates_guard_write();
-- drop function if exists public.contract_template_normalize_text(text);
