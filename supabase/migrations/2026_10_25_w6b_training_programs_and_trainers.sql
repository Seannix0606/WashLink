-- =============================================================
-- WashLink W6b - training programs and owner-designated trainers (spec D, A; D-4, D-7, D-16, D-19;
-- W6 PLAN P24, P28). Requires w2a, w2d, w3a, w4b and the w6a preflight. Idempotent.
--
-- P24: every write goes through the w6e definer RPCs under the transaction-local flag
--      washlink.training_write = <row id> (`shop_removed:<shop id>` for the w6c shop-removal
--      trigger). No client role has INSERT/UPDATE/DELETE. Trusted SQL sessions may repair.
-- P28: required initial training is free: worker_fee is forced to 0 by CHECK for every session.
--      Optional training pay / reimbursement (D-7) is owner-entered, has NO defaults and is shown
--      verbatim; WashLink does not verify it (W6-L3).
-- D-18 (orchestrator override): shop_id / owner_id are ON DELETE SET NULL, not cascade, so a
--      program that holds enrollments survives shop / owner deletion and the worker-facing
--      evidence stays meaningful. Programs WITHOUT enrollments are removed with the shop (w6c).
-- =============================================================

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  objectives text,
  skills_to_learn text[] not null default '{}',
  terms text,
  training_kind text not null default 'required_initial',
  min_training_days smallint not null default 3,
  assessment_checklist text[] not null default '{}',
  worker_fee numeric(10,2) not null default 0,
  training_pay_amount numeric(10,2),
  training_pay_currency text,
  training_pay_period text,
  training_pay_details text,
  reimbursement_details text,
  status text not null default 'draft',
  owner_attestation_version text,
  owner_attested_at timestamptz,
  schedule_changed_at timestamptz,
  status_changed_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tp_title_length check (char_length(title) between 3 and 120),
  constraint tp_objectives_length check (char_length(objectives) between 1 and 2000),
  constraint tp_terms_length check (char_length(terms) between 1 and 4000),
  constraint tp_skills_count check (cardinality(skills_to_learn) <= 20),
  constraint tp_checklist_count check (cardinality(assessment_checklist) <= 30),
  constraint tp_training_kind_check check (training_kind in ('required_initial')),
  constraint tp_min_training_days_check check (min_training_days between 3 and 30),
  constraint tp_required_initial_training_is_free check (training_kind <> 'required_initial' or worker_fee = 0),
  constraint tp_worker_fee_is_zero check (worker_fee = 0),
  constraint tp_pay_amount_check check (training_pay_amount > 0),
  constraint tp_pay_currency_check check (training_pay_currency in ('PHP')),
  constraint tp_pay_period_check check (training_pay_period in ('day', 'session', 'program')),
  constraint tp_pay_details_length check (char_length(training_pay_details) <= 500),
  constraint tp_reimbursement_details_length check (char_length(reimbursement_details) <= 500),
  constraint tp_pay_all_or_nothing check (num_nulls(training_pay_amount, training_pay_currency, training_pay_period) in (0, 3)),
  constraint tp_status_check check (status in ('draft', 'open', 'closed', 'archived')),
  constraint tp_attestation_version_check check (owner_attestation_version in ('w6_owner_v1')),
  constraint tp_open_requires_content_and_attestation check (
    status = 'draft'
    or (objectives is not null and terms is not null and cardinality(assessment_checklist) >= 1
        and owner_attestation_version is not null and owner_attested_at is not null and opened_at is not null))
);

create index if not exists training_programs_shop_status_idx on public.training_programs (shop_id, status);
create index if not exists training_programs_owner_status_idx on public.training_programs (owner_id, status);

comment on table public.training_programs is
  'W6: shop training programs (required initial training only, always free: worker_fee = 0). Writes only through the W6 RPCs. Pay / reimbursement are owner-entered and shown verbatim (W6-L3). shop_id / owner_id are set null when the shop / owner is deleted so worker evidence is retained (D-18).';
comment on column public.training_programs.worker_fee is
  'W6: always 0 (tp_required_initial_training_is_free, tp_worker_fee_is_zero). No RPC accepts a fee.';

create table if not exists public.training_program_trainers (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  roster_worker_id uuid references public.workers(id) on delete set null,
  designated_by uuid not null,
  designated_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tpt_revocation_consistency check (num_nulls(revoked_by, revoked_at) in (0, 2))
);

create unique index if not exists training_program_trainers_one_live
  on public.training_program_trainers (program_id, trainer_id) where revoked_at is null;
create index if not exists training_program_trainers_trainer_idx on public.training_program_trainers (trainer_id);
create index if not exists training_program_trainers_roster_idx on public.training_program_trainers (roster_worker_id);

comment on table public.training_program_trainers is
  'W6: owner-designated trainers per program (D-4, D-16). A designation is one-way revocable; authority also needs the roster link (workers.user_id) to still exist. No trainer consent step (W6-L4).';

-- -------------------------------------------------------------
-- 1) Normalisation (invoker, every session; fires after the guard: g < n).
-- -------------------------------------------------------------
create or replace function public.training_programs_normalize()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.title := btrim(new.title);
  new.objectives := nullif(btrim(new.objectives), '');
  new.terms := nullif(btrim(new.terms), '');
  new.training_pay_currency := nullif(btrim(new.training_pay_currency), '');
  new.training_pay_period := nullif(btrim(new.training_pay_period), '');
  new.training_pay_details := nullif(btrim(new.training_pay_details), '');
  new.reimbursement_details := nullif(btrim(new.reimbursement_details), '');
  new.skills_to_learn := public.normalize_worker_text_list(new.skills_to_learn, 80, 'skill');
  new.assessment_checklist := public.normalize_worker_text_list(new.assessment_checklist, 200, 'checklist item');
  if exists (select 1 from unnest(new.assessment_checklist) item where char_length(item) < 3) then
    raise exception 'Each checklist item must be 3 to 200 characters.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- 2) Write guards (definer). Trusted repair bypasses; FK set-null cascades (shop / owner gone)
--    pass via is_orphaned_fk_set_null and change nothing else.
-- -------------------------------------------------------------
create or replace function public.training_programs_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
begin
  if public.is_trusted_db_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if write_flag = old.id::text or (old.shop_id is not null and write_flag = 'shop_removed:' || old.shop_id::text) then
      return old;
    end if;
    raise exception 'Only draft training programs can be deleted.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.training_programs'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Training programs change only through the training actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.shop_id is distinct from old.shop_id
     or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at
     or new.training_kind is distinct from old.training_kind or new.worker_fee is distinct from old.worker_fee then
    raise exception 'This training program field cannot be changed.' using errcode = '42501';
  end if;
  if old.status <> 'draft' and exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('status', 'owner_attestation_version', 'owner_attested_at', 'schedule_changed_at',
                            'status_changed_at', 'opened_at', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'An open training program cannot be edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.training_program_trainers_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
begin
  if public.is_trusted_db_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.training_programs p where p.id = old.program_id)
       or not exists (select 1 from public.profiles pr where pr.id = old.trainer_id) then
      return old;   -- FK cascade: program or trainer account removed
    end if;
    raise exception 'Trainer designations cannot be deleted. Revoke the trainer instead.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.training_program_trainers'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- roster row deleted: authority ends, history stays
  end if;
  if write_flag is distinct from new.id::text   -- w6f workers_revoke_unlinked_trainers: 'roster_unlinked:<roster row>'
     and not (tg_op = 'UPDATE' and write_flag = 'roster_unlinked:' || old.roster_worker_id::text) then
    raise exception 'Trainer designations change only through the training actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.designated_at := now();
    new.created_at := now();
    new.updated_at := now();
    new.revoked_by := null;
    new.revoked_at := null;
    return new;
  end if;
  if old.revoked_at is not null or new.revoked_at is null or exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('revoked_by', 'revoked_at', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'This trainer designation cannot be changed.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.training_programs_normalize() from public, anon, authenticated, service_role;
revoke all on function public.training_programs_guard_write() from public, anon, authenticated, service_role;
revoke all on function public.training_program_trainers_guard_write() from public, anon, authenticated, service_role;

drop trigger if exists training_programs_guard_write on public.training_programs;
create trigger training_programs_guard_write
  before insert or update or delete on public.training_programs
  for each row execute function public.training_programs_guard_write();
drop trigger if exists training_programs_normalize on public.training_programs;
create trigger training_programs_normalize
  before insert or update on public.training_programs
  for each row execute function public.training_programs_normalize();
drop trigger if exists training_program_trainers_guard_write on public.training_program_trainers;
create trigger training_program_trainers_guard_write
  before insert or update or delete on public.training_program_trainers
  for each row execute function public.training_program_trainers_guard_write();

-- -------------------------------------------------------------
-- 3) Authority helpers.
--    is_current_training_program_owner (policy helper, authenticated): role owner AND the CURRENT
--      owner of the program shop (shops.owner_id) AND the copied program.owner_id.
--    is_authorised_training_recorder (internal): 'owner' as above; 'trainer' when role worker,
--      an unrevoked designation exists and its roster link (workers.user_id = caller, same owner)
--      still exists; else null. A program whose shop was removed has no recorder.
--    is_designated_training_trainer (policy helper): recorder = 'trainer'.
-- -------------------------------------------------------------
create or replace function public.is_current_training_program_owner(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.current_user_profile_role() = 'owner', false)
    and exists (
      select 1 from public.training_programs p
      join public.shops s on s.id = p.shop_id
      where p.id = p_program_id and p.owner_id = auth.uid() and s.owner_id = auth.uid());
$$;

create or replace function public.is_authorised_training_recorder(p_program_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then null
    when public.is_current_training_program_owner(p_program_id) then 'owner'
    when coalesce(public.current_user_profile_role() = 'worker', false) and exists (
      select 1 from public.training_program_trainers t
      join public.training_programs p on p.id = t.program_id
      join public.workers w on w.id = t.roster_worker_id
      where t.program_id = p_program_id and t.trainer_id = auth.uid() and t.revoked_at is null
        and p.shop_id is not null and p.status <> 'draft' and w.user_id = auth.uid() and w.owner_id = p.owner_id)
      then 'trainer'
  end;
$$;

create or replace function public.is_designated_training_trainer(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.is_authorised_training_recorder(p_program_id) = 'trainer', false);
$$;

revoke all on function public.is_current_training_program_owner(uuid) from public, anon, service_role;
grant execute on function public.is_current_training_program_owner(uuid) to authenticated;
revoke all on function public.is_authorised_training_recorder(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_designated_training_trainer(uuid) from public, anon, service_role;
grant execute on function public.is_designated_training_trainer(uuid) to authenticated;

-- -------------------------------------------------------------
-- 4) Privileges and RLS. Programs: the current owner (every status); a designated trainer
--    (non-draft). The enrolled-worker policy is added in w6c (needs training_enrollments).
--    Trainers: the program owner and the trainer self. Writes: deny-all.
-- -------------------------------------------------------------
alter table public.training_programs enable row level security;
alter table public.training_program_trainers enable row level security;
revoke all on table public.training_programs from public, anon, authenticated, service_role;
revoke all on table public.training_program_trainers from public, anon, authenticated, service_role;
grant select on table public.training_programs to authenticated;
grant select on table public.training_program_trainers to authenticated;

drop policy if exists "tp_select_owner" on public.training_programs;
create policy "tp_select_owner" on public.training_programs
  for select to authenticated
  using (owner_id = auth.uid() and public.is_current_training_program_owner(id));
drop policy if exists "tp_select_trainer" on public.training_programs;
create policy "tp_select_trainer" on public.training_programs
  for select to authenticated
  using (status <> 'draft' and public.is_designated_training_trainer(id));
drop policy if exists "tp_no_client_insert" on public.training_programs;
create policy "tp_no_client_insert" on public.training_programs for insert to authenticated with check (false);
drop policy if exists "tp_no_client_update" on public.training_programs;
create policy "tp_no_client_update" on public.training_programs for update to authenticated using (false);
drop policy if exists "tp_no_client_delete" on public.training_programs;
create policy "tp_no_client_delete" on public.training_programs for delete to authenticated using (false);

drop policy if exists "tpt_select_owner_or_self" on public.training_program_trainers;
create policy "tpt_select_owner_or_self" on public.training_program_trainers
  for select to authenticated
  using (trainer_id = auth.uid() or public.is_current_training_program_owner(program_id));
drop policy if exists "tpt_no_client_insert" on public.training_program_trainers;
create policy "tpt_no_client_insert" on public.training_program_trainers for insert to authenticated with check (false);
drop policy if exists "tpt_no_client_update" on public.training_program_trainers;
create policy "tpt_no_client_update" on public.training_program_trainers for update to authenticated using (false);
drop policy if exists "tpt_no_client_delete" on public.training_program_trainers;
create policy "tpt_no_client_delete" on public.training_program_trainers for delete to authenticated using (false);

-- Realtime exclusion for every W6 table: w6d.
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- IRREVERSIBLE DATA LOSS (programs, designations): export first with a trusted
--   copy public.training_programs to '<file>' (or \copy in psql). Roll back w6c first.
-- -------------------------------------------------------------
-- drop table if exists public.training_program_trainers;   -- drops its triggers, policies and indexes
-- drop table if exists public.training_programs;
-- drop function if exists public.is_designated_training_trainer(uuid);
-- drop function if exists public.is_authorised_training_recorder(uuid);
-- drop function if exists public.is_current_training_program_owner(uuid);
-- drop function if exists public.training_program_trainers_guard_write();
-- drop function if exists public.training_programs_guard_write();
-- drop function if exists public.training_programs_normalize();
