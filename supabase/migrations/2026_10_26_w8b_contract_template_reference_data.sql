-- =============================================================
-- WashLink W8b - contract template reference data (spec E; W8 PLAN 3.2, P40, P41; D-26, D-27). Requires w2a, w8a.
-- Idempotent.
-- contract_template_sections: the 15 spec E sections (titles verbatim), each carrying the P40 draft notice;
--   owner_terms_allowed = false for sections 1, 4 and 14 (D-27).
-- contract_template_placeholders: the placeholder allowlist with preview labels (never real values).
-- worker_classification_options: the draft relationship-type vocabulary consumed by W9 only. There is NO default
--   column and no preselected row (P41, D-26); independent_contractor sorts last and needs an extra acknowledgement.
-- Readable by every signed-in user; written only by trusted sessions (migrations). No client write privilege.
-- =============================================================

create table if not exists public.contract_template_sections (
  section_number smallint primary key,
  title text not null,
  review_notice text not null default 'Draft — requires review by a qualified Philippine labor-law professional',
  owner_terms_allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cts_section_number_check check (section_number between 1 and 15),
  constraint cts_title_length check (char_length(title) between 3 and 160),
  constraint cts_review_notice_check
    check (review_notice = 'Draft — requires review by a qualified Philippine labor-law professional')
);
comment on table public.contract_template_sections is
  'W8: the 15 spec E contract sections in spec order. Every section carries the draft notice; shop-specific terms are not allowed in sections 1, 4 and 14 (D-27). Changed only by migrations.';

create table if not exists public.contract_template_placeholders (
  placeholder_key text primary key,
  preview_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctp_key_check check (placeholder_key ~ '^[a-z_]{3,40}$'),
  constraint ctp_label_length check (char_length(preview_label) between 3 and 80)
);
comment on table public.contract_template_placeholders is
  'W8: allowlist of {{placeholder}} keys usable in contract template text, with the preview label shown until W9 fills a real value. Changed only by migrations.';

create table if not exists public.worker_classification_options (
  classification_key text primary key,
  label text not null,
  sort_order smallint not null,
  needs_extra_acknowledgement boolean not null,
  review_status text not null default 'draft_requires_legal_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wco_key_check check (classification_key ~ '^[a-z_]{3,40}$'),
  constraint wco_label_length check (char_length(label) between 3 and 160),
  constraint wco_sort_order_unique unique (sort_order),
  constraint wco_review_status_check check (review_status = 'draft_requires_legal_review')
);
comment on table public.worker_classification_options is
  'W8: draft relationship-type vocabulary for W9 contracts (D-26). No default and no preselected row; independent_contractor is last and needs an extra acknowledgement. Labels need legal review (W8-L3). Changed only by migrations.';

-- -------------------------------------------------------------
-- 1) Guard: only trusted sessions (migrations / psql) write reference data (definer; every session).
-- -------------------------------------------------------------
create or replace function public.contract_template_reference_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_trusted_db_session() or auth.uid() is not null then
    raise exception 'Contract template reference data changes only through migrations.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.contract_template_reference_guard_write() from public, anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contract_template_sections', 'contract_template_placeholders', 'worker_classification_options'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_guard_write', table_name);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.contract_template_reference_guard_write()',
                   table_name || '_guard_write', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_signed_in', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() is not null)', table_name || '_select_signed_in', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2) Seed (spec E titles verbatim; P40 notice from the column default; D-27 owner_terms_allowed).
-- -------------------------------------------------------------
insert into public.contract_template_sections (section_number, title, owner_terms_allowed) values
  (1, 'Parties and verified identities', false),
  (2, 'Car wash business and work location', true),
  (3, 'Role, responsibilities, and scope of work', true),
  (4, 'Contract type and legal classification', false),
  (5, 'Start date, duration, and renewal terms', true),
  (6, 'Work schedule and availability', true),
  (7, 'Compensation, payment frequency, and lawful deductions, if any', true),
  (8, 'Training requirements, the minimum three-day training process, and certification conditions', true),
  (9, 'Worker and owner obligations', true),
  (10, 'Occupational safety, protective equipment, and workplace rules', true),
  (11, 'Customer privacy, confidential information, and responsible data handling', true),
  (12, 'Leave, absences, termination, notice, and dispute resolution as applicable', true),
  (13, 'Applicable statutory benefits, contributions, and other mandatory rights when legally required', true),
  (14, 'Acknowledgment, acceptance, signatures, and dated copies', false),
  (15, 'Attachments or shop-specific terms', true)
on conflict (section_number) do nothing;

insert into public.contract_template_placeholders (placeholder_key, preview_label) values
  ('owner_full_name', '[Shop owner''s full name - filled in on the contract]'),
  ('worker_full_name', '[Worker''s full name - filled in on the contract]'),
  ('shop_name', '[Shop name - filled in on the contract]'),
  ('shop_address', '[Shop address - filled in on the contract]'),
  ('role_title', '[Role title - filled in on the contract]'),
  ('worker_classification', '[Relationship type - chosen per contract, not preselected]'),
  ('start_date', '[Start date - filled in on the contract]'),
  ('end_date', '[End date or duration - filled in on the contract]'),
  ('schedule_summary', '[Working days and hours - filled in on the contract]'),
  ('pay_details', '[Pay as written by the shop on the contract]')
on conflict (placeholder_key) do nothing;

insert into public.worker_classification_options (classification_key, label, sort_order, needs_extra_acknowledgement) values
  ('employee', 'Employee (draft list - confirm with a qualified professional)', 1, false),
  ('probationary_employee', 'Probationary employee (draft list - confirm with a qualified professional)', 2, false),
  ('fixed_term_employee', 'Fixed-term employee (draft list - confirm with a qualified professional)', 3, false),
  ('project_employee', 'Project employee (draft list - confirm with a qualified professional)', 4, false),
  ('seasonal_employee', 'Seasonal employee (draft list - confirm with a qualified professional)', 5, false),
  ('casual_employee', 'Casual employee (draft list - confirm with a qualified professional)', 6, false),
  ('other_needs_review', 'Other relationship type - needs review (draft list - confirm with a qualified professional)', 7, false),
  ('independent_contractor', 'Independent contractor (draft list - confirm with a qualified professional)', 8, true)
on conflict (classification_key) do nothing;

-- Realtime exclusion of every W8 table: w8c.
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W8 rollbacks in reverse order h..a; roll back w8c first)
-- -------------------------------------------------------------
-- drop table if exists public.worker_classification_options;   -- drops its trigger and policies
-- drop table if exists public.contract_template_placeholders;
-- drop table if exists public.contract_template_sections;
-- drop function if exists public.contract_template_reference_guard_write();
