-- =============================================================
-- WashLink W9i - retention of worker contracts and accepted applications (W9 PLAN 3.9, P53; W5-L10; D-18 / D-23
-- applied, D-32, D-35). Requires w5b, w9c..w9h. Idempotent.
-- Owner or shop removed (FK set null): never-sent drafts and unsent amendment drafts are deleted, a sent amendment is
--   withdrawn (the version in force stays), a sent initial offer stays (declinable only), accepted / active contracts
--   never change status (no fabricated termination). owner_removed_at / shop_removed_at are stamped.
-- Worker account removed: contracts the worker never accepted are deleted; accepted ones are kept for the owner (name
--   snapshot) with any pending version withdrawn; worker_removed_at is stamped.
-- retained_job_application_records: accepted applications deleted by a shop / owner cascade are copied first (only
--   while the worker profile exists); readable by the worker only; no client writes; removed with the worker profile.
-- =============================================================

create or replace function public.worker_contracts_retention()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_side boolean := (old.owner_id is not null and new.owner_id is null) or (old.shop_id is not null and new.shop_id is null);
  worker_side boolean := old.worker_id is not null and new.worker_id is null;
begin
  if not public.is_orphaned_fk_set_null('public.worker_contracts'::regclass, to_jsonb(old), to_jsonb(new)) then
    return null;
  end if;
  perform set_config('washlink.worker_contract_write', new.id::text, true);
  if (worker_side and new.accepted_at is null) or (owner_side and new.sent_at is null) then
    delete from public.worker_contracts where id = new.id;   -- never accepted by the removed worker / never sent
  else
    perform public.worker_contract_close_open_versions(new.id);
    update public.worker_contracts
    set owner_removed_at = case when new.owner_id is null then coalesce(owner_removed_at, now()) end,
        shop_removed_at = case when new.shop_id is null then coalesce(shop_removed_at, now()) end,
        worker_removed_at = case when new.worker_id is null then coalesce(worker_removed_at, now()) end
    where id = new.id;
  end if;
  perform set_config('washlink.worker_contract_write', '', true);
  return null;
end;
$$;

revoke all on function public.worker_contracts_retention() from public, anon, authenticated, service_role;
drop trigger if exists worker_contracts_retention on public.worker_contracts;
create trigger worker_contracts_retention
  after update on public.worker_contracts
  for each row
  when ((old.owner_id is not null and new.owner_id is null) or (old.shop_id is not null and new.shop_id is null)
        or (old.worker_id is not null and new.worker_id is null))
  execute function public.worker_contracts_retention();

-- -------------------------------------------------------------
-- Retained accepted applications (W5-L10)
-- -------------------------------------------------------------
create table if not exists public.retained_job_application_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  application_id uuid not null,   -- no FK: the application row is gone
  opening_snapshot jsonb not null,
  status text not null,
  submitted_at timestamptz not null,
  decided_at timestamptz,
  removed_at timestamptz not null default now(),
  removal_reason text not null default 'shop_or_owner_removed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rjar_application_unique unique (application_id),
  constraint rjar_status_check check (status = 'accepted'),
  constraint rjar_snapshot_check check (jsonb_typeof(opening_snapshot) = 'object' and pg_column_size(opening_snapshot) <= 65536),
  constraint rjar_removal_reason_check check (removal_reason = 'shop_or_owner_removed')
);
create index if not exists retained_job_application_records_worker_idx on public.retained_job_application_records (worker_id, removed_at desc);
comment on table public.retained_job_application_records is
  'W9: write-once copies of accepted job applications (opening snapshot and stamps) kept for the worker after the shop or owner was removed (W5-L10). No cover note. Worker-only read; removed with the worker profile.';

create or replace function public.retained_job_application_records_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id) then
      return old;   -- FK cascade: the worker profile is gone
    end if;
    raise exception 'Retained application records cannot be changed.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Retained application records cannot be changed.' using errcode = '42501';
  end if;
  if coalesce(current_setting('washlink.retained_application_write', true), '') is distinct from new.application_id::text then
    raise exception 'Retained application records are written only by WashLink.' using errcode = '42501';
  end if;
  new.removed_at := now();
  new.removal_reason := 'shop_or_owner_removed';
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.job_applications_retain_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'accepted' and old.submitted_at is not null and old.opening_snapshot is not null
     and exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id)
     and (not exists (select 1 from public.job_openings j where j.id = old.job_opening_id)
          or not exists (select 1 from public.shops s where s.id = old.shop_id)
          or not exists (select 1 from public.profiles p where p.id = old.owner_id)) then
    perform set_config('washlink.retained_application_write', old.id::text, true);
    insert into public.retained_job_application_records (worker_id, application_id, opening_snapshot, status, submitted_at, decided_at)
    values (old.worker_id, old.id, old.opening_snapshot, old.status, old.submitted_at, old.decided_at)
    on conflict (application_id) do nothing;
    perform set_config('washlink.retained_application_write', '', true);
  end if;
  return null;
end;
$$;

revoke all on function public.retained_job_application_records_guard_write() from public, anon, authenticated, service_role;
revoke all on function public.job_applications_retain_accepted() from public, anon, authenticated, service_role;
drop trigger if exists retained_job_application_records_guard_write on public.retained_job_application_records;
create trigger retained_job_application_records_guard_write
  before insert or update or delete on public.retained_job_application_records
  for each row execute function public.retained_job_application_records_guard_write();
drop trigger if exists job_applications_retain_accepted on public.job_applications;
create trigger job_applications_retain_accepted
  after delete on public.job_applications
  for each row when (old.status = 'accepted')
  execute function public.job_applications_retain_accepted();

alter table public.retained_job_application_records enable row level security;
revoke all on table public.retained_job_application_records from public, anon, authenticated, service_role;
grant select on table public.retained_job_application_records to authenticated;
drop policy if exists "rjar_select_own_worker" on public.retained_job_application_records;
create policy "rjar_select_own_worker" on public.retained_job_application_records
  for select to authenticated
  using (worker_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false));
drop policy if exists "rjar_no_client_insert" on public.retained_job_application_records;
create policy "rjar_no_client_insert" on public.retained_job_application_records for insert to authenticated with check (false);
drop policy if exists "rjar_no_client_update" on public.retained_job_application_records;
create policy "rjar_no_client_update" on public.retained_job_application_records for update to authenticated using (false);
drop policy if exists "rjar_no_client_delete" on public.retained_job_application_records;
create policy "rjar_no_client_delete" on public.retained_job_application_records for delete to authenticated using (false);

-- Worker read (invoker; plan 3.8, kept next to its table).
create or replace function public.my_retained_application_records()
returns table (record_id uuid, application_id uuid, opening_snapshot jsonb, status text, submitted_at timestamptz, decided_at timestamptz,
               removed_at timestamptz, removal_reason text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select r.id, r.application_id, r.opening_snapshot, r.status, r.submitted_at, r.decided_at, r.removed_at, r.removal_reason
  from public.retained_job_application_records r where r.worker_id = auth.uid()
  order by r.removed_at desc, r.id;
$$;
revoke all on function public.my_retained_application_records() from public, anon, service_role;
grant execute on function public.my_retained_application_records() to authenticated;

-- Realtime: no W9 table is ever published (w8c pattern; every W9 table exists now).
do $$
declare
  published text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W9i: supabase_realtime is FOR ALL TABLES and would publish the worker contract tables (D-10 diff). Aborting.';
  end if;
  for published in
    select pt.tablename::text from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
      and pt.tablename in ('contract_acknowledgement_texts', 'contract_problem_term_rules', 'worker_contracts', 'contract_versions',
                           'contract_version_clauses', 'contract_version_flags', 'contract_acceptances', 'retained_job_application_records')
  loop
    execute format('alter publication supabase_realtime drop table public.%I', published);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a)
-- IRREVERSIBLE for retained application copies: export first (trusted copy public.retained_job_application_records).
-- -------------------------------------------------------------
-- drop function if exists public.my_retained_application_records();
-- drop trigger if exists job_applications_retain_accepted on public.job_applications;
-- drop table if exists public.retained_job_application_records;   -- drops its trigger and policies
-- drop function if exists public.job_applications_retain_accepted(), public.retained_job_application_records_guard_write();
-- drop trigger if exists worker_contracts_retention on public.worker_contracts;
-- drop function if exists public.worker_contracts_retention();
