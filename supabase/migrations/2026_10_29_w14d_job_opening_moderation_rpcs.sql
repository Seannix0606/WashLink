-- =============================================================
-- WashLink W14d - job opening report and moderation RPCs (spec A, B, H; D-50..D-53; W14 PLAN 3.4, P72, P73, P78).
-- Requires w4c, w5b, w14b, w14c. Idempotent. Lock order: job_openings row -> case row -> report rows.
--   report    a worker with a worker profile who can read the opening (published at a shop with a recorded
--             verification, or non-draft and applied); six categories; statement 20..1000; one open report per worker
--             and opening; at most 3 reports per worker and opening and 10 open reports per worker (D-50), checked under
--             a per-worker advisory lock (N2). Attaches to the active case of the opening or opens one; reported_snapshot
--             is written once.
--   withdraw  the reporter; open -> withdrawn; the case is unchanged.
--   moderate  super_admin only: from open dismiss / pause / close, from changes_submitted keep_paused / lift / close, from
--             paused_by_washlink lift / close; once the opening is gone (FK set null) only dismiss, from any active status. Pause updates a published opening to paused (an already paused opening is
--             not updated); close updates published | paused to closed (the W5 auto-close fires). Never edits content,
--             archives, deletes or re-publishes an opening (D-51). Open reports close with the outcome.
--   submit    the current owner of the opening (role owner); paused_by_washlink -> changes_submitted, only after the
--             opening was edited after the pause (job_openings.updated_at later than the case status_changed_at AND the
--             opening content differs from the snapshot of the last paused / pause_kept action, N5).
-- RPC results never carry statements, admin notes or the deciding administrator.
-- =============================================================

create or replace function public.job_opening_report_max_open_per_worker()
returns integer language sql immutable set search_path = public, pg_temp as $$ select 10 $$;

create or replace function public.job_opening_report_max_per_opening()
returns integer language sql immutable set search_path = public, pg_temp as $$ select 3 $$;

-- N5 (internal): true when the opening content differs from the opening_snapshot of the case's last paused / pause_kept
-- action. Compared without the snapshot metadata (job_opening_updated_at) and the shop fields (shop_name, shop_address),
-- so a no-op save of the opening does not count as an edit. pause_kept sorts after paused at an equal created_at.
create or replace function public.job_opening_moderation_changed_since_pause(p_case uuid, o public.job_openings)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (a.opening_snapshot - 'job_opening_updated_at' - 'shop_name' - 'shop_address')
                          is distinct from (public.job_opening_application_snapshot(o) - 'job_opening_updated_at' - 'shop_name' - 'shop_address')
                   from public.job_opening_moderation_actions a
                   where a.case_id = p_case and a.action in ('paused', 'pause_kept') and a.opening_snapshot is not null
                   order by a.created_at desc, (a.action = 'pause_kept') desc, a.id desc
                   limit 1), true);
$$;

revoke all on function public.job_opening_moderation_changed_since_pause(uuid, public.job_openings) from public, anon, authenticated, service_role;

create or replace function public.report_job_opening(p_job_opening_id uuid, p_category text, p_statement text)
returns table (report_id uuid, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  o public.job_openings;
  shop_name text;
  clean_statement text := nullif(btrim(p_statement), '');
  active_case uuid;
  new_case uuid;
  new_report uuid := gen_random_uuid();
  created public.job_opening_reports;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'worker'
     or not exists (select 1 from public.worker_profiles wp where wp.profile_id = auth.uid()) then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  select * into o from public.job_openings j where j.id = p_job_opening_id for share;
  if o.id is null or not ((o.status = 'published' and public.shop_has_recorded_verification(o.shop_id))
                          or (o.status <> 'draft' and public.worker_has_applied_to_job_opening(o.id))) then
    raise exception 'Job opening not found.' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('age_requirement', 'other_discriminatory_requirement', 'worker_fee_or_deposit',
                                              'unpaid_trial_or_training', 'misleading_terms', 'other') then
    raise exception 'Choose a report reason.' using errcode = '22023';
  end if;
  if clean_statement is null or char_length(clean_statement) not between 20 and 1000 then
    raise exception 'Write 20 to 1000 characters.' using errcode = '23514';
  end if;
  -- N2: one report call per worker at a time, so parallel calls cannot both pass the open-report limits below. Taken after
  -- the opening row lock and before the case row lock (no other code takes this key).
  perform pg_advisory_xact_lock(hashtextextended('job_opening_reports:' || auth.uid()::text, 0));
  if exists (select 1 from public.job_opening_reports r where r.reporter_id = auth.uid() and r.job_opening_id = o.id and r.status = 'open') then
    raise exception 'You already reported this job opening.' using errcode = '23505';
  end if;
  if (select count(*) from public.job_opening_reports r where r.reporter_id = auth.uid() and r.status = 'open')
       >= public.job_opening_report_max_open_per_worker()
     or (select count(*) from public.job_opening_reports r where r.reporter_id = auth.uid() and r.job_opening_id = o.id)
       >= public.job_opening_report_max_per_opening() then
    raise exception 'You have reached the report limit. Wait for WashLink to review your reports.' using errcode = '23514';
  end if;
  select c.id into active_case from public.job_opening_moderation_cases c
  where c.job_opening_id = o.id and c.status in ('open', 'paused_by_washlink', 'changes_submitted') for update;
  if active_case is null then
    new_case := gen_random_uuid();
    select s.name into shop_name from public.shops s where s.id = o.shop_id;
    begin
      perform set_config('washlink.job_opening_moderation_write', new_case::text, true);
      insert into public.job_opening_moderation_cases (id, job_opening_id, shop_id, owner_id, opening_title_snapshot, shop_name_snapshot)
      values (new_case, o.id, o.shop_id, o.owner_id, o.title, left(shop_name, 200));
      active_case := new_case;
    exception when unique_violation then
      select c.id into active_case from public.job_opening_moderation_cases c
      where c.job_opening_id = o.id and c.status in ('open', 'paused_by_washlink', 'changes_submitted') for update;
    end;
    perform set_config('washlink.job_opening_moderation_write', '', true);
  end if;
  begin
    perform set_config('washlink.job_opening_report_write', new_report::text, true);
    insert into public.job_opening_reports (id, case_id, job_opening_id, reporter_id, category, statement, reported_snapshot,
                                            opening_status_at_report)
    values (new_report, active_case, o.id, auth.uid(), p_category, clean_statement, public.job_opening_application_snapshot(o), o.status)
    returning * into created;
  exception when unique_violation then
    raise exception 'You already reported this job opening.' using errcode = '23505';
  end;
  perform set_config('washlink.job_opening_report_write', '', true);
  return query select created.id, created.status, created.created_at;
end;
$$;

create or replace function public.withdraw_job_opening_report(p_report_id uuid)
returns table (report_id uuid, status text, withdrawn_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  r public.job_opening_reports;
begin
  select * into r from public.job_opening_reports x where x.id = p_report_id;
  if r.id is null or auth.uid() is null or r.reporter_id <> auth.uid() or coalesce(public.current_user_profile_role(), '') <> 'worker' then
    raise exception 'Report not found.' using errcode = '42501';
  end if;
  select * into r from public.job_opening_reports x where x.id = p_report_id for update;
  if r.status <> 'open' then
    raise exception 'This report is no longer open.' using errcode = '23514';
  end if;
  perform set_config('washlink.job_opening_report_write', r.id::text, true);
  update public.job_opening_reports set status = 'withdrawn' where id = r.id returning * into r;
  perform set_config('washlink.job_opening_report_write', '', true);
  return query select r.id, r.status, r.withdrawn_at;
end;
$$;

create or replace function public.moderate_job_opening(p_case_id uuid, p_expected_revision integer, p_action text, p_reason_kind text,
                                                       p_owner_message text, p_admin_note text)
returns table (case_id uuid, status text, revision integer, status_changed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  c public.job_opening_moderation_cases;
  o public.job_openings;
  clean_message text := nullif(btrim(p_owner_message), '');
  clean_note text := nullif(btrim(p_admin_note), '');
  needs_reason boolean := p_action in ('pause', 'close', 'keep_paused');
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can moderate job openings.' using errcode = '42501';
  end if;
  select * into c from public.job_opening_moderation_cases x where x.id = p_case_id;
  if c.id is null then
    raise exception 'Moderation case not found.' using errcode = '42501';
  end if;
  if c.job_opening_id is not null then
    select * into o from public.job_openings j where j.id = c.job_opening_id for update;
  end if;
  select * into c from public.job_opening_moderation_cases x where x.id = p_case_id for update;
  if p_expected_revision is distinct from c.revision then
    raise exception 'This case changed. Refresh and try again.' using errcode = '55000';
  end if;
  if p_action is null or p_action not in ('dismiss', 'pause', 'close', 'keep_paused', 'lift') then
    raise exception 'Choose a moderation action.' using errcode = '22023';
  end if;
  if not ((c.status = 'open' and p_action in ('dismiss', 'pause', 'close'))
          or (c.status = 'changes_submitted' and p_action in ('keep_paused', 'lift', 'close'))
          or (c.status = 'paused_by_washlink' and p_action in ('lift', 'close'))
          or (o.id is null and c.status in ('paused_by_washlink', 'changes_submitted') and p_action = 'dismiss')) then
    raise exception 'This action is not available for this case.' using errcode = '23514';
  end if;
  if o.id is null and p_action <> 'dismiss' then
    raise exception 'This job opening no longer exists.' using errcode = '23514';
  end if;
  if needs_reason and (p_reason_kind is null or p_reason_kind not in ('age_requirement', 'other_discriminatory_requirement',
      'worker_fee_or_deposit', 'unpaid_trial_or_training', 'misleading_terms', 'other')) then
    raise exception 'Choose a reason for this action.' using errcode = '22023';
  end if;
  if (needs_reason and clean_message is null) or char_length(clean_message) not between 20 and 500 then
    raise exception 'Write a message to the owner of 20 to 500 characters.' using errcode = '23514';
  end if;
  if (p_action = 'dismiss' and clean_note is null) or char_length(clean_note) not between 20 and 1000 then
    raise exception 'Write an internal note of 20 to 1000 characters.' using errcode = '23514';
  end if;
  if p_action in ('pause', 'close') and o.status not in ('published', 'paused') then
    raise exception 'Only a published or paused job opening can be paused or closed.' using errcode = '23514';
  end if;
  if (p_action = 'pause' and o.status = 'published') or p_action = 'close' then
    perform set_config('washlink.job_opening_moderation', o.id::text, true);
    perform set_config('washlink.job_opening_moderation_case', c.id::text, true);
    update public.job_openings set status = case when p_action = 'pause' then 'paused' else 'closed' end, status_changed_at = now()
    where id = o.id returning * into o;
    perform set_config('washlink.job_opening_moderation', '', true);
    perform set_config('washlink.job_opening_moderation_case', '', true);
  end if;
  perform set_config('washlink.job_opening_moderation_write', c.id::text, true);
  update public.job_opening_moderation_cases
  set status = case p_action when 'dismiss' then 'dismissed' when 'pause' then 'paused_by_washlink' when 'keep_paused' then 'paused_by_washlink'
                             when 'lift' then 'lifted' else 'closed_by_washlink' end,
      reason_kind = case when needs_reason then p_reason_kind else reason_kind end,
      owner_message = case when needs_reason or (p_action = 'lift' and clean_message is not null) then clean_message else owner_message end,
      admin_note = coalesce(clean_note, admin_note)
  where id = c.id
  returning * into c;
  insert into public.job_opening_moderation_actions (case_id, action, reason_kind, owner_message, opening_snapshot)
  values (c.id, case p_action when 'dismiss' then 'dismissed' when 'pause' then 'paused' when 'keep_paused' then 'pause_kept'
                              when 'lift' then 'lifted' else 'closed' end,
          case when p_action <> 'dismiss' then c.reason_kind end, case when p_action <> 'dismiss' then c.owner_message end,
          case when o.id is not null then public.job_opening_application_snapshot(o) end);
  perform public.job_opening_moderation_close_reports(c.id, case p_action when 'dismiss' then 'no_action' when 'lift' then 'pause_lifted_after_changes'
                                                                          when 'close' then 'opening_closed' else 'opening_paused' end);
  perform set_config('washlink.job_opening_moderation_write', '', true);
  return query select c.id, c.status, c.revision, c.status_changed_at;
end;
$$;

create or replace function public.submit_job_opening_changes(p_case_id uuid, p_note text default null)
returns table (case_id uuid, status text, revision integer, status_changed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  c public.job_opening_moderation_cases;
  o public.job_openings;
  clean_note text := nullif(btrim(p_note), '');
begin
  select * into c from public.job_opening_moderation_cases x where x.id = p_case_id;
  if c.id is null or c.job_opening_id is null or c.status in ('open', 'dismissed')
     or not public.is_current_job_opening_owner(c.job_opening_id) then
    raise exception 'Moderation case not found.' using errcode = '42501';
  end if;
  select * into o from public.job_openings j where j.id = c.job_opening_id for share;
  select * into c from public.job_opening_moderation_cases x where x.id = p_case_id for update;
  if c.status <> 'paused_by_washlink' then
    raise exception 'This job opening is not waiting for your changes.' using errcode = '23514';
  end if;
  if o.updated_at <= c.status_changed_at or not public.job_opening_moderation_changed_since_pause(c.id, o) then
    raise exception 'Edit the job opening before asking WashLink to check it.' using errcode = '23514';
  end if;
  if char_length(clean_note) > 500 then
    raise exception 'Write at most 500 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.job_opening_moderation_write', c.id::text, true);
  update public.job_opening_moderation_cases set status = 'changes_submitted', owner_change_note = clean_note where id = c.id
  returning * into c;
  insert into public.job_opening_moderation_actions (case_id, action, opening_snapshot)
  values (c.id, 'changes_submitted', public.job_opening_application_snapshot(o));
  perform set_config('washlink.job_opening_moderation_write', '', true);
  return query select c.id, c.status, c.revision, c.status_changed_at;
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.job_opening_report_max_open_per_worker()',
    'public.job_opening_report_max_per_opening()',
    'public.report_job_opening(uuid, text, text)',
    'public.withdraw_job_opening_report(uuid)',
    'public.moderate_job_opening(uuid, integer, text, text, text, text)',
    'public.submit_job_opening_changes(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a; roll back w14e first)
-- -------------------------------------------------------------
-- drop function if exists public.submit_job_opening_changes(uuid, text);
-- drop function if exists public.moderate_job_opening(uuid, integer, text, text, text, text);
-- drop function if exists public.withdraw_job_opening_report(uuid);
-- drop function if exists public.report_job_opening(uuid, text, text);
-- drop function if exists public.job_opening_report_max_per_opening();
-- drop function if exists public.job_opening_report_max_open_per_worker();
-- drop function if exists public.job_opening_moderation_changed_since_pause(uuid, public.job_openings);
