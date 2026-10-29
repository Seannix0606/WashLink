-- =============================================================
-- WashLink W14i - audit producers and notifications for job opening reports and moderation cases (spec I; W3 pattern;
-- D-53, D-58; W14 PLAN 3.9, P78). Requires w3b, w3c, w3d, w14b. Idempotent.
-- Audit (AFTER INSERT / UPDATE / DELETE; definer; internal):
--   job_opening_report.submitted / .withdrawn / .closed / .deleted
--     subject job_opening, subject_profile the reporter; payload report_id, case_id, job_opening_id, category, outcome,
--     changed_by.
--   job_opening_moderation.opened / .paused / .closed / .dismissed / .changes_submitted / .pause_kept / .lifted /
--   .resolved_owner_closed / .deleted
--     subject job_opening, subject_profile the owner; payload case_id, job_opening_id, shop_id, from_status, to_status,
--     reason_kind, report_count, changed_by.
-- Payloads never carry statements, messages, notes, names or dates (W3 CHECK). FK set-null updates are not audited.
-- Notifications (enqueue_notification_safely; fixed texts; the opening label via notification_safe_label with the fallback
-- "A job opening"; keys job_opening_moderation:<case>:<event> and job_opening_report:<report>:closed; a repeated pause_kept
-- adds the case revision to its key so each one notifies): paused / closed / pause kept / lifted -> the current owner of
-- the opening; report closed -> its reporter. Nothing for report submitted / withdrawn, changes submitted, case views,
-- lookups or log searches. Trusted SQL (no auth.uid()) and cascades notify nobody. The W5 applicant pause / close notices
-- fire unchanged from job_openings.
-- Then the `W14` comment on every W14 function (the w14a preflight refuses W14-named objects without one); a missing W14
-- function aborts here.
-- =============================================================

create or replace function public.job_opening_reports_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.job_opening_reports := case when tg_op = 'DELETE' then old else new end;
  action text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;   -- the opening was removed (FK set null): nothing to tell
  end if;
  action := case when tg_op = 'INSERT' then 'submitted' when tg_op = 'DELETE' then 'deleted' else new.status end;
  perform public.record_workforce_audit_event('job_opening_report.' || action, 'job_opening', r.job_opening_id, r.reporter_id,
    jsonb_build_object('report_id', r.id, 'case_id', r.case_id, 'job_opening_id', r.job_opening_id, 'category', r.category,
      'outcome', r.outcome,
      'changed_by', case when tg_op = 'DELETE' then
                           case when not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.reporter_id)
                                then 'worker_profile_deleted' else 'case_deleted' end
                         when auth.uid() is null then 'trusted_session'
                         else coalesce(public.current_user_profile_role(), 'system') end));
  if action = 'closed' and auth.uid() is not null then
    perform public.enqueue_notification_safely(r.reporter_id, 'job_opening_report.closed', 'Report reviewed',
      'WashLink reviewed a job opening you reported.', format('job_opening_report:%s:closed', r.id), 'job_opening', r.job_opening_id);
  end if;
  return null;
end;
$$;

create or replace function public.job_opening_moderation_cases_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.job_opening_moderation_cases := case when tg_op = 'DELETE' then old else new end;
  action text;
  opening_owner uuid;
  opening_label text;
  notice_key text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;   -- opening, shop, owner or administrator removed (FK set null)
  end if;
  action := case when tg_op = 'INSERT' then 'opened' when tg_op = 'DELETE' then 'deleted'
                 when new.status = 'paused_by_washlink' and old.status = 'changes_submitted' then 'pause_kept'
                 when new.status = 'paused_by_washlink' then 'paused'
                 when new.status = 'closed_by_washlink' then 'closed'
                 else new.status end;
  perform public.record_workforce_audit_event('job_opening_moderation.' || action, 'job_opening', c.job_opening_id, c.owner_id,
    jsonb_build_object('case_id', c.id, 'job_opening_id', c.job_opening_id, 'shop_id', c.shop_id,
      'from_status', case when tg_op <> 'INSERT' then old.status end, 'to_status', case when tg_op <> 'DELETE' then c.status end,
      'reason_kind', c.reason_kind,
      'report_count', (select count(*)::integer from public.job_opening_reports r where r.case_id = c.id),
      'changed_by', case when tg_op = 'DELETE' then 'trusted_session' when auth.uid() is null then 'trusted_session'
                         when c.status = 'resolved_owner_closed' then 'owner'
                         else coalesce(public.current_user_profile_role(), 'system') end));
  if auth.uid() is null or action not in ('paused', 'closed', 'pause_kept', 'lifted') then
    return null;
  end if;
  select j.owner_id, public.notification_safe_label(j.title, 'A job opening') into opening_owner, opening_label
  from public.job_openings j
  join public.shops s on s.id = j.shop_id and s.owner_id = j.owner_id
  where j.id = c.job_opening_id;
  notice_key := format('job_opening_moderation:%s:%s', c.id, action) || case when action = 'pause_kept' then ':' || c.revision else '' end;
  perform public.enqueue_notification_safely(opening_owner, 'job_opening_moderation.' || action,
    case action when 'paused' then 'Job opening paused by WashLink' when 'closed' then 'Job opening closed by WashLink'
                when 'pause_kept' then 'WashLink kept the pause' else 'WashLink lifted the pause' end,
    case action when 'paused' then format('WashLink paused %s. Open it to read why and what to change.', opening_label)
                when 'closed' then format('WashLink closed %s. Open it to read why.', opening_label)
                when 'pause_kept' then format('WashLink kept the pause on %s. Open it to read why.', opening_label)
                else format('WashLink lifted the pause on %s. You can publish it again.', opening_label) end,
    notice_key, 'job_opening', c.job_opening_id);
  return null;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['job_opening_reports', 'job_opening_reports_audit'],
    array['job_opening_moderation_cases', 'job_opening_moderation_cases_audit']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[2], item[1]);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.%I()',
                   item[2], item[1], item[2]);
  end loop;
end $$;

-- Mark every W14 function with a `W14` comment. A missing W14 function aborts here.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'job_opening_moderation_cases_guard_write()', 'job_opening_reports_guard_write()', 'job_opening_moderation_actions_guard_write()',
    'job_opening_moderation_close_reports(uuid, text)', 'job_openings_guard_moderation()', 'job_openings_moderation_hold()',
    'job_openings_moderation_resolve()',
    'job_opening_report_max_open_per_worker()', 'job_opening_report_max_per_opening()', 'report_job_opening(uuid, text, text)',
    'job_opening_moderation_changed_since_pause(uuid, public.job_openings)',
    'withdraw_job_opening_report(uuid)', 'moderate_job_opening(uuid, integer, text, text, text, text)',
    'submit_job_opening_changes(uuid, text)',
    'my_job_opening_reports()', 'owner_job_opening_moderation()', 'admin_job_opening_moderation_queue(text)',
    'admin_job_opening_moderation_case(uuid)',
    'shop_reviewer_state(uuid, timestamptz)', 'shop_lacks_recorded_super_admin_review(uuid)', 'admin_unreviewed_approved_shops()',
    'rereview_approved_shop(uuid, text, text)', 'shops_zz_rereview_stamp()', 'shops_audit_rereview()',
    'admin_access_records_guard_write()', 'admin_access_record_lookup(text, uuid, text, text, integer)',
    'admin_worker_relationships(uuid, text, text)', 'admin_owner_relationships(uuid, text, text)',
    'oversight_flag_open_days()', 'oversight_flag_read_count()', 'my_workforce_activity(bigint, integer)',
    'admin_workforce_audit_log(text, text, uuid, uuid, uuid, timestamptz, timestamptz, bigint, integer)',
    'admin_oversight_access_flags()', 'admin_moderation_summary()',
    'job_opening_reports_audit()', 'job_opening_moderation_cases_audit()'
  ] loop
    if to_regprocedure('public.' || sig) is null then
      raise exception 'W14i: missing W14 function %', sig;
    end if;
    execute format('comment on function public.%s is %L', sig,
                   'W14: job opening moderation, unreviewed approved shops, relationship lookups and audit reads (created by the W14 migrations).');
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W14 rollbacks in reverse order i..a). Audit rows and notifications already
-- written stay (append-only, P11). The W14 function comments go with their functions in the w14h..w14b rollbacks.
-- -------------------------------------------------------------
-- drop trigger if exists job_opening_moderation_cases_audit on public.job_opening_moderation_cases;
-- drop trigger if exists job_opening_reports_audit on public.job_opening_reports;
-- drop function if exists public.job_opening_moderation_cases_audit();
-- drop function if exists public.job_opening_reports_audit();
