-- =============================================================
-- WashLink W12c - state of the scheduled workforce jobs (W12 PLAN 3.3, P83..P85; D-63..D-65). Requires w2a, w12a.
-- Idempotent.
-- One seeded row per job: certification_expiry_notices (W7 D-25 notices), worker_contract_expiry (W9 expiry, batch 25),
-- owner_relationship_refresh (W10 refresh, batch 50, cursor over (worker_id, owner_id)). batch_size is ignored for
-- the notices job (bounded by active certificates within 30 days, R8). The contract expiry job keeps its own cursor
-- (cursor_contract_id, fix cycle 1 N4) so a contract that keeps failing cannot hold back the others. A failed item is
-- counted (last_skipped_failed_count) with its SQLSTATE only (last_failed_sqlstates, at most 10 distinct codes; no ids,
-- no message text).
-- Guard (every session): INSERT / DELETE / TRUNCATE refused (the rows are seeded here under the state flag); UPDATE
-- only by a trusted session without a signed-in user (fix cycle 1 N2: also on the runner path), either under the
-- transaction flag washlink.scheduled_job_state_write = job_key (the w12e runner) or changing only enabled /
-- batch_size (runbook pause), else 42501. RLS on, deny-all,
-- no client privilege (service_role included), never published to Realtime. Counts only: no ids, names or contract data
-- (the cursor holds two uuids of the last refreshed pair and is never returned to a client).
-- =============================================================

create table if not exists public.workforce_scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  enabled boolean not null default true,
  batch_size integer not null,
  cursor_worker_id uuid,
  cursor_owner_id uuid,
  cursor_contract_id uuid,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_outcome text,
  last_processed_count integer not null default 0,
  last_changed_count integer not null default 0,
  last_skipped_locked_count integer not null default 0,
  last_skipped_failed_count integer not null default 0,
  last_failed_sqlstates text[] not null default '{}',
  last_pass_completed_at timestamptz,
  run_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workforce_scheduled_jobs_job_key_unique unique (job_key),
  constraint workforce_scheduled_jobs_job_key_check
    check (job_key in ('certification_expiry_notices', 'worker_contract_expiry', 'owner_relationship_refresh')),
  constraint workforce_scheduled_jobs_batch_size_check check (batch_size between 1 and 200),
  constraint workforce_scheduled_jobs_cursor_check check ((cursor_worker_id is null) = (cursor_owner_id is null)),
  constraint workforce_scheduled_jobs_contract_cursor_check check (cursor_contract_id is null or job_key = 'worker_contract_expiry'),
  constraint workforce_scheduled_jobs_failed_sqlstates_check
    check (cardinality(last_failed_sqlstates) <= 10
           and array_to_string(last_failed_sqlstates, ',') ~ '^([0-9A-Z]{5}(,[0-9A-Z]{5})*)?$'),
  constraint workforce_scheduled_jobs_last_outcome_check check (last_outcome in ('completed', 'disabled')),
  constraint workforce_scheduled_jobs_counts_check
    check (last_processed_count >= 0 and last_changed_count >= 0 and last_skipped_locked_count >= 0
           and last_skipped_failed_count >= 0 and run_count >= 0)
);

comment on table public.workforce_scheduled_jobs is
  'W12: state of the scheduled workforce jobs (one row per job). Written only by run_workforce_scheduled_job; a trusted session may change enabled / batch_size (runbook). Counts only.';

-- -------------------------------------------------------------
-- 1) Guard (every session).
-- -------------------------------------------------------------
create or replace function public.workforce_scheduled_jobs_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  state_flag text := coalesce(current_setting('washlink.scheduled_job_state_write', true), '');
  trusted boolean := auth.uid() is null and public.is_trusted_db_session() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role';
begin
  if tg_level = 'STATEMENT' or tg_op = 'DELETE' then
    raise exception 'Scheduled job state is written only by the runner.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not (trusted and state_flag = ('seed:' || new.job_key)) then
      raise exception 'Scheduled job state is written only by the runner.' using errcode = '42501';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.job_key is distinct from old.job_key or new.created_at is distinct from old.created_at then
    raise exception 'Scheduled job state is written only by the runner.' using errcode = '42501';
  end if;
  if trusted and (state_flag = old.job_key
                  or (to_jsonb(new) - array['enabled', 'batch_size', 'updated_at']) = (to_jsonb(old) - array['enabled', 'batch_size', 'updated_at'])) then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Scheduled job state is written only by the runner.' using errcode = '42501';
end;
$$;

revoke all on function public.workforce_scheduled_jobs_guard_write() from public, anon, authenticated, service_role;
drop trigger if exists workforce_scheduled_jobs_guard_write on public.workforce_scheduled_jobs;
create trigger workforce_scheduled_jobs_guard_write
  before insert or update or delete on public.workforce_scheduled_jobs
  for each row execute function public.workforce_scheduled_jobs_guard_write();
drop trigger if exists workforce_scheduled_jobs_guard_truncate on public.workforce_scheduled_jobs;
create trigger workforce_scheduled_jobs_guard_truncate
  before truncate on public.workforce_scheduled_jobs
  for each statement execute function public.workforce_scheduled_jobs_guard_write();

-- -------------------------------------------------------------
-- 2) Seed (one row per job; an existing row is kept as it is).
-- -------------------------------------------------------------
do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['certification_expiry_notices', '200'],
    array['worker_contract_expiry', '25'],
    array['owner_relationship_refresh', '50']
  ] loop
    if not exists (select 1 from public.workforce_scheduled_jobs j where j.job_key = item[1]) then
      perform set_config('washlink.scheduled_job_state_write', 'seed:' || item[1], true);
      insert into public.workforce_scheduled_jobs (job_key, batch_size) values (item[1], item[2]::integer);
    end if;
  end loop;
  perform set_config('washlink.scheduled_job_state_write', '', true);
end $$;

-- -------------------------------------------------------------
-- 3) Privileges, RLS (deny-all) and Realtime (never published).
-- -------------------------------------------------------------
alter table public.workforce_scheduled_jobs enable row level security;
revoke all on table public.workforce_scheduled_jobs from public, anon, authenticated, service_role;
drop policy if exists workforce_scheduled_jobs_no_client_select on public.workforce_scheduled_jobs;
create policy workforce_scheduled_jobs_no_client_select on public.workforce_scheduled_jobs for select to authenticated using (false);
drop policy if exists workforce_scheduled_jobs_no_client_insert on public.workforce_scheduled_jobs;
create policy workforce_scheduled_jobs_no_client_insert on public.workforce_scheduled_jobs for insert to authenticated with check (false);
drop policy if exists workforce_scheduled_jobs_no_client_update on public.workforce_scheduled_jobs;
create policy workforce_scheduled_jobs_no_client_update on public.workforce_scheduled_jobs for update to authenticated using (false);
drop policy if exists workforce_scheduled_jobs_no_client_delete on public.workforce_scheduled_jobs;
create policy workforce_scheduled_jobs_no_client_delete on public.workforce_scheduled_jobs for delete to authenticated using (false);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise exception 'W12c: supabase_realtime is FOR ALL TABLES and would publish workforce_scheduled_jobs (D-10 diff). Aborting.';
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename = 'workforce_scheduled_jobs') then
    alter publication supabase_realtime drop table public.workforce_scheduled_jobs;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W12 rollbacks in reverse order e..a). Roll back w12e and w12d first and
-- unregister the cron jobs first (scripts/supabase-scheduling/unregister_workforce_jobs.sql). Job history loss only.
-- -------------------------------------------------------------
-- drop table if exists public.workforce_scheduled_jobs;   -- drops its guard triggers and policies
-- drop function if exists public.workforce_scheduled_jobs_guard_write();
