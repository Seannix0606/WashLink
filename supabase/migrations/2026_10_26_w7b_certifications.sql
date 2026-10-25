-- =============================================================
-- WashLink W7b - shop-issued certifications, their append-only status history and the per-shop validity
-- setting (spec D, A; D-5, D-18, D-21, D-23; W7 PLAN P30-P34). Requires w2a, w4b, w6b..w6d, w7a. Idempotent.
-- P30: writes only through the W7 definer RPCs under the transaction-local flag washlink.certification_write =
--      <row id> (certification id for status events, shop id for the policy row); no client role has INSERT /
--      UPDATE / DELETE; NO trusted-session bypass; the only flag-less UPDATE is a D-18 FK set-null.
-- P31: issued facts are write-once for EVERY session (only status, status_reason, status_changed_at,
--      status_changed_by, updated_at change, under the flag). P32: issued_at = approved_at = now(), validity and
--      expires_at are server-set on insert for every session (no backdating). P33: expiry is derived (w7d).
-- P34: issuer_kind is always 'shop_issued'; a shop-issued certification is not a government-recognized credential.
-- D-18 / D-23: shop_id / owner_id / approved_by are ON DELETE SET NULL with name snapshots (the worker keeps it).
-- =============================================================

create table if not exists public.shop_certification_policies (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  validity_months smallint not null default 12,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scp_validity_months_check check (validity_months between 1 and 36)
);
create index if not exists shop_certification_policies_updated_by_idx on public.shop_certification_policies (updated_by);
comment on table public.shop_certification_policies is
  'W7: per-shop certification validity in months (D-5: default 12 when no row exists, 1..36). Applies to future issues and renewals only. Writes only through set_shop_certification_validity.';

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  program_id uuid not null references public.training_programs(id) on delete restrict,
  assessment_id uuid not null references public.training_assessments(id) on delete cascade,
  renews_certification_id uuid references public.certifications(id) on delete cascade,
  reassessment_id uuid,   -- FK to certification_reassessments added in w7c
  shop_id uuid references public.shops(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  shop_name_snapshot text not null, program_title_snapshot text not null, certification_title text not null,
  issuer_kind text not null default 'shop_issued',
  issued_at timestamptz not null default now(), approved_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_by_role text not null default 'owner', approver_display_name text not null,
  assessor_id uuid not null, assessor_role text not null, assessor_display_name text not null,
  attended_training_days smallint not null, required_training_days smallint not null,
  issuer_attestation_version text not null,
  validity_months smallint not null default 12, expires_at timestamptz not null,
  shop_verification_status_at_issue text not null, shop_verified_by_at_issue uuid not null,
  shop_verified_at_at_issue timestamptz not null, shop_verification_event_id bigint,
  evidence_snapshot jsonb not null,
  status text not null default 'active', status_reason text, status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint cert_title_length check (char_length(certification_title) between 3 and 160),
  constraint cert_snapshot_lengths check (char_length(shop_name_snapshot) between 1 and 200 and char_length(program_title_snapshot) between 1 and 160
                                          and char_length(approver_display_name) between 1 and 200 and char_length(assessor_display_name) between 1 and 200),
  constraint cert_issuer_kind_check check (issuer_kind = 'shop_issued'),
  constraint cert_approved_at_is_issued_at check (approved_at = issued_at),
  constraint cert_approved_by_role_check check (approved_by_role = 'owner'),
  constraint cert_assessor_role_check check (assessor_role in ('owner', 'trainer')),
  constraint cert_training_days_check check (attended_training_days >= 3 and required_training_days >= 3
                                             and attended_training_days >= required_training_days),
  constraint cert_attestation_version_check check (issuer_attestation_version = 'w7_issuer_v1'),
  constraint cert_validity_months_check check (validity_months between 1 and 36),
  constraint cert_expires_after_issue check (expires_at > issued_at),
  constraint cert_shop_verification_snapshot_check check (shop_verification_status_at_issue = 'approved'),
  constraint cert_evidence_snapshot_check check (jsonb_typeof(evidence_snapshot) = 'object'
                                                 and pg_column_size(evidence_snapshot) <= 32768),
  constraint cert_status_check check (status in ('active', 'suspended', 'revoked', 'superseded')),
  constraint cert_status_reason_length check (char_length(status_reason) between 20 and 500),
  constraint cert_status_reason_consistency check ((status in ('suspended', 'revoked')) = (status_reason is not null))
);

create unique index if not exists certifications_one_original_per_enrollment
  on public.certifications (enrollment_id) where renews_certification_id is null;
create unique index if not exists certifications_renewed_once on public.certifications (renews_certification_id);
create unique index if not exists certifications_reassessment_used_once on public.certifications (reassessment_id);
do $$
declare
  cols text;
begin
  foreach cols in array array['worker_id, status', 'shop_id, status', 'program_id, worker_id', 'expires_at', 'assessment_id',
                              'owner_id', 'approved_by', 'status_changed_by'] loop
    execute format('create index if not exists %I on public.certifications (%s)',
                   'certifications_' || replace(replace(cols, ', ', '_'), ' ', '') || '_idx', cols);
  end loop;
end $$;

comment on table public.certifications is
  'W7: shop-issued certifications (issuer_kind = shop_issued). Issued by the current owner of a shop with a recorded verification after >= 3 attended training days and a passed assessment. Not a government-recognized credential or licence. Issued facts are write-once; expiry is derived; retained after shop / owner deletion with snapshots (D-18).';

create table if not exists public.certification_status_events (
  id bigint generated always as identity primary key,
  certification_id uuid not null references public.certifications(id) on delete cascade,
  event text not null, from_status text, to_status text not null, reason text,
  actor_id uuid, actor_role text, actor_display_name text not null, review_request_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint cse_event_check check (event in ('issued', 'renewed', 'suspended', 'revoked', 'reinstated', 'superseded', 'review_upheld')),
  constraint cse_status_check check (to_status in ('active', 'suspended', 'revoked', 'superseded')
                                     and (from_status is null or from_status in ('active', 'suspended', 'revoked', 'superseded'))),
  constraint cse_reason_length check (char_length(reason) between 20 and 500),
  constraint cse_reason_consistency check ((event in ('suspended', 'revoked', 'reinstated', 'review_upheld')) = (reason is not null)),
  constraint cse_display_name_length check (char_length(actor_display_name) between 1 and 200)
);
create index if not exists certification_status_events_cert_idx on public.certification_status_events (certification_id, created_at);
create index if not exists certification_status_events_review_idx on public.certification_status_events (review_request_id);
comment on table public.certification_status_events is
  'W7: append-only status history of a certification (issued, renewed, suspended, revoked, reinstated, superseded, review_upheld). Reasons are visible to the certificate worker and the issuing shop owner only.';

-- -------------------------------------------------------------
-- 1) Guards (definer; every session, no trusted bypass) and the normaliser (invoker; g < n).
-- -------------------------------------------------------------
create or replace function public.certifications_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.certification_write', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id)
       or not exists (select 1 from public.training_enrollments e where e.id = old.enrollment_id) then
      return old;   -- FK cascade: the worker's own account or the enrollment is gone
    end if;
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if public.is_orphaned_fk_set_null('public.certifications'::regclass, to_jsonb(old), to_jsonb(new)) then
      return new;   -- D-18: shop / owner / approver removed; the certificate stays
    end if;
    if exists (select 1 from jsonb_each(to_jsonb(new)) entry
               where entry.key not in ('status', 'status_reason', 'status_changed_at', 'status_changed_by', 'updated_at')
                 and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
      raise exception 'Certification records cannot be edited.' using errcode = '42501';
    end if;
    if write_flag is distinct from new.id::text then
      raise exception 'Certifications change only through the certification actions.' using errcode = '42501';
    end if;
    if old.status = 'superseded' or new.status is not distinct from old.status then
      raise exception 'Certification records cannot be edited.' using errcode = '42501';
    end if;
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    new.updated_at := now();
    return new;
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Certifications are issued only through the certification actions.' using errcode = '42501';
  end if;
  new.issued_at := now();
  new.approved_at := new.issued_at;
  new.validity_months := public.shop_certification_validity_months(new.shop_id);
  new.expires_at := ((new.issued_at at time zone 'Asia/Manila') + make_interval(months => new.validity_months::integer))
                    at time zone 'Asia/Manila';
  new.issuer_kind := 'shop_issued';
  new.status := 'active';
  new.status_reason := null;
  new.status_changed_at := null;
  new.status_changed_by := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.certifications_normalize()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.status_reason := nullif(btrim(new.status_reason), '');
  if tg_op = 'INSERT' then
    new.certification_title := btrim(new.certification_title);
    new.approver_display_name := left(btrim(new.approver_display_name), 200);
    new.assessor_display_name := left(btrim(new.assessor_display_name), 200);
  end if;
  return new;
end;
$$;

create or replace function public.certification_status_events_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.certification_write', true), '');
begin
  if tg_op = 'UPDATE' then
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.certifications c where c.id = old.certification_id) then
      return old;   -- FK cascade: the certification is gone
    end if;
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if write_flag is distinct from new.certification_id::text then
    raise exception 'Certification records are written only through the certification actions.' using errcode = '42501';
  end if;
  new.actor_id := auth.uid();
  new.actor_role := public.current_user_profile_role();
  new.actor_display_name := left(coalesce(nullif(btrim(new.actor_display_name), ''), 'Trusted session'), 200);
  new.reason := nullif(btrim(new.reason), '');
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.shop_certification_policies_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.certification_write', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.shops s where s.id = old.shop_id) then
      return old;   -- FK cascade: the shop is gone
    end if;
    raise exception 'Certification settings cannot be deleted.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.shop_certification_policies'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if write_flag is distinct from new.shop_id::text then
    raise exception 'Certification settings change only through the certification actions.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.shop_id is distinct from old.shop_id or new.created_at is distinct from old.created_at) then
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['certifications', 'certifications_guard_write', 'before insert or update or delete'],
    array['certifications', 'certifications_normalize', 'before insert or update'],
    array['certification_status_events', 'certification_status_events_guard_write', 'before insert or update or delete'],
    array['shop_certification_policies', 'shop_certification_policies_guard_write', 'before insert or update or delete']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[2], item[1]);
    execute format('create trigger %I %s on public.%I for each row execute function public.%I()', item[2], item[3], item[1], item[2]);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 2) Read helpers (definer, authenticated) and RLS. Raw rows: only the CURRENT owner of the issuing shop
--    (copied owner_id AND shops.owner_id); the worker reads through my_certifications() /
--    certification_history() (w7g), never raw rows with actor ids. Policies: the current shop owner.
-- -------------------------------------------------------------
create or replace function public.is_current_certification_shop_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.current_user_profile_role() = 'owner', false)
    and exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = auth.uid());
$$;

create or replace function public.can_read_certification(p_certification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.certifications c
    where c.id = p_certification_id and auth.uid() is not null
      and ((c.worker_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false))
           or (c.owner_id = auth.uid() and public.is_current_certification_shop_owner(c.shop_id))));
$$;

revoke all on function public.is_current_certification_shop_owner(uuid) from public, anon, service_role;
revoke all on function public.can_read_certification(uuid) from public, anon, service_role;
grant execute on function public.is_current_certification_shop_owner(uuid) to authenticated;
grant execute on function public.can_read_certification(uuid) to authenticated;

alter table public.shop_certification_policies enable row level security;
alter table public.certifications enable row level security;
alter table public.certification_status_events enable row level security;
revoke all on table public.shop_certification_policies, public.certifications, public.certification_status_events
  from public, anon, authenticated, service_role;
grant select on table public.shop_certification_policies, public.certifications, public.certification_status_events to authenticated;

drop policy if exists "scp_select_current_owner" on public.shop_certification_policies;
create policy "scp_select_current_owner" on public.shop_certification_policies
  for select to authenticated using (public.is_current_certification_shop_owner(shop_id));
drop policy if exists "cert_select_worker_own" on public.certifications;   -- review polish: worker reads via w7g only
drop policy if exists "cert_select_issuing_owner" on public.certifications;
create policy "cert_select_issuing_owner" on public.certifications
  for select to authenticated
  using (owner_id = auth.uid() and public.is_current_certification_shop_owner(shop_id));
drop policy if exists "cse_select_certification_audience" on public.certification_status_events;
create policy "cse_select_certification_audience" on public.certification_status_events
  for select to authenticated
  using (coalesce(public.current_user_profile_role() = 'owner', false) and public.can_read_certification(certification_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['shop_certification_policies', 'certifications', 'certification_status_events'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

-- Realtime exclusion of all five W7 tables: w7c.
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a; roll back w7c first)
-- IRREVERSIBLE LOSS of issued certificates and their history: export first with a trusted
--   copy public.certifications to '<file>' (and certification_status_events, shop_certification_policies).
-- -------------------------------------------------------------
-- drop table if exists public.certification_status_events;   -- drops its triggers, policies and indexes
-- drop table if exists public.certifications;
-- drop table if exists public.shop_certification_policies;
-- drop function if exists public.can_read_certification(uuid);
-- drop function if exists public.is_current_certification_shop_owner(uuid);
-- drop function if exists public.shop_certification_policies_guard_write();
-- drop function if exists public.certification_status_events_guard_write();
-- drop function if exists public.certifications_normalize();
-- drop function if exists public.certifications_guard_write();
