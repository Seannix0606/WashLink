-- =============================================================
-- WashLink W5b - job applications table, opening snapshot, write guard, RLS (spec C, A; W5 PLAN P19-P22).
-- Requires 2026_10_24_w2a, w2f, w3a, w4b, w4c and the w5a preflight. Idempotent.
--
-- P19: every write goes through the w5c definer RPCs (no client role has INSERT/UPDATE/DELETE);
--      the guard accepts a change only under the transaction-local flag
--      washlink.job_application_write = <row id>, or `opening:<job_opening_id>` for the w5e
--      auto-close. Trusted SQL sessions bypass the guard for repair, EXCEPT P20.
-- P20: opening_snapshot / opening_snapshot_taken_at are write-once for EVERY session.
-- P22: there is no column where a worker can claim a certification.
-- `accepted` is a pipeline decision only, never a contract or an offer of employment (W9).
-- Audit rows keep no FK to this table (P11); the producer is in w5e.
-- =============================================================

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_opening_id uuid not null references public.job_openings(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(profile_id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'draft',
  cover_note text,
  notice_version text,
  notice_acknowledged_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  withdrawn_at timestamptz,
  closed_at timestamptz,
  status_changed_at timestamptz,
  opening_snapshot jsonb,
  opening_snapshot_taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_applications_status_check check (status in (
    'draft', 'submitted', 'under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn', 'closed')),
  constraint job_applications_cover_note_check check (char_length(cover_note) <= 1000),
  constraint job_applications_notice_version_check check (notice_version in ('w5_v1')),
  constraint job_applications_snapshot_check
    check (jsonb_typeof(opening_snapshot) = 'object' and pg_column_size(opening_snapshot) <= 65536),
  constraint ja_submission_consistency check (
    num_nulls(submitted_at, opening_snapshot, opening_snapshot_taken_at, notice_version, notice_acknowledged_at) in (0, 5)
    and (status <> 'draft' or submitted_at is null)
    and (status not in ('submitted', 'under_review', 'shortlisted', 'accepted', 'rejected') or submitted_at is not null)
    and (status not in ('accepted', 'rejected') or decided_at is not null)
    and (status <> 'withdrawn' or withdrawn_at is not null)
    and (status <> 'closed' or closed_at is not null))
);

-- J4 duplicate rule: one row per (opening, worker) that is not withdrawn (rejected / closed block).
create unique index if not exists job_applications_one_live_per_worker_opening
  on public.job_applications (job_opening_id, worker_id) where status <> 'withdrawn';
create index if not exists job_applications_worker_status_changed_idx
  on public.job_applications (worker_id, status_changed_at desc);
create index if not exists job_applications_owner_opening_status_idx
  on public.job_applications (owner_id, job_opening_id, status);
create index if not exists job_applications_opening_status_idx
  on public.job_applications (job_opening_id, status);
create index if not exists job_applications_shop_idx
  on public.job_applications (shop_id);

comment on table public.job_applications is
  'W5: worker applications to job openings. Writes only through the W5 RPCs. opening_snapshot is the write-once record of what the worker applied to (P20). "accepted" is an owner pipeline decision, not a contract, an offer of employment or a guarantee (W5-L2).';
comment on column public.job_applications.cover_note is
  'Optional worker text shown to the owning shop; editable only while draft. Never copied into audit payloads or notifications (P23).';

-- -------------------------------------------------------------
-- 1) Opening snapshot (internal). Keys = job_openings column names (the frontend reuses the
--    W4 mapper) plus snapshot_version, job_opening_updated_at, shop_name, shop_address.
-- -------------------------------------------------------------
create or replace function public.job_opening_application_snapshot(o public.job_openings)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'snapshot_version', 1,
    'job_opening_updated_at', o.updated_at,
    'shop_name', s.name,
    'shop_address', s.address,
    'title', o.title, 'description', o.description, 'duties', to_jsonb(o.duties),
    'work_location', o.work_location, 'openings_count', o.openings_count, 'job_type', o.job_type,
    'required_skills', to_jsonb(o.required_skills), 'minimum_years_experience', o.minimum_years_experience,
    'experience_requirement', o.experience_requirement, 'availability_requirement', o.availability_requirement,
    'schedule_details', o.schedule_details,
    'compensation_min_amount', o.compensation_min_amount, 'compensation_max_amount', o.compensation_max_amount,
    'compensation_currency', o.compensation_currency, 'compensation_period', o.compensation_period,
    'compensation_details', o.compensation_details, 'benefits', o.benefits, 'other_terms', o.other_terms,
    'minimum_qualifications', to_jsonb(o.minimum_qualifications),
    'preferred_qualifications', to_jsonb(o.preferred_qualifications),
    'required_training', o.required_training, 'applicant_requirement', o.applicant_requirement,
    'certification_expectations', o.certification_expectations,
    'application_deadline', o.application_deadline, 'application_instructions', o.application_instructions)
  from (select 1) one
  left join public.shops s on s.id = o.shop_id;
$$;

revoke all on function public.job_opening_application_snapshot(public.job_openings)
  from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 2) Write guard (definer). Order: (a) P20 for every session, (b) trusted repair,
--    (c) delete rules, (d) flag required, (e) immutable columns / frozen cover note, (f) stamp.
-- -------------------------------------------------------------
create or replace function public.job_applications_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.job_application_write', true), '');
begin
  if tg_op = 'UPDATE'
     and ((old.opening_snapshot is not null and new.opening_snapshot is distinct from old.opening_snapshot)
          or (old.opening_snapshot_taken_at is not null
              and new.opening_snapshot_taken_at is distinct from old.opening_snapshot_taken_at))
  then
    raise exception 'The application snapshot cannot be changed.' using errcode = '42501';
  end if;

  if public.is_trusted_db_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    -- FK cascade: the opening, worker profile, shop or owner profile is already gone.
    if not exists (select 1 from public.job_openings j where j.id = old.job_opening_id)
       or not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id)
       or not exists (select 1 from public.shops s where s.id = old.shop_id)
       or not exists (select 1 from public.profiles p where p.id = old.owner_id)
    then
      return old;
    end if;
    -- Never-sent rows only: a draft, or a draft closed by the w5e auto-close (submitted_at null).
    if write_flag = old.id::text and old.submitted_at is null then
      return old;
    end if;
    raise exception 'Only draft applications can be deleted.' using errcode = '42501';
  end if;

  if not (write_flag = new.id::text
          or (tg_op = 'UPDATE' and write_flag = 'opening:' || old.job_opening_id::text and new.status = 'closed'))
  then
    raise exception 'Job applications change only through the application actions.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.job_opening_id is distinct from old.job_opening_id
       or new.worker_id is distinct from old.worker_id
       or new.shop_id is distinct from old.shop_id
       or new.owner_id is distinct from old.owner_id
       or new.created_at is distinct from old.created_at
    then
      raise exception 'This application field cannot be changed.' using errcode = '42501';
    end if;
    if new.cover_note is distinct from old.cover_note and old.status <> 'draft' then
      raise exception 'A submitted application cannot be edited.' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Normalisation (invoker, every session; fires after the guard: g < n). Trusted repairs are
-- stamped too.
create or replace function public.job_applications_normalize()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.cover_note := nullif(btrim(new.cover_note), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.job_applications_guard_write() from public, anon, authenticated, service_role;
revoke all on function public.job_applications_normalize() from public, anon, authenticated, service_role;

drop trigger if exists job_applications_guard_write on public.job_applications;
create trigger job_applications_guard_write
  before insert or update or delete on public.job_applications
  for each row execute function public.job_applications_guard_write();

drop trigger if exists job_applications_normalize on public.job_applications;
create trigger job_applications_normalize
  before insert or update on public.job_applications
  for each row execute function public.job_applications_normalize();

-- -------------------------------------------------------------
-- 3) Policy helpers. Definer so the policies can call them as the caller without a policy cycle.
--    worker_has_applied_to_job_opening: the caller has a SENT application (submitted_at set) to
--    the opening; a draft closed by the auto-close (status closed, never sent) does not count.
--    is_current_job_opening_owner (fix cycle 1): the caller is an owner account AND the CURRENT
--    owner of the opening's shop (shops.owner_id), so the owner_id copied into job_applications
--    is never trusted alone.
-- -------------------------------------------------------------
create or replace function public.is_current_job_opening_owner(p_job_opening_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.current_user_profile_role() = 'owner', false)
    and exists (
      select 1 from public.job_openings j
      join public.shops s on s.id = j.shop_id
      where j.id = p_job_opening_id
        and s.owner_id = auth.uid()
    );
$$;

revoke all on function public.is_current_job_opening_owner(uuid) from public, anon, service_role;
grant execute on function public.is_current_job_opening_owner(uuid) to authenticated;

create or replace function public.worker_has_applied_to_job_opening(p_job_opening_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.job_applications a
    where a.job_opening_id = p_job_opening_id
      and a.worker_id = auth.uid()
      and a.submitted_at is not null
  );
$$;

revoke all on function public.worker_has_applied_to_job_opening(uuid) from public, anon, service_role;
grant execute on function public.worker_has_applied_to_job_opening(uuid) to authenticated;

-- -------------------------------------------------------------
-- 4) Privileges and RLS. Worker: own rows (drafts and closed drafts included). Owner: SENT rows
--    (submitted_at is not null) of openings whose shop they currently own; never a draft, never a
--    draft closed by the auto-close (fix cycle 1, S-B1). Customers, anon, other owners and
--    super_admin (until W11): none.
-- -------------------------------------------------------------
alter table public.job_applications enable row level security;
revoke all on table public.job_applications from public, anon, authenticated, service_role;
grant select on table public.job_applications to authenticated;

drop policy if exists "ja_select_worker_own" on public.job_applications;
create policy "ja_select_worker_own" on public.job_applications
  for select to authenticated
  using (worker_id = auth.uid());

drop policy if exists "ja_select_owner_non_draft" on public.job_applications;
create policy "ja_select_owner_non_draft" on public.job_applications
  for select to authenticated
  using (owner_id = auth.uid()
         and submitted_at is not null
         and public.is_current_job_opening_owner(job_opening_id));

drop policy if exists "ja_no_client_insert" on public.job_applications;
create policy "ja_no_client_insert" on public.job_applications
  for insert to authenticated with check (false);
drop policy if exists "ja_no_client_update" on public.job_applications;
create policy "ja_no_client_update" on public.job_applications
  for update to authenticated using (false);
drop policy if exists "ja_no_client_delete" on public.job_applications;
create policy "ja_no_client_delete" on public.job_applications
  for delete to authenticated using (false);

-- -------------------------------------------------------------
-- 5) Applicants keep reading the CURRENT opening after it is paused / closed or the shop loses
--    verification (the snapshot stays the record). Folded into the W4 worker policy (same name)
--    instead of a new jo_select_for_applicants policy, so the W4 policy-list assertion holds.
-- -------------------------------------------------------------
drop policy if exists "jo_select_published_for_workers" on public.job_openings;
create policy "jo_select_published_for_workers" on public.job_openings
  for select to authenticated
  using (public.current_user_profile_role() = 'worker'
         and ((status = 'published' and public.shop_has_recorded_verification(shop_id))
              or (status <> 'draft' and public.worker_has_applied_to_job_opening(id))));

-- -------------------------------------------------------------
-- 6) Never streamed over Realtime (w2f / w4c pattern).
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise notice 'W5b: supabase_realtime is FOR ALL TABLES and includes job_applications. Record in the D-10 diff.';
    return;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_applications'
  ) then
    alter publication supabase_realtime drop table public.job_applications;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W5 rollbacks in reverse order e, d, c, b, a)
-- IRREVERSIBLE DATA LOSS (applications and snapshots): export first with a trusted
--   copy public.job_applications to '<file>' (or \copy in psql).
-- -------------------------------------------------------------
-- drop policy if exists "jo_select_published_for_workers" on public.job_openings;
-- create policy "jo_select_published_for_workers" on public.job_openings
--   for select to authenticated
--   using (public.current_user_profile_role() = 'worker'
--          and status = 'published'
--          and public.shop_has_recorded_verification(shop_id));
-- drop table if exists public.job_applications;   -- drops its triggers, policies and indexes
-- drop function if exists public.worker_has_applied_to_job_opening(uuid);
-- drop function if exists public.is_current_job_opening_owner(uuid);
-- drop function if exists public.job_applications_normalize();
-- drop function if exists public.job_applications_guard_write();
-- drop function if exists public.job_opening_application_snapshot(public.job_openings);
