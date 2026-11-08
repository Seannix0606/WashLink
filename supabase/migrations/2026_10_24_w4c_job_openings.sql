-- =============================================================
-- WashLink W4c - owner job openings (spec B, A, G; W4 PLAN P15-P18).
-- Requires 2026_10_24_w2a, w2f (normalize_worker_text_list), w3a, w3b, w4a, w4b. Idempotent.
--
-- P16: no column describing pay, benefits, schedule or terms has a DEFAULT; empty means
--      "not specified by the shop". Nothing is derived, estimated or rounded.
-- P17: status changes only through transition_job_opening() (w4d), which sets the
--      transaction-local flag washlink.job_opening_transition = row id (P6 pattern).
--      owner_id, first_published_at, status_changed_at, created_at, updated_at are server stamps.
-- P18: drafts are visible only to their owner (not to super_admin either).
-- Audit rows keep no FK to this table (P11); the producer is in w4d.
-- =============================================================

create table if not exists public.job_openings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'draft',
  title text not null,
  description text,
  duties text[] not null default '{}',
  work_location text,
  openings_count smallint,
  job_type text,
  required_skills text[] not null default '{}',
  minimum_years_experience smallint,
  experience_requirement text,
  availability_requirement text,
  schedule_details text,
  compensation_min_amount numeric(10, 2),
  compensation_max_amount numeric(10, 2),
  compensation_currency text,
  compensation_period text,
  compensation_details text,
  benefits text,
  other_terms text,
  minimum_qualifications text[] not null default '{}',
  preferred_qualifications text[] not null default '{}',
  required_training text,
  applicant_requirement text,
  certification_expectations text,
  application_deadline date,
  application_instructions text,
  first_published_at timestamptz,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_openings_status_check
    check (status in ('draft', 'published', 'paused', 'closed', 'archived')),
  constraint job_openings_title_check check (char_length(title) between 3 and 120),
  constraint job_openings_description_check check (char_length(description) <= 4000),
  constraint job_openings_duties_check check (cardinality(duties) <= 20),
  constraint job_openings_work_location_check check (char_length(work_location) <= 200),
  constraint job_openings_openings_count_check check (openings_count between 1 and 100),
  constraint job_openings_job_type_check
    check (job_type in ('full_time', 'part_time', 'temporary', 'other')),
  constraint job_openings_required_skills_check check (cardinality(required_skills) <= 30),
  constraint job_openings_minimum_years_experience_check check (minimum_years_experience between 0 and 60),
  constraint job_openings_experience_requirement_check check (char_length(experience_requirement) <= 500),
  constraint job_openings_availability_requirement_check check (char_length(availability_requirement) <= 300),
  constraint job_openings_schedule_details_check check (char_length(schedule_details) <= 1000),
  constraint job_openings_compensation_min_amount_check
    check (compensation_min_amount > 0 and compensation_min_amount < 10000000),
  constraint job_openings_compensation_max_amount_check
    check (compensation_max_amount > 0 and compensation_max_amount < 10000000),
  constraint job_openings_compensation_range_check
    check (compensation_max_amount >= compensation_min_amount),
  constraint job_openings_compensation_currency_check check (compensation_currency = 'PHP'),
  constraint job_openings_compensation_period_check
    check (compensation_period in ('hour', 'day', 'week', 'month', 'per_task')),
  constraint job_openings_compensation_complete check (
    ((compensation_min_amount is null and compensation_max_amount is null) = (compensation_currency is null))
    and ((compensation_currency is null) = (compensation_period is null))),
  constraint job_openings_compensation_details_check check (char_length(compensation_details) <= 500),
  constraint job_openings_benefits_check check (char_length(benefits) <= 1000),
  constraint job_openings_other_terms_check check (char_length(other_terms) <= 2000),
  constraint job_openings_minimum_qualifications_check check (cardinality(minimum_qualifications) <= 20),
  constraint job_openings_preferred_qualifications_check check (cardinality(preferred_qualifications) <= 20),
  constraint job_openings_required_training_check check (char_length(required_training) <= 1000),
  constraint job_openings_applicant_requirement_check
    check (applicant_requirement in ('certification_required', 'trainees_welcome')),
  constraint job_openings_certification_expectations_check check (char_length(certification_expectations) <= 500),
  constraint job_openings_application_instructions_check check (char_length(application_instructions) <= 1000)
);

create index if not exists job_openings_owner_status_updated_idx
  on public.job_openings (owner_id, status, updated_at desc);
create index if not exists job_openings_shop_status_idx
  on public.job_openings (shop_id, status);
create index if not exists job_openings_published_idx
  on public.job_openings (first_published_at desc) where status = 'published';

comment on table public.job_openings is
  'W4: owner job openings. Pay, benefits and terms are owner-entered and shown verbatim; WashLink does not verify them (W4-L1). job_type is a schedule category, not a legal classification (W4-L2). "certification_required" means shop-issued certification only (W4-L5).';
comment on column public.job_openings.application_deadline is
  'Asia/Manila calendar date; applications are accepted through that day. No auto-close (R4).';

-- -------------------------------------------------------------
-- 1) Required-for-publish fields (the frontend mirrors this list).
-- -------------------------------------------------------------
create or replace function public.job_opening_missing_publish_fields(p_opening public.job_openings)
returns text[]
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(f.field_name order by f.position), '{}')
  from (values
    (1, 'title', nullif(btrim(coalesce(p_opening.title, '')), '') is null),
    (2, 'description', nullif(btrim(coalesce(p_opening.description, '')), '') is null),
    (3, 'work_location', nullif(btrim(coalesce(p_opening.work_location, '')), '') is null),
    (4, 'openings_count', p_opening.openings_count is null),
    (5, 'job_type', p_opening.job_type is null),
    (6, 'applicant_requirement', p_opening.applicant_requirement is null)
  ) as f(position, field_name, is_missing)
  where f.is_missing;
$$;

revoke all on function public.job_opening_missing_publish_fields(public.job_openings) from public, anon;
grant execute on function public.job_opening_missing_publish_fields(public.job_openings) to authenticated;

-- -------------------------------------------------------------
-- 2) Normalisation (invoker): trim, empty -> null, de-duplicated lists, updated_at.
--    Fires after job_openings_guard_write (trigger names sort g < n).
-- -------------------------------------------------------------
create or replace function public.job_openings_normalize()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  new.work_location := nullif(btrim(new.work_location), '');
  new.experience_requirement := nullif(btrim(new.experience_requirement), '');
  new.availability_requirement := nullif(btrim(new.availability_requirement), '');
  new.schedule_details := nullif(btrim(new.schedule_details), '');
  new.compensation_currency := nullif(btrim(new.compensation_currency), '');
  new.compensation_period := nullif(btrim(new.compensation_period), '');
  new.compensation_details := nullif(btrim(new.compensation_details), '');
  new.benefits := nullif(btrim(new.benefits), '');
  new.other_terms := nullif(btrim(new.other_terms), '');
  new.required_training := nullif(btrim(new.required_training), '');
  new.certification_expectations := nullif(btrim(new.certification_expectations), '');
  new.application_instructions := nullif(btrim(new.application_instructions), '');
  new.duties := public.normalize_worker_text_list(new.duties, 200, 'duty');
  new.required_skills := public.normalize_worker_text_list(new.required_skills, 60, 'skill');
  new.minimum_qualifications := public.normalize_worker_text_list(new.minimum_qualifications, 200, 'qualification');
  new.preferred_qualifications := public.normalize_worker_text_list(new.preferred_qualifications, 200, 'qualification');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.job_openings_normalize() from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 3) Write guard (definer; trusted sessions bypass for support / repair).
-- -------------------------------------------------------------
create or replace function public.job_openings_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := coalesce(public.current_user_profile_role(), '');
  shop_owner_id uuid;
  open_count integer;
  has_transition_flag boolean;
  content_changed boolean;
  manila_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if public.is_trusted_db_session() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if caller_role <> 'owner' then
      raise exception 'Only owner accounts can create job openings.' using errcode = '42501';
    end if;
    select s.owner_id into shop_owner_id from public.shops s where s.id = new.shop_id;
    if caller_id is null or shop_owner_id is distinct from caller_id then
      raise exception 'You can create job openings only for your own shop.' using errcode = '42501';
    end if;
    if new.status is distinct from 'draft' then
      raise exception 'Job openings start as drafts.' using errcode = '42501';
    end if;
    new.owner_id := shop_owner_id;
    new.created_at := now();
    new.updated_at := now();
    new.first_published_at := null;
    new.status_changed_at := null;
    perform pg_advisory_xact_lock(hashtextextended('job_openings:' || new.shop_id::text, 0));
    select count(*) into open_count
    from public.job_openings j
    where j.shop_id = new.shop_id and j.status <> 'archived';
    if open_count >= 50 then
      raise exception 'A shop can have at most 50 job openings that are not archived.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Cascade from a shop or owner account deletion (same detection as audit_roster_linked_delete).
    if not exists (select 1 from public.shops s where s.id = old.shop_id)
       or not exists (select 1 from public.profiles p where p.id = old.owner_id)
    then
      return old;
    end if;
    if caller_id is not null and old.owner_id = caller_id and old.status = 'draft' then
      return old;
    end if;
    raise exception 'Only draft job openings can be deleted.' using errcode = '42501';
  end if;

  -- UPDATE
  if caller_id is null or old.owner_id is distinct from caller_id or caller_role <> 'owner' then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  has_transition_flag :=
    coalesce(current_setting('washlink.job_opening_transition', true), '') = old.id::text;
  if new.id is distinct from old.id
     or new.shop_id is distinct from old.shop_id
     or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at
     or (not has_transition_flag and (new.first_published_at is distinct from old.first_published_at
                                      or new.status_changed_at is distinct from old.status_changed_at))
  then
    raise exception 'This job opening field cannot be changed.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not has_transition_flag then
    raise exception 'This job opening status change is not allowed.' using errcode = '42501';
  end if;
  select exists (
    select 1 from jsonb_each(to_jsonb(new)) entry
    where entry.key not in ('status', 'first_published_at', 'status_changed_at', 'updated_at')
      and entry.value is distinct from (to_jsonb(old) -> entry.key)
  ) into content_changed;
  if not content_changed then
    return new;
  end if;
  if old.status in ('closed', 'archived') then
    raise exception 'Closed or archived job openings cannot be edited.' using errcode = '42501';
  end if;
  if old.status in ('published', 'paused') then
    if cardinality(public.job_opening_missing_publish_fields(new)) > 0 then
      raise exception 'Complete the required job opening fields before publishing.' using errcode = '23514';
    end if;
    if new.application_deadline is distinct from old.application_deadline
       and new.application_deadline < manila_today
    then
      raise exception 'The application deadline has passed.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.job_openings_guard_write() from public, anon, authenticated, service_role;

drop trigger if exists job_openings_guard_write on public.job_openings;
create trigger job_openings_guard_write
  before insert or update or delete on public.job_openings
  for each row execute function public.job_openings_guard_write();

drop trigger if exists job_openings_normalize on public.job_openings;
create trigger job_openings_normalize
  before insert or update on public.job_openings
  for each row execute function public.job_openings_normalize();

-- -------------------------------------------------------------
-- 4) Privileges and RLS. Customers, anon and other owners: no rows.
--    A published opening of a shop that loses its recorded verification stays `published`
--    but is invisible to workers until re-verified.
-- -------------------------------------------------------------
alter table public.job_openings enable row level security;
revoke all on table public.job_openings from public, anon;
grant select, insert, update, delete on table public.job_openings to authenticated;

drop policy if exists "jo_select_owner" on public.job_openings;
create policy "jo_select_owner" on public.job_openings
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "jo_select_published_for_workers" on public.job_openings;
create policy "jo_select_published_for_workers" on public.job_openings
  for select to authenticated
  using (public.current_user_profile_role() = 'worker'
         and status = 'published'
         and public.shop_has_recorded_verification(shop_id));

drop policy if exists "jo_select_super_admin_non_draft" on public.job_openings;
create policy "jo_select_super_admin_non_draft" on public.job_openings
  for select to authenticated
  using (public.is_super_admin() and status <> 'draft');

drop policy if exists "jo_insert_owner" on public.job_openings;
create policy "jo_insert_owner" on public.job_openings
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "jo_update_owner" on public.job_openings;
create policy "jo_update_owner" on public.job_openings
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "jo_delete_owner_draft" on public.job_openings;
create policy "jo_delete_owner_draft" on public.job_openings
  for delete to authenticated
  using (owner_id = auth.uid() and status = 'draft');

-- -------------------------------------------------------------
-- 5) Never streamed over Realtime (w2f pattern).
-- -------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    raise notice 'W4c: supabase_realtime is FOR ALL TABLES and includes job_openings. Record in the D-10 diff.';
    return;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_openings'
  ) then
    alter publication supabase_realtime drop table public.job_openings;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W4 rollbacks in reverse order d, c, b, a)
-- IRREVERSIBLE DATA LOSS: export first with a trusted
--   copy public.job_openings to '<file>' (or \copy in psql).
-- -------------------------------------------------------------
-- drop policy if exists "jo_delete_owner_draft" on public.job_openings;
-- drop policy if exists "jo_update_owner" on public.job_openings;
-- drop policy if exists "jo_insert_owner" on public.job_openings;
-- drop policy if exists "jo_select_super_admin_non_draft" on public.job_openings;
-- drop policy if exists "jo_select_published_for_workers" on public.job_openings;
-- drop policy if exists "jo_select_owner" on public.job_openings;
-- drop trigger if exists job_openings_normalize on public.job_openings;
-- drop trigger if exists job_openings_guard_write on public.job_openings;
-- drop function if exists public.job_openings_guard_write();
-- drop function if exists public.job_openings_normalize();
-- drop function if exists public.job_opening_missing_publish_fields(public.job_openings);
-- drop table if exists public.job_openings;
