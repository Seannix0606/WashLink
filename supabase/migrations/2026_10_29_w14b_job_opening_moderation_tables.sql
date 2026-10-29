-- =============================================================
-- WashLink W14b - job opening reports, moderation cases and the append-only moderation action history (spec A, B, H;
-- D-50..D-53; W14 PLAN 3.2, P72, P73, P78). Requires w2a, w2f, w4c, w5b, w14a. Idempotent.
-- P78: every INSERT / UPDATE goes through the W14 definer RPCs (w14c, w14d) under the transaction-local flags
--      washlink.job_opening_report_write = <report id> and washlink.job_opening_moderation_write = <case id> (an action
--      row is written under the flag of its case). No client role (anon, authenticated, service_role) has a write grant;
--      write policies deny all; a trusted session without the flag is refused too. The only flag-less UPDATE is an FK
--      set-null (opening, shop, owner or deciding administrator removed). Reports and actions are deleted only by
--      cascade (case or reporter account gone); cases are never deleted from the app.
-- Reads: NO client raw select (deny-all select policy, W11 N3), super_admin included; reads go through the w14e
--      definer functions only (the admin case read is audited). Statements, owner messages, admin notes and owner change
--      notes live only in these rows, never in audit payloads or notifications.
-- reported_snapshot / opening_snapshot are write-once copies of public.job_opening_application_snapshot().
-- =============================================================

create table if not exists public.job_opening_moderation_cases (
  id uuid primary key default gen_random_uuid(),
  job_opening_id uuid references public.job_openings(id) on delete set null,
  shop_id uuid references public.shops(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  opening_title_snapshot text not null,
  shop_name_snapshot text,
  status text not null default 'open',
  reason_kind text,
  owner_message text,
  admin_note text,
  owner_change_note text,
  opened_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jomc_status_check check (status in ('open', 'dismissed', 'paused_by_washlink', 'changes_submitted', 'lifted',
                                                 'closed_by_washlink', 'resolved_owner_closed')),
  constraint jomc_reason_kind_check check (reason_kind in ('age_requirement', 'other_discriminatory_requirement', 'worker_fee_or_deposit',
                                                           'unpaid_trial_or_training', 'misleading_terms', 'other')),
  constraint jomc_owner_message_length check (char_length(owner_message) between 20 and 500),
  constraint jomc_admin_note_length check (char_length(admin_note) between 20 and 1000),
  constraint jomc_owner_change_note_length check (char_length(owner_change_note) between 1 and 500),
  constraint jomc_snapshot_lengths check (char_length(opening_title_snapshot) <= 200 and char_length(shop_name_snapshot) <= 200),
  constraint jomc_revision_check check (revision >= 1),
  constraint jomc_status_consistency check (
    (status not in ('paused_by_washlink', 'changes_submitted', 'lifted', 'closed_by_washlink')
     or (reason_kind is not null and owner_message is not null))
    and (status <> 'dismissed' or admin_note is not null))
);
create unique index if not exists job_opening_moderation_cases_one_active_per_opening
  on public.job_opening_moderation_cases (job_opening_id) where status in ('open', 'paused_by_washlink', 'changes_submitted');
create index if not exists job_opening_moderation_cases_status_idx on public.job_opening_moderation_cases (status, opened_at);
create index if not exists job_opening_moderation_cases_owner_idx on public.job_opening_moderation_cases (owner_id, status);
create index if not exists job_opening_moderation_cases_opening_idx on public.job_opening_moderation_cases (job_opening_id);
create index if not exists job_opening_moderation_cases_shop_idx on public.job_opening_moderation_cases (shop_id);
create index if not exists job_opening_moderation_cases_decided_by_idx on public.job_opening_moderation_cases (decided_by);
comment on table public.job_opening_moderation_cases is
  'W14: WashLink moderation cases of a reported job opening (D-50..D-52). Opened only by a worker report; decided by a WashLink platform administrator (dismiss, pause with a hold, keep the pause, lift, close). A platform action on a listing, not a legal finding (P72). Owners read only decided cases, never reports (D-53).';

create table if not exists public.job_opening_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.job_opening_moderation_cases(id) on delete cascade,
  job_opening_id uuid references public.job_openings(id) on delete set null,
  reporter_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  category text not null,
  statement text not null,
  reported_snapshot jsonb not null,
  opening_status_at_report text not null,
  status text not null default 'open',
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  withdrawn_at timestamptz,
  constraint jor_category_check check (category in ('age_requirement', 'other_discriminatory_requirement', 'worker_fee_or_deposit',
                                                    'unpaid_trial_or_training', 'misleading_terms', 'other')),
  constraint jor_statement_length check (char_length(statement) between 20 and 1000),
  constraint jor_snapshot_object check (jsonb_typeof(reported_snapshot) = 'object'),
  constraint jor_opening_status_check check (opening_status_at_report in ('published', 'paused', 'closed', 'archived')),
  constraint jor_status_check check (status in ('open', 'closed', 'withdrawn')),
  constraint jor_outcome_check check (outcome in ('no_action', 'opening_paused', 'opening_closed', 'pause_lifted_after_changes')),
  constraint jor_status_consistency check (
    (status = 'open' and outcome is null and closed_at is null and withdrawn_at is null)
    or (status = 'closed' and outcome is not null and closed_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and outcome is null and closed_at is null and withdrawn_at is not null))
);
create unique index if not exists job_opening_reports_one_open_per_reporter_and_opening
  on public.job_opening_reports (reporter_id, job_opening_id) where status = 'open';
create index if not exists job_opening_reports_case_idx on public.job_opening_reports (case_id);
create index if not exists job_opening_reports_reporter_idx on public.job_opening_reports (reporter_id, status);
create index if not exists job_opening_reports_opening_idx on public.job_opening_reports (job_opening_id);
comment on table public.job_opening_reports is
  'W14: worker reports of a job opening (D-50). Statements are read only by the reporter and WashLink administrators (as "Reporter n"), never by the owner (D-53). reported_snapshot is write-once.';

create table if not exists public.job_opening_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.job_opening_moderation_cases(id) on delete cascade,
  action text not null,
  actor_role text,
  reason_kind text,
  owner_message text,
  opening_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jomca_action_check check (action in ('paused', 'closed', 'dismissed', 'changes_submitted', 'pause_kept', 'lifted', 'owner_closed')),
  constraint jomca_reason_kind_check check (reason_kind in ('age_requirement', 'other_discriminatory_requirement', 'worker_fee_or_deposit',
                                                            'unpaid_trial_or_training', 'misleading_terms', 'other')),
  constraint jomca_owner_message_length check (char_length(owner_message) between 20 and 500),
  constraint jomca_snapshot_object check (opening_snapshot is null or jsonb_typeof(opening_snapshot) = 'object')
);
create index if not exists job_opening_moderation_actions_case_idx on public.job_opening_moderation_actions (case_id, created_at);
comment on table public.job_opening_moderation_actions is
  'W14: append-only history of a moderation case (owner-visible for decided cases through owner_job_opening_moderation(), without the admin identity). opening_snapshot is the write-once opening content at that moment.';

-- -------------------------------------------------------------
-- 1) Guards (definer; every session; no trusted bypass except FK set null and cascades).
-- -------------------------------------------------------------
create or replace function public.job_opening_moderation_cases_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.job_opening_moderation_write', true), '');
begin
  if tg_op = 'DELETE' then
    raise exception 'Moderation records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.job_opening_moderation_cases'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- opening, shop, owner or deciding administrator removed; the case stays
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Moderation records change only through the WashLink moderation actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.reason_kind := null;
    new.owner_message := null;
    new.admin_note := null;
    new.owner_change_note := null;
    new.decided_by := null;
    new.opened_at := now();
    new.status_changed_at := now();
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.status is not distinct from old.status
     or (not coalesce((old.status || '>' || new.status) = any (array[
       'open>dismissed', 'open>paused_by_washlink', 'open>closed_by_washlink',
       'paused_by_washlink>changes_submitted', 'paused_by_washlink>lifted', 'paused_by_washlink>closed_by_washlink',
       'paused_by_washlink>resolved_owner_closed', 'changes_submitted>paused_by_washlink', 'changes_submitted>lifted',
       'changes_submitted>closed_by_washlink', 'changes_submitted>resolved_owner_closed']), false)
         -- the opening is gone (FK set null): an active case can only be dismissed
         and not (new.job_opening_id is null and old.status in ('paused_by_washlink', 'changes_submitted') and new.status = 'dismissed'))
     or exists (
       select 1 from jsonb_each(to_jsonb(new)) entry
       where entry.key not in ('status', 'reason_kind', 'owner_message', 'admin_note', 'owner_change_note', 'decided_by',
                               'status_changed_at', 'revision', 'updated_at')
         and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'Moderation records cannot be edited.' using errcode = '42501';
  end if;
  new.owner_message := nullif(btrim(new.owner_message), '');
  new.admin_note := nullif(btrim(new.admin_note), '');
  new.owner_change_note := nullif(btrim(new.owner_change_note), '');
  new.decided_by := case when new.status in ('dismissed', 'paused_by_washlink', 'closed_by_washlink', 'lifted') and public.is_super_admin()
                         then auth.uid() else old.decided_by end;
  new.status_changed_at := now();
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.job_opening_reports_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.job_opening_report_write', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.job_opening_moderation_cases c where c.id = old.case_id)
       or not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.reporter_id) then
      return old;   -- cascade: the case or the reporter account is gone
    end if;
    raise exception 'Moderation records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.job_opening_reports'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- the opening was removed; the report stays
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Moderation records change only through the WashLink moderation actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.statement := btrim(new.statement);
    new.status := 'open';
    new.outcome := null;
    new.closed_at := null;
    new.withdrawn_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if old.status <> 'open' or new.status not in ('closed', 'withdrawn') or exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('status', 'outcome', 'closed_at', 'withdrawn_at', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'Moderation records cannot be edited.' using errcode = '42501';
  end if;
  if new.status = 'closed' then
    new.closed_at := now();
    new.withdrawn_at := null;
  else
    new.withdrawn_at := now();
    new.closed_at := null;
    new.outcome := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.job_opening_moderation_actions_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.job_opening_moderation_cases c where c.id = old.case_id) then
      return old;   -- cascade: the case is gone
    end if;
    raise exception 'Moderation records cannot be edited.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Moderation records cannot be edited.' using errcode = '42501';
  end if;
  if coalesce(current_setting('washlink.job_opening_moderation_write', true), '') is distinct from new.case_id::text then
    raise exception 'Moderation records change only through the WashLink moderation actions.' using errcode = '42501';
  end if;
  new.actor_role := coalesce(public.current_user_profile_role(),
                             case when public.is_trusted_db_session() then 'trusted_session' else 'system' end);
  new.owner_message := nullif(btrim(new.owner_message), '');
  new.created_at := clock_timestamp();   -- history order = insert order, also within one transaction
  new.updated_at := new.created_at;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['job_opening_moderation_cases', 'job_opening_reports', 'job_opening_moderation_actions'] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', t || '_guard_write');
    execute format('drop trigger if exists %I on public.%I', t || '_guard_write', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.%I()',
                   t || '_guard_write', t, t || '_guard_write');
    -- Privileges and RLS: deny-all select and write policies (no client raw read, P78; reads only through w14e).
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_client_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (false)', t || '_no_client_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_client_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_no_client_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_client_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (false)', t || '_no_client_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_client_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (false)', t || '_no_client_delete', t);
    -- Realtime: refuse FOR ALL TABLES, drop the table if published (D-10 diff).
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
      raise exception 'W14b: supabase_realtime is FOR ALL TABLES and would publish % (D-10 diff). Aborting.', t;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a; roll back w14c..w14i first)
-- IRREVERSIBLE LOSS of reports, cases and the moderation history: export first with a trusted
-- copy public.job_opening_moderation_cases / job_opening_reports / job_opening_moderation_actions to '<file>'.
-- -------------------------------------------------------------
-- drop table if exists public.job_opening_moderation_actions;   -- drops its guard trigger, policies and indexes
-- drop table if exists public.job_opening_reports;
-- drop table if exists public.job_opening_moderation_cases;
-- drop function if exists public.job_opening_moderation_actions_guard_write();
-- drop function if exists public.job_opening_reports_guard_write();
-- drop function if exists public.job_opening_moderation_cases_guard_write();
