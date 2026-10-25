-- =============================================================
-- WashLink W5e - application audit producer, notifications, auto-close on opening close and
-- applicant notice on pause (spec B, C, I; W5 PLAN P23). Requires w3b, w3c, w3d, w4d, w5b, w5c.
-- Idempotent.
--
-- P23: audit payloads carry ids and status words only; notification texts never contain the
--      cover note, the snapshot, pay, terms, the applicant's name or contact data. Opening titles
--      and shop names go through notification_safe_label (generic label when unsafe).
-- Notification keys embed the audit event id (W3 pattern): one notification per recipient per
-- event. A notification problem never fails the action; an audit problem does (R9).
-- AFTER trigger order on job_openings (by name): job_openings_audit (w4d), then
-- job_openings_close_applications, then job_openings_notify_applicants_on_pause.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Application audit + notifications (internal).
-- -------------------------------------------------------------
create or replace function public.job_applications_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  write_flag text := coalesce(current_setting('washlink.job_application_write', true), '');
  row_data public.job_applications;
  changed_by text;
  event_id bigint;
  opening_label text;
  shop_label text;
  shop_inline_label text;
  status_label text;
  owner_recipient uuid;
begin
  if tg_op = 'DELETE' then row_data := old; else row_data := new; end if;
  -- Owner notifications go to the CURRENT owner of the opening's shop (fix cycle 1), and only
  -- when that is also the application's owner_id: after a shop transfer (trusted repair, w2b)
  -- neither the former owner nor the new owner (who cannot read the row until the repair also
  -- realigns job_openings / job_applications.owner_id) is told. Null = no owner notification.
  select s.owner_id into owner_recipient
  from public.job_openings j join public.shops s on s.id = j.shop_id
  where j.id = row_data.job_opening_id;
  if owner_recipient is distinct from row_data.owner_id then
    owner_recipient := null;
  end if;
  select public.notification_safe_label(j.title, 'A job opening') into opening_label
  from public.job_openings j where j.id = row_data.job_opening_id;
  opening_label := coalesce(opening_label, 'A job opening');
  select public.notification_safe_label(s.name, 'The shop'), public.notification_safe_label(s.name, 'the shop')
    into shop_label, shop_inline_label
  from public.shops s where s.id = row_data.shop_id;
  shop_label := coalesce(shop_label, 'The shop');
  shop_inline_label := coalesce(shop_inline_label, 'the shop');

  if tg_op = 'DELETE' then
    changed_by := case
      when not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id)
        then 'worker_profile_deleted'
      when not exists (select 1 from public.job_openings j where j.id = old.job_opening_id)
           or not exists (select 1 from public.shops s where s.id = old.shop_id)
           or not exists (select 1 from public.profiles p where p.id = old.owner_id)
        then 'opening_removed'
      when write_flag = old.id::text and auth.uid() = old.worker_id then 'worker'
      else 'trusted_session'
    end;
    event_id := public.record_workforce_audit_event(
      'job_application.deleted', 'job_application', old.id, old.worker_id,
      jsonb_build_object('job_opening_id', old.job_opening_id, 'shop_id', old.shop_id,
                         'from_status', old.status, 'deleted_by', changed_by));
    if changed_by = 'worker_profile_deleted' and owner_recipient is not null
       and old.status in ('submitted', 'under_review', 'shortlisted', 'accepted') then
      perform public.enqueue_notification_safely(
        owner_recipient, 'job_application.removed', 'Application removed',
        'An application was removed because the applicant deleted their profile.',
        format('job_application:%s:%s', old.id, event_id), 'job_opening', old.job_opening_id);
    elsif changed_by = 'opening_removed' and old.submitted_at is not null and old.status <> 'withdrawn' then
      perform public.enqueue_notification_safely(
        old.worker_id, 'job_application.removed', 'Application ended',
        'An application ended because the shop or its job opening was removed.',
        format('job_application:%s:%s', old.id, event_id), 'job_application', old.id);
    end if;
    return null;
  end if;

  changed_by := case
    when write_flag = 'opening:' || new.job_opening_id::text then 'opening_closed'
    when write_flag = new.id::text and auth.uid() = new.worker_id then 'worker'
    when write_flag = new.id::text and auth.uid() = new.owner_id then 'owner'
    else 'trusted_session'
  end;

  if tg_op = 'INSERT' then
    if new.status <> 'submitted' then
      perform public.record_workforce_audit_event(
        'job_application.created', 'job_application', new.id, new.worker_id,
        jsonb_build_object('job_opening_id', new.job_opening_id, 'shop_id', new.shop_id,
                           'status', new.status, 'changed_by', changed_by));
      return null;
    end if;
  elsif new.status is not distinct from old.status then
    return null;   -- draft cover-note edits and stamp-only repairs: no audit, no notification
  end if;

  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    event_id := public.record_workforce_audit_event(
      'job_application.submitted', 'job_application', new.id, new.worker_id,
      jsonb_build_object('job_opening_id', new.job_opening_id, 'shop_id', new.shop_id,
                         'from_status', case when tg_op = 'UPDATE' then old.status end,
                         'changed_by', changed_by));
    if changed_by = 'worker' and owner_recipient is not null then
      perform public.enqueue_notification_safely(
        owner_recipient, 'job_application.submitted', 'New job application',
        format('%s has a new application.', opening_label),
        format('job_application:%s:%s', new.id, event_id), 'job_application', new.id);
    end if;
    return null;
  end if;

  event_id := public.record_workforce_audit_event(
    'job_application.status_changed', 'job_application', new.id, new.worker_id,
    jsonb_build_object('job_opening_id', new.job_opening_id, 'shop_id', new.shop_id,
                       'from_status', old.status, 'to_status', new.status, 'changed_by', changed_by));
  if changed_by = 'owner' then
    status_label := case new.status
      when 'under_review' then 'Under review'
      when 'shortlisted' then 'Shortlisted'
      when 'accepted' then 'Accepted'
      when 'rejected' then 'Not selected'
      else 'Updated'
    end;
    perform public.enqueue_notification_safely(
      new.worker_id, 'job_application.status_changed', 'Application update',
      format('%s: your application for %s is now %s.%s', shop_label, opening_label, status_label,
             case when new.status = 'accepted' then ' This is not a contract.' else '' end),
      format('job_application:%s:%s', new.id, event_id), 'job_application', new.id);
  elsif changed_by = 'worker' and new.status = 'withdrawn' then
    if owner_recipient is not null then
      perform public.enqueue_notification_safely(
        owner_recipient, 'job_application.withdrawn', 'Application withdrawn',
        format('An applicant withdrew from %s.', opening_label),
        format('job_application:%s:%s', new.id, event_id), 'job_application', new.id);
    end if;
  elsif changed_by = 'opening_closed' and old.submitted_at is not null then
    perform public.enqueue_notification_safely(
      new.worker_id, 'job_application.closed', 'Application closed',
      format('%s at %s has closed, so your application was closed.', opening_label, shop_inline_label),
      format('job_application:%s:%s', new.id, event_id), 'job_application', new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.job_applications_audit() from public, anon, authenticated, service_role;

drop trigger if exists job_applications_audit on public.job_applications;
create trigger job_applications_audit
  after insert or update or delete on public.job_applications
  for each row execute function public.job_applications_audit();

-- -------------------------------------------------------------
-- 2) Auto-close: an opening moving to closed / archived closes its draft, submitted,
--    under_review and shortlisted applications. Accepted, rejected, withdrawn unchanged.
--    Bounded by the 500-per-opening cap (R2).
--    Fix cycle 1 (S-B1): drafts are KEPT as closed with submitted_at null (a "closed draft").
--    Chosen over deleting them: deletion would destroy worker-written text without any worker
--    action, and a closed draft is unreachable for the owner by construction (every owner read
--    path - RLS, applicant_profiles_for_job_opening, applicant_verified_certifications,
--    transition_job_application - requires submitted_at is not null). The worker still sees it
--    and may delete it with delete_job_application_draft. No notification is sent for it.
-- -------------------------------------------------------------
create or replace function public.job_openings_close_applications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_flag text := coalesce(current_setting('washlink.job_application_write', true), '');
begin
  perform set_config('washlink.job_application_write', 'opening:' || new.id::text, true);
  update public.job_applications a
  set status = 'closed', closed_at = now(), status_changed_at = now()
  where a.job_opening_id = new.id
    and a.status in ('draft', 'submitted', 'under_review', 'shortlisted');
  perform set_config('washlink.job_application_write', previous_flag, true);
  return null;
end;
$$;

revoke all on function public.job_openings_close_applications() from public, anon, authenticated, service_role;

drop trigger if exists job_openings_close_applications on public.job_openings;
create trigger job_openings_close_applications
  after update on public.job_openings
  for each row
  when (old.status is distinct from new.status and new.status in ('closed', 'archived'))
  execute function public.job_openings_close_applications();

-- -------------------------------------------------------------
-- 3) Pause notice to live applicants (submitted, under_review, shortlisted). The key uses the
--    latest job_opening.status_changed event of the row (written by job_openings_audit first).
-- -------------------------------------------------------------
create or replace function public.job_openings_notify_applicants_on_pause()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id bigint;
  opening_label text := public.notification_safe_label(new.title, 'A job opening');
  shop_label text;
  applicant record;
begin
  select e.id into event_id from public.workforce_audit_events e
  where e.subject_type = 'job_opening' and e.subject_id = new.id and e.action = 'job_opening.status_changed'
  order by e.id desc limit 1;
  select public.notification_safe_label(s.name, 'the shop') into shop_label
  from public.shops s where s.id = new.shop_id;
  for applicant in
    select a.id, a.worker_id from public.job_applications a
    where a.job_opening_id = new.id and a.status in ('submitted', 'under_review', 'shortlisted')
  loop
    perform public.enqueue_notification_safely(
      applicant.worker_id, 'job_opening.paused', 'Opening paused',
      format('%s at %s is paused. Your application stays open.', opening_label, coalesce(shop_label, 'the shop')),
      format('job_opening:%s:%s', new.id, coalesce(event_id, 0)), 'job_application', applicant.id);
  end loop;
  return null;
end;
$$;

revoke all on function public.job_openings_notify_applicants_on_pause() from public, anon, authenticated, service_role;

drop trigger if exists job_openings_notify_applicants_on_pause on public.job_openings;
create trigger job_openings_notify_applicants_on_pause
  after update on public.job_openings
  for each row
  when (old.status = 'published' and new.status = 'paused')
  execute function public.job_openings_notify_applicants_on_pause();

-- -------------------------------------------------------------
-- 4) W3a pin assertion repeated: no SECURITY DEFINER function in public / washlink_private
--    without pg_temp in its search_path (baseline-only handle_new_user excluded, D-10 row 17).
-- -------------------------------------------------------------
do $$
declare
  unpinned text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname in ('public', 'washlink_private')
    and not (n.nspname = 'public' and p.proname = 'handle_new_user' and p.pronargs = 0)
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) c
      where c like 'search_path=%'
        and 'pg_temp' = any (string_to_array(replace(substr(c, 13), ' ', ''), ','))
    );
  if unpinned is not null then
    raise exception 'W5e: SECURITY DEFINER functions without pg_temp in search_path: % (pin them; D-10 row 17)', unpinned;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W5 rollbacks in reverse order e, d, c, b, a)
-- Audit rows and notifications already written stay (append-only, P11).
-- -------------------------------------------------------------
-- drop trigger if exists job_openings_notify_applicants_on_pause on public.job_openings;
-- drop trigger if exists job_openings_close_applications on public.job_openings;
-- drop trigger if exists job_applications_audit on public.job_applications;
-- drop function if exists public.job_openings_notify_applicants_on_pause();
-- drop function if exists public.job_openings_close_applications();
-- drop function if exists public.job_applications_audit();
