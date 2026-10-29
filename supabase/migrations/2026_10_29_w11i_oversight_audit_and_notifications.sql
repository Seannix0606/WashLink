-- =============================================================
-- WashLink W11i - audit producers and notifications for WashLink certification reviews and reported contract problems
-- (spec I; W3 pattern; D-48; W11 PLAN 3.9, P71). Requires w3b, w3c, w3d, w11b, w11e. Idempotent.
-- Audit (AFTER INSERT / UPDATE / DELETE; definer; internal):
--   certification_platform_review.opened / .decided / .withdrawn / .resolved_by_shop / .deleted
--     subject certification, subject_profile the worker; payload certification_id, platform_review_id, basis, from_status,
--     to_status, decision, escalated_from_request, changed_by.
--   worker_contract_dispute.raised / .responded / .withdrawn / .closed / .deleted
--     subject worker_contract, subject_profile the owner (the worker once the owner is gone, as W9); payload dispute_id,
--     contract_id, category, raised_by_role, from_status, to_status, resolution_kind, changed_by.
-- Payloads never carry statements, reasons, notes, names or dates (W3 CHECK). Case views are audited by the case reads
-- (w11d, w11g) and notify nobody; a first-view stamp is not audited a second time.
-- Notifications (enqueue_notification_safely; fixed texts; labels via notification_safe_label; keys
-- certification_platform_review:<id>:<event> and contract_dispute:<id>:<event>): review opened -> current issuing owner;
-- decided -> worker and current issuing owner; dispute raised -> the other party; closed -> both parties; withdrawn /
-- resolved / responded / case views -> none. Trusted SQL (no auth.uid()) and cascades notify nobody. A notification
-- problem never fails the action; an audit problem does (W3 rule).
-- Then the `W11` comment on every W11 function (the w11a preflight refuses W11-named objects without one); a missing
-- W11 function aborts here.
-- =============================================================

create or replace function public.certification_platform_reviews_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.certification_platform_reviews := case when tg_op = 'DELETE' then old else new end;
  cert public.certifications;
  program_label text;
  current_owner uuid;
  action text;
  changed_by text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;   -- deciding administrator account removed (FK set null): nothing to tell
  end if;
  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event('certification_platform_review.deleted', 'certification', old.certification_id, old.worker_id,
      jsonb_build_object('certification_id', old.certification_id, 'platform_review_id', old.id, 'basis', old.basis,
        'from_status', old.status, 'changed_by',
        case when not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id) then 'worker_profile_deleted'
             else 'certification_deleted' end));
    return null;
  end if;
  select * into cert from public.certifications c where c.id = r.certification_id;
  program_label := public.notification_safe_label(cert.program_title_snapshot, 'a training program');
  current_owner := case when cert.owner_id is not null
                         and exists (select 1 from public.shops s where s.id = cert.shop_id and s.owner_id = cert.owner_id)
                        then cert.owner_id end;
  changed_by := case when auth.uid() is null then 'trusted_session' when r.status = 'resolved_by_shop' then 'issuing_owner'
                     else coalesce(public.current_user_profile_role(), 'system') end;
  action := case when tg_op = 'INSERT' then 'opened' when r.status in ('reinstated', 'upheld') then 'decided' else r.status end;
  perform public.record_workforce_audit_event('certification_platform_review.' || action, 'certification', r.certification_id, r.worker_id,
    jsonb_build_object('certification_id', r.certification_id, 'platform_review_id', r.id, 'basis', r.basis,
      'from_status', case when tg_op = 'UPDATE' then old.status end, 'to_status', r.status,
      'decision', case when action = 'decided' then r.status end, 'escalated_from_request', r.escalated_from_request_id,
      'changed_by', changed_by));
  if auth.uid() is null then
    return null;
  end if;
  if action = 'opened' then
    perform public.enqueue_notification_safely(current_owner, 'certification_platform_review.opened', 'WashLink review requested',
      format('A worker asked WashLink to review a certification decision for %s.', program_label),
      format('certification_platform_review:%s:opened', r.id), 'certification', r.certification_id);
  elsif action = 'decided' then
    perform public.enqueue_notification_safely(r.worker_id, 'certification_platform_review.decided', 'WashLink review decided',
      format('WashLink reviewed your certification for %s: %s', program_label,
             case when r.status = 'reinstated' then 'reinstated.' else 'decision kept.' end),
      format('certification_platform_review:%s:decided', r.id), 'certification', r.certification_id);
    perform public.enqueue_notification_safely(current_owner, 'certification_platform_review.decided', 'WashLink review decided',
      format('WashLink reviewed a certification decision for %s.', program_label),
      format('certification_platform_review:%s:decided', r.id), 'certification', r.certification_id);
  end if;
  return null;
end;
$$;

create or replace function public.worker_contract_disputes_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.worker_contract_disputes := case when tg_op = 'DELETE' then old else new end;
  c public.worker_contracts;
  action text;
  shop_label text;
begin
  select * into c from public.worker_contracts x where x.id = d.contract_id;
  action := case when tg_op = 'INSERT' then 'raised' when tg_op = 'DELETE' then 'deleted'
                 when new.status is distinct from old.status then new.status
                 when new.response_statement is distinct from old.response_statement then 'responded' end;
  if action is null then
    return null;   -- first case view stamp (audited by the case read) or a party account removed (FK set null)
  end if;
  perform public.record_workforce_audit_event('worker_contract_dispute.' || action, 'worker_contract', d.contract_id,
    coalesce(c.owner_id, c.worker_id),
    jsonb_build_object('dispute_id', d.id, 'contract_id', d.contract_id, 'category', d.category, 'raised_by_role', d.raised_by_role,
      'from_status', case when tg_op <> 'INSERT' then old.status end, 'to_status', case when tg_op <> 'DELETE' then d.status end,
      'resolution_kind', d.resolution_kind,
      'changed_by', case when tg_op = 'DELETE' then 'contract_deleted' when auth.uid() is null then 'trusted_session'
                         else coalesce(public.current_user_profile_role(), 'system') end));
  if auth.uid() is null or tg_op = 'DELETE' then
    return null;
  end if;
  shop_label := public.notification_safe_label(c.shop_name_snapshot, 'The shop');
  if action = 'raised' and d.raised_by_role = 'worker' then
    perform public.enqueue_notification_safely(c.owner_id, 'worker_contract_dispute.raised', 'Contract problem reported',
      'A worker reported a problem with a contract to WashLink. You can add your side.',
      format('contract_dispute:%s:raised', d.id), 'worker_contract', d.contract_id);
  elsif action = 'raised' then
    perform public.enqueue_notification_safely(c.worker_id, 'worker_contract_dispute.raised', 'Contract problem reported',
      format('%s: a problem with your contract was reported to WashLink. You can add your side.', shop_label),
      format('contract_dispute:%s:raised', d.id), 'worker_contract', d.contract_id);
  elsif action = 'closed' then
    perform public.enqueue_notification_safely(c.worker_id, 'worker_contract_dispute.closed', 'Contract problem closed',
      'WashLink closed a reported contract problem. Open it to read the note.',
      format('contract_dispute:%s:closed', d.id), 'worker_contract', d.contract_id);
    perform public.enqueue_notification_safely(c.owner_id, 'worker_contract_dispute.closed', 'Contract problem closed',
      'WashLink closed a reported contract problem. Open it to read the note.',
      format('contract_dispute:%s:closed', d.id), 'worker_contract', d.contract_id);
  end if;
  return null;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['certification_platform_reviews', 'certification_platform_reviews_audit'],
    array['worker_contract_disputes', 'worker_contract_disputes_audit']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[2], item[1]);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.%I()',
                   item[2], item[1], item[2]);
  end loop;
end $$;

-- Mark every W11 function with a `W11` comment. A missing W11 function aborts here.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'certification_platform_reviews_guard_write()', 'certification_review_requests_platform_hold()',
    'certifications_platform_review_hold()', 'certifications_platform_review_resolve()',
    'certification_platform_review_owner_decision_days()', 'certification_platform_review_basis(uuid)',
    'certification_platform_review_current_event(uuid)', 'certification_platform_review_blocker(uuid)',
    'certifications_zz_platform_review_mask()', 'certification_status_events_zz_platform_review_mask()',
    'open_certification_platform_review(uuid, text, text)', 'withdraw_certification_platform_review(uuid)',
    'decide_certification_platform_review(uuid, integer, text, text)',
    'my_certification_platform_reviews()', 'owner_certification_platform_reviews()',
    'admin_certification_platform_review_queue(text)', 'admin_certification_platform_review_case(uuid)',
    'worker_contract_disputes_guard_write()',
    'raise_contract_dispute(uuid, text, text)', 'respond_to_contract_dispute(uuid, text)', 'withdraw_contract_dispute(uuid)',
    'close_contract_dispute(uuid, integer, text, text)',
    'my_contract_disputes()', 'admin_contract_dispute_queue(text)', 'admin_contract_dispute_case(uuid)',
    'admin_contract_dispute_version_document(uuid, uuid)',
    'my_worker_dashboard_summary()', 'owner_dashboard_summary()', 'admin_dashboard_summary()',
    'certification_platform_reviews_audit()', 'worker_contract_disputes_audit()'
  ] loop
    if to_regprocedure('public.' || sig) is null then
      raise exception 'W11i: missing W11 function %', sig;
    end if;
    execute format('comment on function public.%s is %L', sig,
                   'W11: WashLink certification reviews, reported contract problems and dashboard summaries (created by the W11 migrations).');
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a). Audit rows and notifications already
-- written stay (append-only, P11). The W11 function comments go with their functions in the w11h..w11b rollbacks.
-- -------------------------------------------------------------
-- drop trigger if exists worker_contract_disputes_audit on public.worker_contract_disputes;
-- drop trigger if exists certification_platform_reviews_audit on public.certification_platform_reviews;
-- drop function if exists public.worker_contract_disputes_audit();
-- drop function if exists public.certification_platform_reviews_audit();
