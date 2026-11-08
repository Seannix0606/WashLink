-- =============================================================
-- WashLink W7c - worker review requests and renewal re-assessments (spec D; D-5, D-21, D-22;
-- W7 PLAN P30, P31, P36). Requires w7b. Idempotent.
-- certification_review_requests: a worker asks the issuing owner to review a suspension or
--   revocation (within 30 days of that decision, at most 3 per certificate, one open at a time).
--   open -> reinstated | upheld (issuing owner, reason) | withdrawn (worker). Decided rows are final.
-- certification_reassessments: renewal by re-assessment against the frozen program checklist,
--   recorded by the owner or a designated trainer (never the worker). Append-only for EVERY
--   session; a mistake is followed by a new row; the latest row per certificate is the current one.
-- Then the certifications.reassessment_id FK and the renewal consistency CHECK, and the Realtime
-- exclusion of all five W7 tables, and the certified worker-profile deletion guard (review polish).
-- =============================================================

create table if not exists public.certification_review_requests (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references public.certifications(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  status text not null default 'open',
  worker_statement text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decider_display_name text,
  decision_reason text,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crr_status_check check (status in ('open', 'reinstated', 'upheld', 'withdrawn')),
  constraint crr_statement_length check (char_length(worker_statement) between 20 and 1000),
  constraint crr_decision_reason_length check (char_length(decision_reason) between 20 and 500),
  constraint crr_decider_name_length check (char_length(decider_display_name) between 1 and 200),
  constraint crr_status_consistency check (
    (status = 'open' and decided_at is null and decision_reason is null and decider_display_name is null and withdrawn_at is null)
    or (status in ('reinstated', 'upheld') and decided_at is not null and decision_reason is not null
        and decider_display_name is not null and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null and decided_at is null and decision_reason is null))
);
create unique index if not exists certification_review_requests_one_open_per_certification
  on public.certification_review_requests (certification_id) where status = 'open';
create index if not exists certification_review_requests_cert_idx on public.certification_review_requests (certification_id, requested_at);
create index if not exists certification_review_requests_worker_idx on public.certification_review_requests (worker_id, status);
create index if not exists certification_review_requests_decided_by_idx on public.certification_review_requests (decided_by);
comment on table public.certification_review_requests is
  'W7: worker review requests against a suspension or revocation, decided by the issuing shop owner (D-21). Statements and reasons are visible to the certificate worker and the issuing shop owner only. Independent (super_admin) review is W11.';

create table if not exists public.certification_reassessments (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references public.certifications(id) on delete cascade,
  checklist_snapshot text[] not null,
  items_met boolean[] not null,
  result text not null,
  failure_reason text,
  assessor_comment text,
  assessed_by uuid not null,
  assessor_role text not null,
  assessor_designation_id uuid,
  assessor_display_name text not null,
  assessed_on date not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cra_result_check check (result in ('passed', 'failed')),
  constraint cra_items_match_checklist check (cardinality(items_met) = cardinality(checklist_snapshot)
                                              and cardinality(items_met) >= 1 and array_position(items_met, null) is null),
  constraint cra_pass_requires_every_item check (result = 'failed' or not (false = any (items_met))),
  constraint cra_failure_reason_check check ((result = 'failed') = (failure_reason is not null)
                                             and coalesce(char_length(failure_reason) between 10 and 300, true)),
  constraint cra_assessor_comment_length check (char_length(assessor_comment) <= 500),
  constraint cra_assessor_role_check check (assessor_role in ('owner', 'trainer')),
  constraint cra_designation_for_trainers check ((assessor_role = 'trainer') = (assessor_designation_id is not null)),
  constraint cra_display_name_length check (char_length(assessor_display_name) between 1 and 200)
);
create index if not exists certification_reassessments_cert_idx on public.certification_reassessments (certification_id, recorded_at);
comment on table public.certification_reassessments is
  'W7: renewal re-assessments (D-5, D-22) against the original program checklist. Append-only; the latest row per certification is current. Recorded by the shop owner or a designated trainer; not an electronic signature.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'certifications_reassessment_id_fkey'
                 and conrelid = 'public.certifications'::regclass) then
    alter table public.certifications add constraint certifications_reassessment_id_fkey
      foreign key (reassessment_id) references public.certification_reassessments(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cert_renewal_needs_reassessment'
                 and conrelid = 'public.certifications'::regclass) then
    alter table public.certifications add constraint cert_renewal_needs_reassessment
      check ((renews_certification_id is null) = (reassessment_id is null));
  end if;
end $$;

-- -------------------------------------------------------------
-- 1) Guards (definer; every session, no trusted bypass).
-- -------------------------------------------------------------
create or replace function public.certification_review_requests_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.certification_write', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.certifications c where c.id = old.certification_id)
       or not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id) then
      return old;
    end if;
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.certification_review_requests'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- the deciding owner account was deleted; the decision stays
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Review requests change only through the certification actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.worker_statement := btrim(new.worker_statement);
    new.requested_at := now();
    new.decided_at := null;
    new.decided_by := null;
    new.decider_display_name := null;
    new.decision_reason := null;
    new.withdrawn_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if old.status <> 'open' or new.status = 'open' or exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('status', 'decided_at', 'decided_by', 'decider_display_name', 'decision_reason', 'withdrawn_at', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  new.decision_reason := nullif(btrim(new.decision_reason), '');
  if new.status = 'withdrawn' then
    new.withdrawn_at := now();
  else
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.certification_reassessments_guard_write()
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
      return old;
    end if;
    raise exception 'Certification records cannot be edited.' using errcode = '42501';
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Certification records are written only through the certification actions.' using errcode = '42501';
  end if;
  new.failure_reason := nullif(btrim(new.failure_reason), '');
  new.assessor_comment := nullif(btrim(new.assessor_comment), '');
  new.assessed_on := (now() at time zone 'Asia/Manila')::date;
  new.recorded_at := clock_timestamp();   -- orders re-assessments recorded in one transaction
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.certification_review_requests_guard_write() from public, anon, authenticated, service_role;
revoke all on function public.certification_reassessments_guard_write() from public, anon, authenticated, service_role;

drop trigger if exists certification_review_requests_guard_write on public.certification_review_requests;
create trigger certification_review_requests_guard_write
  before insert or update or delete on public.certification_review_requests
  for each row execute function public.certification_review_requests_guard_write();
drop trigger if exists certification_reassessments_guard_write on public.certification_reassessments;
create trigger certification_reassessments_guard_write
  before insert or update or delete on public.certification_reassessments
  for each row execute function public.certification_reassessments_guard_write();

-- Review polish (D-18 / D-23): a worker may not delete (and re-create) the worker profile while certifications exist,
-- which would cascade away suspended / revoked certificates and their history. Deleting the whole account still
-- succeeds (the profiles row is already gone in that cascade, so the guard lets it through).
create or replace function public.worker_profiles_guard_certified_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.profiles p where p.id = old.profile_id)
     and exists (select 1 from public.certifications c where c.worker_id = old.profile_id) then
    raise exception 'A worker profile with certifications cannot be deleted. Delete the account instead.' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.worker_profiles_guard_certified_delete() from public, anon, authenticated, service_role;
drop trigger if exists worker_profiles_guard_certified_delete on public.worker_profiles;
create trigger worker_profiles_guard_certified_delete
  before delete on public.worker_profiles
  for each row execute function public.worker_profiles_guard_certified_delete();

-- -------------------------------------------------------------
-- 2) Privileges and RLS (issuing owner through the parent rule; the worker reads via w7g). Writes: deny-all.
-- -------------------------------------------------------------
alter table public.certification_review_requests enable row level security;
alter table public.certification_reassessments enable row level security;
revoke all on table public.certification_review_requests, public.certification_reassessments
  from public, anon, authenticated, service_role;
grant select on table public.certification_review_requests, public.certification_reassessments to authenticated;

drop policy if exists "crr_select_certification_audience" on public.certification_review_requests;
create policy "crr_select_certification_audience" on public.certification_review_requests
  for select to authenticated
  using (coalesce(public.current_user_profile_role() = 'owner', false) and public.can_read_certification(certification_id));
drop policy if exists "cra_select_certification_audience" on public.certification_reassessments;
create policy "cra_select_certification_audience" on public.certification_reassessments
  for select to authenticated
  using (coalesce(public.current_user_profile_role() = 'owner', false) and public.can_read_certification(certification_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['certification_review_requests', 'certification_reassessments'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', table_name || '_no_client_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (false)', table_name || '_no_client_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_no_client_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', table_name || '_no_client_delete', table_name);
  end loop;
end $$;

-- -------------------------------------------------------------
-- 3) Realtime: refuse FOR ALL TABLES, drop any W7 table that is published (D-10 diff).
-- -------------------------------------------------------------
do $$
declare
  published text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W7c: supabase_realtime is FOR ALL TABLES and would publish the certification tables (D-10 diff). Aborting.';
  end if;
  for published in
    select pt.tablename::text from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
      and pt.tablename in ('shop_certification_policies', 'certifications', 'certification_status_events',
                           'certification_review_requests', 'certification_reassessments')
  loop
    execute format('alter publication supabase_realtime drop table public.%I', published);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a; roll back w7d first)
-- IRREVERSIBLE LOSS of review requests and re-assessments: export first with a trusted copy.
-- -------------------------------------------------------------
-- drop trigger if exists worker_profiles_guard_certified_delete on public.worker_profiles;
-- drop function if exists public.worker_profiles_guard_certified_delete();
-- alter table public.certifications drop constraint if exists cert_renewal_needs_reassessment;
-- alter table public.certifications drop constraint if exists certifications_reassessment_id_fkey;
-- drop table if exists public.certification_reassessments;   -- drops its triggers, policies and indexes
-- drop table if exists public.certification_review_requests;
-- drop function if exists public.certification_reassessments_guard_write();
-- drop function if exists public.certification_review_requests_guard_write();
