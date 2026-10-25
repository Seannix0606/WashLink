-- =============================================================
-- WashLink W6c - training sessions, enrollments, the agreed-terms snapshot, read policies and the
-- D-18 shop-removal rule (spec D, C; D-15, D-18; W6 PLAN P24, P27). Requires w5b, w6b. Idempotent.
-- Sessions are never edited (cancel + add); each scheduled date is unique per program.
-- Enrollments: status has NO completed / failed value (P25: progress is derived in w6d).
-- P27: terms_snapshot / terms_snapshot_taken_at are write-once (null -> value) for EVERY session.
-- D-18: program_id ON DELETE RESTRICT; shop_id / owner_id / job_application_id ON DELETE SET NULL;
--       shop name, program title and owner name are snapshotted at invitation (meaningful to the
--       worker after shop / owner deletion). worker_id cascades (the worker's own account).
-- =============================================================

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  session_date date not null,
  start_time time,
  end_time time,
  location text,
  session_kind text not null,
  status text not null default 'scheduled',
  cancel_reason text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ts_session_kind_check check (session_kind in ('supervised_training', 'competency_assessment')),
  constraint ts_status_check check (status in ('scheduled', 'cancelled')),
  constraint ts_location_length check (char_length(location) <= 200),
  constraint ts_time_order check (start_time is null or end_time is null or end_time > start_time),
  constraint ts_cancel_reason_length check (char_length(cancel_reason) between 10 and 300),
  constraint ts_cancel_consistency check ((status = 'cancelled') = (cancel_reason is not null and cancelled_at is not null))
);
create unique index if not exists training_sessions_one_scheduled_per_date
  on public.training_sessions (program_id, session_date) where status = 'scheduled';
create index if not exists training_sessions_program_status_idx on public.training_sessions (program_id, status, session_date);
comment on table public.training_sessions is
  'W6: scheduled training days. session_kind records supervised training vs competency assessment; no productive-work value exists. Never edited: cancel (with a reason) and add.';

create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  job_application_id uuid references public.job_applications(id) on delete set null,
  shop_name_snapshot text not null,
  program_title_snapshot text not null,
  owner_display_name_snapshot text not null,
  status text not null default 'invited',
  invited_by uuid,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  status_changed_at timestamptz,
  notice_version text,
  notice_acknowledged_at timestamptz,
  terms_snapshot jsonb,
  terms_snapshot_taken_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint te_status_check check (status in ('invited', 'accepted', 'declined', 'withdrawn', 'cancelled')),
  constraint te_notice_version_check check (notice_version in ('w6_v1')),
  constraint te_terms_snapshot_check check (jsonb_typeof(terms_snapshot) = 'object' and pg_column_size(terms_snapshot) <= 65536),
  constraint te_cancel_reason_length check (char_length(cancel_reason) between 10 and 300),
  constraint te_snapshot_lengths check (char_length(shop_name_snapshot) <= 200 and char_length(program_title_snapshot) <= 120
                                        and char_length(owner_display_name_snapshot) <= 200),
  constraint te_lifecycle_consistency check (
    num_nulls(accepted_at, notice_version, notice_acknowledged_at, terms_snapshot, terms_snapshot_taken_at) in (0, 5)
    and (status not in ('accepted', 'withdrawn') or accepted_at is not null)
    and (status not in ('invited', 'declined') or accepted_at is null)
    and (status <> 'declined' or responded_at is not null)
    and (status not in ('withdrawn', 'cancelled') or ended_at is not null)
    and (status <> 'cancelled' or accepted_at is null or cancel_reason is not null))
);

create unique index if not exists training_enrollments_one_live_per_worker_program
  on public.training_enrollments (program_id, worker_id) where status in ('invited', 'accepted');
create index if not exists training_enrollments_worker_status_idx on public.training_enrollments (worker_id, status);
create index if not exists training_enrollments_program_status_idx on public.training_enrollments (program_id, status);
create index if not exists training_enrollments_owner_status_idx on public.training_enrollments (owner_id, status);
create index if not exists training_enrollments_shop_idx on public.training_enrollments (shop_id);
create index if not exists training_enrollments_application_idx on public.training_enrollments (job_application_id);
comment on table public.training_enrollments is
  'W6: worker enrollment in a training program (invited by the owner from an accepted application, accepted by the worker after the w6_v1 notice). Not a contract, an employment offer or a certification. Progress is derived (training_enrollment_progress). Retained after shop / owner deletion with name snapshots (D-18).';

-- -------------------------------------------------------------
-- 1) Agreed-terms snapshot (internal): every program content column under its own name
--    (worker_fee included, always 0), shop name / address, the schedule.
-- -------------------------------------------------------------
create or replace function public.training_enrollment_terms_snapshot(p public.training_programs)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'snapshot_version', 1,
    'shop_name', s.name, 'shop_address', s.address,
    'title', p.title, 'objectives', p.objectives, 'skills_to_learn', to_jsonb(p.skills_to_learn),
    'terms', p.terms, 'training_kind', p.training_kind, 'min_training_days', p.min_training_days,
    'assessment_checklist', to_jsonb(p.assessment_checklist), 'worker_fee', p.worker_fee,
    'training_pay_amount', p.training_pay_amount, 'training_pay_currency', p.training_pay_currency,
    'training_pay_period', p.training_pay_period, 'training_pay_details', p.training_pay_details,
    'reimbursement_details', p.reimbursement_details, 'owner_attestation_version', p.owner_attestation_version,
    'notice_version', 'w6_v1', 'schedule_changed_at', p.schedule_changed_at,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('session_id', ts.id, 'session_date', ts.session_date,
                                          'start_time', ts.start_time, 'end_time', ts.end_time,
                                          'session_kind', ts.session_kind, 'location', ts.location)
                       order by ts.session_date, ts.id)
      from public.training_sessions ts where ts.program_id = p.id and ts.status = 'scheduled'), '[]'::jsonb))
  from (select 1) one
  left join public.shops s on s.id = p.shop_id;
$$;

revoke all on function public.training_enrollment_terms_snapshot(public.training_programs)
  from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 2) Write guards (definer).
-- -------------------------------------------------------------
create or replace function public.training_sessions_guard_write()
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
    if not exists (select 1 from public.training_programs p where p.id = old.program_id) or write_flag = old.id::text then
      return old;
    end if;
    raise exception 'Training sessions cannot be deleted.' using errcode = '42501';
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Training sessions change only through the training actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'scheduled';
    new.cancel_reason := null;
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if old.status <> 'scheduled' or new.status <> 'cancelled' or exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('status', 'cancel_reason', 'cancelled_by', 'cancelled_at', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)) then
    raise exception 'Training sessions cannot be edited. Cancel the session and add a new one.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.training_enrollments_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.training_write', true), '');
begin
  if tg_op = 'UPDATE'
     and ((old.terms_snapshot is not null and new.terms_snapshot is distinct from old.terms_snapshot)
          or (old.terms_snapshot_taken_at is not null and new.terms_snapshot_taken_at is distinct from old.terms_snapshot_taken_at)) then
    raise exception 'The training terms snapshot cannot be changed.' using errcode = '42501';
  end if;
  if public.is_trusted_db_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id) then
      return old;   -- FK cascade: the worker's own profile / account was deleted
    end if;
    raise exception 'Training enrollments cannot be deleted.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and public.is_orphaned_fk_set_null('public.training_enrollments'::regclass, to_jsonb(old), to_jsonb(new)) then
    return new;   -- D-18: shop, owner or application removed; the record stays
  end if;
  if write_flag is distinct from new.id::text then
    raise exception 'Training enrollments change only through the training actions.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'invited' then
      raise exception 'Training enrollments start as invitations.' using errcode = '42501';
    end if;
    new.invited_at := now();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.program_id is distinct from old.program_id
     or new.shop_id is distinct from old.shop_id or new.owner_id is distinct from old.owner_id
     or new.worker_id is distinct from old.worker_id or new.job_application_id is distinct from old.job_application_id
     or new.shop_name_snapshot is distinct from old.shop_name_snapshot
     or new.program_title_snapshot is distinct from old.program_title_snapshot
     or new.owner_display_name_snapshot is distinct from old.owner_display_name_snapshot
     or new.invited_by is distinct from old.invited_by or new.invited_at is distinct from old.invited_at
     or new.created_at is distinct from old.created_at then
    raise exception 'This training enrollment field cannot be changed.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.training_sessions_guard_write() from public, anon, authenticated, service_role;
revoke all on function public.training_enrollments_guard_write() from public, anon, authenticated, service_role;

drop trigger if exists training_sessions_guard_write on public.training_sessions;
create trigger training_sessions_guard_write
  before insert or update or delete on public.training_sessions
  for each row execute function public.training_sessions_guard_write();
drop trigger if exists training_enrollments_guard_write on public.training_enrollments;
create trigger training_enrollments_guard_write
  before insert or update or delete on public.training_enrollments
  for each row execute function public.training_enrollments_guard_write();

-- -------------------------------------------------------------
-- 3) D-18 shop removal: programs WITHOUT enrollments (drafts, unused) are deleted with the shop; others are kept
--    (shop_id / owner_id set null by the FK). Read-only on shops. Programs are locked FOR UPDATE first (waits for a
--    concurrent invite's FOR SHARE) so the check sees its enrollment (no RESTRICT 23503). Orphan limit: TRAINING.md.
-- -------------------------------------------------------------
create or replace function public.shops_remove_unenrolled_training_programs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_flag text := coalesce(current_setting('washlink.training_write', true), '');
begin
  perform 1 from public.training_programs p where p.shop_id = old.id for update;
  perform set_config('washlink.training_write', 'shop_removed:' || old.id::text, true);
  delete from public.training_programs p
  where p.shop_id = old.id
    and not exists (select 1 from public.training_enrollments e where e.program_id = p.id);
  perform set_config('washlink.training_write', previous_flag, true);
  return old;
end;
$$;

revoke all on function public.shops_remove_unenrolled_training_programs() from public, anon, authenticated, service_role;
drop trigger if exists shops_remove_unenrolled_training_programs on public.shops;
create trigger shops_remove_unenrolled_training_programs
  before delete on public.shops
  for each row execute function public.shops_remove_unenrolled_training_programs();

-- -------------------------------------------------------------
-- 4) Read helpers (definer, authenticated) and RLS.
-- -------------------------------------------------------------
create or replace function public.worker_holds_training_enrollment(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.training_enrollments e
                 where e.program_id = p_program_id and e.worker_id = auth.uid());
$$;

create or replace function public.can_read_training_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_current_training_program_owner(p_program_id)
    or public.worker_holds_training_enrollment(p_program_id)
    or (public.is_designated_training_trainer(p_program_id)
        and exists (select 1 from public.training_programs p where p.id = p_program_id and p.status <> 'draft'));
$$;

revoke all on function public.worker_holds_training_enrollment(uuid) from public, anon, service_role;
revoke all on function public.can_read_training_program(uuid) from public, anon, service_role;
grant execute on function public.worker_holds_training_enrollment(uuid) to authenticated;
grant execute on function public.can_read_training_program(uuid) to authenticated;

drop policy if exists "tp_select_enrolled_worker" on public.training_programs;
create policy "tp_select_enrolled_worker" on public.training_programs
  for select to authenticated
  using (public.worker_holds_training_enrollment(id));

alter table public.training_sessions enable row level security;
alter table public.training_enrollments enable row level security;
revoke all on table public.training_sessions from public, anon, authenticated, service_role;
revoke all on table public.training_enrollments from public, anon, authenticated, service_role;
grant select on table public.training_sessions, public.training_enrollments to authenticated;

drop policy if exists "ts_select_program_audience" on public.training_sessions;
create policy "ts_select_program_audience" on public.training_sessions
  for select to authenticated using (public.can_read_training_program(program_id));
drop policy if exists "ts_no_client_insert" on public.training_sessions;
create policy "ts_no_client_insert" on public.training_sessions for insert to authenticated with check (false);
drop policy if exists "ts_no_client_update" on public.training_sessions;
create policy "ts_no_client_update" on public.training_sessions for update to authenticated using (false);
drop policy if exists "ts_no_client_delete" on public.training_sessions;
create policy "ts_no_client_delete" on public.training_sessions for delete to authenticated using (false);

drop policy if exists "te_select_worker_own" on public.training_enrollments;
create policy "te_select_worker_own" on public.training_enrollments
  for select to authenticated using (worker_id = auth.uid());
drop policy if exists "te_select_owner" on public.training_enrollments;
create policy "te_select_owner" on public.training_enrollments
  for select to authenticated
  using (owner_id = auth.uid() and public.is_current_training_program_owner(program_id));
drop policy if exists "te_select_trainer_accepted" on public.training_enrollments;
create policy "te_select_trainer_accepted" on public.training_enrollments
  for select to authenticated
  using (status = 'accepted' and public.is_designated_training_trainer(program_id));
drop policy if exists "te_no_client_insert" on public.training_enrollments;
create policy "te_no_client_insert" on public.training_enrollments for insert to authenticated with check (false);
drop policy if exists "te_no_client_update" on public.training_enrollments;
create policy "te_no_client_update" on public.training_enrollments for update to authenticated using (false);
drop policy if exists "te_no_client_delete" on public.training_enrollments;
create policy "te_no_client_delete" on public.training_enrollments for delete to authenticated using (false);

-- Realtime exclusion for every W6 table: w6d.
notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W6 rollbacks in reverse order i..a)
-- IRREVERSIBLE DATA LOSS (sessions, enrollments, terms snapshots): export first with a trusted
--   copy public.training_enrollments to '<file>'. Roll back w6d first.
-- -------------------------------------------------------------
-- drop trigger if exists shops_remove_unenrolled_training_programs on public.shops;
-- drop function if exists public.shops_remove_unenrolled_training_programs();
-- drop policy if exists "tp_select_enrolled_worker" on public.training_programs;
-- drop table if exists public.training_enrollments;   -- drops its triggers, policies and indexes
-- drop table if exists public.training_sessions;
-- drop function if exists public.can_read_training_program(uuid);
-- drop function if exists public.worker_holds_training_enrollment(uuid);
-- drop function if exists public.training_enrollments_guard_write();
-- drop function if exists public.training_sessions_guard_write();
-- drop function if exists public.training_enrollment_terms_snapshot(public.training_programs);
