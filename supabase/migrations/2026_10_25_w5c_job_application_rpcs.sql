-- =============================================================
-- WashLink W5c - job application RPCs: the only write path and the state machine (spec C, B, J4, J5).
-- Requires w4b (shop_has_recorded_verification, is_verified_shop_owner), w4c, w5b. Idempotent.
--
-- Transitions (transition_job_application; super_admin and every other actor rejected):
--   draft -> submitted                               worker (self); apply checks again + notice
--   submitted -> under_review                        owning owner; opening published or paused
--   submitted | under_review | shortlisted -> rejected  owning owner; same; decided_at
--   under_review -> shortlisted                      owning owner; same
--   under_review | shortlisted -> accepted           owning owner; same + verified shop; decided_at
--   submitted | under_review | shortlisted | accepted -> withdrawn  worker (self); any opening status
--   draft | submitted | under_review | shortlisted -> closed        system only (w5e auto-close)
-- Errors: 42501 not found (no existence leak) / not allowed; 55000 stale; 23514 refusals.
-- =============================================================

create or replace function public.job_application_notice_version()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select 'w5_v1'::text $$;

revoke all on function public.job_application_notice_version() from public, anon, service_role;
grant execute on function public.job_application_notice_version() to authenticated;

-- -------------------------------------------------------------
-- 1) Shared apply checks (internal). Takes the opening row FOR SHARE (a no-op re-lock when
--    transition_job_application already holds it), then the worker advisory lock, then the
--    per-opening advisory lock (two workers can no longer both pass the 500 cap).
--    GLOBAL LOCK ORDER (fix cycle 1, all transaction-scoped):
--      job_openings row -> job_applications row -> worker advisory -> opening advisory.
--    transition_job_opening (w4d) takes the opening FOR UPDATE and only then (w5e auto-close)
--    the application rows, so every W5 path that locks both takes the opening FIRST:
--    create_job_application (opening, then a new row) and transition_job_application (opening
--    FOR SHARE, then the application FOR UPDATE, then these advisory locks for draft -> submitted).
--    Draft edit / delete lock only the application row and never wait for an opening lock.
--    No other code takes these advisory locks.
--    p_draft_id: the draft being submitted (excluded from the per-pair count).
-- -------------------------------------------------------------
create or replace function public.job_application_apply_checks(
  p_job_opening_id uuid,
  p_worker_id uuid,
  p_draft_id uuid default null
)
returns public.job_openings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  opening public.job_openings;
begin
  select * into opening from public.job_openings j where j.id = p_job_opening_id for share;
  if not found or opening.status = 'draft' then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  if opening.status = 'paused' then
    raise exception 'This job opening is paused and is not accepting applications.' using errcode = '23514';
  end if;
  if opening.status in ('closed', 'archived') then
    raise exception 'This job opening is closed.' using errcode = '23514';
  end if;
  if not public.shop_has_recorded_verification(opening.shop_id) then
    raise exception 'This shop cannot receive applications until its verification is reviewed.' using errcode = '23514';
  end if;
  if opening.application_deadline < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The application deadline for this opening has passed.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('job_applications:' || p_worker_id::text, 0));
  if (select count(*) from public.job_applications a
      where a.job_opening_id = p_job_opening_id and a.worker_id = p_worker_id
        and a.id is distinct from p_draft_id) >= 3 then
    raise exception 'You cannot apply to this job opening again.' using errcode = '23514';
  end if;
  if (select count(*) from public.job_applications a
      where a.worker_id = p_worker_id and a.status in ('submitted', 'under_review', 'shortlisted')) >= 50 then
    raise exception 'You have reached the limit of 50 open applications.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('job_opening_apps:' || p_job_opening_id::text, 0));
  -- Sent, not withdrawn (a draft closed by the auto-close was never sent and does not count).
  if (select count(*) from public.job_applications a
      where a.job_opening_id = p_job_opening_id and a.submitted_at is not null
        and a.status <> 'withdrawn') >= 500 then
    raise exception 'This job opening is not accepting more applications.' using errcode = '23514';
  end if;
  return opening;
end;
$$;

revoke all on function public.job_application_apply_checks(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 2) Create (draft or submitted). Every id, stamp and the snapshot are server-set.
-- -------------------------------------------------------------
create or replace function public.create_job_application(
  p_job_opening_id uuid,
  p_cover_note text default null,
  p_submit boolean default true,
  p_notice_version text default null
)
returns public.job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  opening public.job_openings;
  new_id uuid := gen_random_uuid();
  note text := nullif(btrim(p_cover_note), '');
  submit boolean := coalesce(p_submit, true);
  created public.job_applications;
begin
  if caller_id is null or coalesce(public.current_user_profile_role(), '') <> 'worker' then
    raise exception 'Only worker accounts can apply to job openings.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.worker_profiles wp where wp.profile_id = caller_id) then
    raise exception 'Create your worker profile before applying.' using errcode = '23514';
  end if;
  opening := public.job_application_apply_checks(p_job_opening_id, caller_id, null);
  if submit and p_notice_version is distinct from public.job_application_notice_version() then
    raise exception 'Review the training and work notice before applying.' using errcode = '23514';
  end if;
  if char_length(note) > 1000 then
    raise exception 'The cover note must be 1000 characters or fewer.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.job_application_write', new_id::text, true);
    insert into public.job_applications (
      id, job_opening_id, worker_id, shop_id, owner_id, status, cover_note,
      notice_version, notice_acknowledged_at, submitted_at, opening_snapshot, opening_snapshot_taken_at,
      status_changed_at, created_at, updated_at)
    values (
      new_id, opening.id, caller_id, opening.shop_id, opening.owner_id,
      case when submit then 'submitted' else 'draft' end, note,
      case when submit then public.job_application_notice_version() end,
      case when submit then now() end,
      case when submit then now() end,
      case when submit then public.job_opening_application_snapshot(opening) end,
      case when submit then now() end,
      now(), now(), now())
    returning * into created;
  exception when unique_violation then
    raise exception 'You have already applied to this job opening.' using errcode = '23505';
  end;
  perform set_config('washlink.job_application_write', '', true);
  return created;
end;
$$;

-- -------------------------------------------------------------
-- 3) Draft edit (optimistic concurrency on updated_at) and draft delete. Own drafts only; the
--    delete also removes the worker's own never-sent row closed by the auto-close (S-B1).
-- -------------------------------------------------------------
create or replace function public.update_job_application_draft(
  p_application_id uuid,
  p_cover_note text,
  p_expected_updated_at timestamptz
)
returns public.job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.job_applications;
  note text := nullif(btrim(p_cover_note), '');
begin
  select * into target from public.job_applications a where a.id = p_application_id for update;
  if not found or auth.uid() is null or target.worker_id is distinct from auth.uid()
     or coalesce(public.current_user_profile_role(), '') <> 'worker' or target.status <> 'draft'
  then
    raise exception 'Job application not found.' using errcode = '42501';
  end if;
  if target.updated_at is distinct from p_expected_updated_at then
    raise exception 'This application changed. Refresh and try again.' using errcode = '55000';
  end if;
  if char_length(note) > 1000 then
    raise exception 'The cover note must be 1000 characters or fewer.' using errcode = '23514';
  end if;
  perform set_config('washlink.job_application_write', target.id::text, true);
  update public.job_applications set cover_note = note where id = target.id returning * into target;
  perform set_config('washlink.job_application_write', '', true);
  return target;
end;
$$;

create or replace function public.delete_job_application_draft(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.job_applications;
begin
  select * into target from public.job_applications a where a.id = p_application_id for update;
  if not found or auth.uid() is null or target.worker_id is distinct from auth.uid()
     or coalesce(public.current_user_profile_role(), '') <> 'worker'
     or target.submitted_at is not null or target.status not in ('draft', 'closed')
  then
    raise exception 'Job application not found.' using errcode = '42501';
  end if;
  perform set_config('washlink.job_application_write', target.id::text, true);
  delete from public.job_applications where id = target.id;
  perform set_config('washlink.job_application_write', '', true);
end;
$$;

-- -------------------------------------------------------------
-- 4) Transition RPC (state machine above).
-- -------------------------------------------------------------
create or replace function public.transition_job_application(
  p_application_id uuid,
  p_from_status text,
  p_to_status text,
  p_notice_version text default null
)
returns public.job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.job_applications;
  opening public.job_openings;
  caller_id uuid := auth.uid();
  caller_role text := coalesce(public.current_user_profile_role(), '');
  actor text;
  pair text := coalesce(p_from_status, '') || '>' || coalesce(p_to_status, '');
  opening_id uuid;
begin
  -- Lock order (see section 1): opening FOR SHARE first, then the application FOR UPDATE.
  -- job_opening_id is immutable (guard), so the unlocked read cannot pick a wrong opening.
  select a.job_opening_id into opening_id from public.job_applications a where a.id = p_application_id;
  if found then
    select * into opening from public.job_openings j where j.id = opening_id for share;
    select * into target from public.job_applications a
    where a.id = p_application_id and a.job_opening_id = opening_id
    for update;
  end if;
  if target.id is not null and caller_id is not null then
    if target.worker_id = caller_id and caller_role = 'worker' then
      actor := 'worker';
    elsif target.owner_id = caller_id and caller_role = 'owner' and target.submitted_at is not null
          and public.is_current_job_opening_owner(target.job_opening_id) then
      actor := 'owner';
    end if;
  end if;
  if actor is null then
    raise exception 'Job application not found.' using errcode = '42501';
  end if;
  if target.status is distinct from p_from_status then
    raise exception 'This application changed. Refresh and try again.' using errcode = '55000';
  end if;
  if not (
    (actor = 'worker' and pair = any (array[
      'draft>submitted', 'submitted>withdrawn', 'under_review>withdrawn', 'shortlisted>withdrawn', 'accepted>withdrawn']))
    or (actor = 'owner' and pair = any (array[
      'submitted>under_review', 'submitted>rejected', 'under_review>rejected', 'shortlisted>rejected',
      'under_review>shortlisted', 'under_review>accepted', 'shortlisted>accepted'])))
  then
    raise exception 'This application status change is not allowed.' using errcode = '42501';
  end if;

  if pair = 'draft>submitted' then
    opening := public.job_application_apply_checks(target.job_opening_id, caller_id, target.id);
    if p_notice_version is distinct from public.job_application_notice_version() then
      raise exception 'Review the training and work notice before applying.' using errcode = '23514';
    end if;
  elsif actor = 'owner' then
    if opening.id is null or opening.status not in ('published', 'paused') then
      raise exception 'This job opening is closed.' using errcode = '23514';
    end if;
    if p_to_status = 'accepted' and not public.is_verified_shop_owner(target.shop_id) then
      raise exception 'Only a verified shop can accept applications.' using errcode = '42501';
    end if;
  end if;

  perform set_config('washlink.job_application_write', target.id::text, true);
  update public.job_applications a
  set status = p_to_status,
      status_changed_at = now(),
      submitted_at = case when pair = 'draft>submitted' then now() else a.submitted_at end,
      notice_version = case when pair = 'draft>submitted' then public.job_application_notice_version() else a.notice_version end,
      notice_acknowledged_at = case when pair = 'draft>submitted' then now() else a.notice_acknowledged_at end,
      opening_snapshot = case when pair = 'draft>submitted'
                              then public.job_opening_application_snapshot(opening) else a.opening_snapshot end,
      opening_snapshot_taken_at = case when pair = 'draft>submitted' then now() else a.opening_snapshot_taken_at end,
      decided_at = case when p_to_status in ('accepted', 'rejected') then now() else a.decided_at end,
      withdrawn_at = case when p_to_status = 'withdrawn' then now() else a.withdrawn_at end
  where a.id = target.id
  returning * into target;
  perform set_config('washlink.job_application_write', '', true);
  return target;
end;
$$;

revoke all on function public.create_job_application(uuid, text, boolean, text) from public, anon, service_role;
revoke all on function public.update_job_application_draft(uuid, text, timestamptz) from public, anon, service_role;
revoke all on function public.delete_job_application_draft(uuid) from public, anon, service_role;
revoke all on function public.transition_job_application(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.create_job_application(uuid, text, boolean, text) to authenticated;
grant execute on function public.update_job_application_draft(uuid, text, timestamptz) to authenticated;
grant execute on function public.delete_job_application_draft(uuid) to authenticated;
grant execute on function public.transition_job_application(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W5 rollbacks in reverse order e, d, c, b, a)
-- -------------------------------------------------------------
-- drop function if exists public.transition_job_application(uuid, text, text, text);
-- drop function if exists public.delete_job_application_draft(uuid);
-- drop function if exists public.update_job_application_draft(uuid, text, timestamptz);
-- drop function if exists public.create_job_application(uuid, text, boolean, text);
-- drop function if exists public.job_application_apply_checks(uuid, uuid, uuid);
-- drop function if exists public.job_application_notice_version();
