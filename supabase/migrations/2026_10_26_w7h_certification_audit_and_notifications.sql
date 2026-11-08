-- =============================================================
-- WashLink W7h - certification audit producers, notifications, the training-record-changed flag and
-- the expiry-notice function (spec I, D; W3 pattern; D-23, D-24, D-25; W7 PLAN 3.8, P36).
-- Requires w3b, w3c, w3d, w6d, w7b..w7g. Idempotent.
-- Audit payloads carry ids, status words, booleans and small counts only: never reasons, statements,
-- comments, names or ISO dates. Notification texts carry no reasons, statements, person names or
-- dates; program titles / shop names go through notification_safe_label. Keys embed the audit event
-- id (one notification per recipient per event). A notification problem never fails the action; an
-- audit problem does (W3 rule, R4). Trusted SQL (no auth.uid()) and cascades notify nobody. Status
-- history rows (certification_status_events) mirror audited certification changes and are not
-- audited a second time. D-23: shop removal is audited, the worker is not notified.
-- =============================================================

create or replace function public.certification_payload(p_cert public.certifications)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('certification_id', p_cert.id, 'enrollment_id', p_cert.enrollment_id, 'program_id', p_cert.program_id,
                            'shop_id', p_cert.shop_id);
$$;

create or replace function public.certifications_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data public.certifications := case when tg_op = 'DELETE' then old else new end;
  program_label text := public.notification_safe_label(row_data.program_title_snapshot, 'your training');
  shop_label text := public.notification_safe_label(row_data.shop_name_snapshot, 'The shop');
  source text := coalesce(current_setting('washlink.certification_change_source', true), '');
  changed_by text;
  event_id bigint;
  category text;
  body text;
begin
  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event('certification.deleted', 'certification', old.id, old.worker_id,
      public.certification_payload(old) || jsonb_build_object('from_status', old.status, 'deleted_by',
        case when not exists (select 1 from public.worker_profiles wp where wp.profile_id = old.worker_id)
             then 'worker_profile_deleted' else 'trusted_session' end));
    return null;
  end if;
  if tg_op = 'UPDATE' and old.shop_id is not null and new.shop_id is null then
    perform public.record_workforce_audit_event('certification.shop_removed', 'certification', new.id, new.worker_id,
      public.certification_payload(old) || jsonb_build_object('to_status', new.status, 'changed_by', 'shop_removed'));
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;   -- approver / owner account removed (FK set null): nothing to tell
  end if;
  changed_by := case when auth.uid() is null then 'trusted_session' when source = 'review_decision' then 'review_decision'
                     else 'owner' end;
  if tg_op = 'INSERT' then
    event_id := public.record_workforce_audit_event(
      case when new.renews_certification_id is null then 'certification.issued' else 'certification.renewed' end,
      'certification', new.id, new.worker_id,
      public.certification_payload(new) || jsonb_build_object('renews_certification_id', new.renews_certification_id,
        'to_status', new.status, 'validity_months', new.validity_months, 'attended_training_days', new.attended_training_days,
        'required_training_days', new.required_training_days, 'changed_by', changed_by));
    if changed_by = 'owner' then
      if new.renews_certification_id is null then
        perform public.enqueue_notification_safely(new.worker_id, 'certification.issued', 'Certification issued',
          format('%s issued you a shop-issued certification for %s.', shop_label, program_label),
          format('certification:%s:%s', new.id, event_id), 'certification', new.id);
      else
        perform public.enqueue_notification_safely(new.worker_id, 'certification.renewed', 'Certification renewed',
          format('%s renewed your shop-issued certification for %s.', shop_label, program_label),
          format('certification:%s:%s', new.id, event_id), 'certification', new.id);
      end if;
    end if;
    return null;
  end if;
  event_id := public.record_workforce_audit_event('certification.status_changed', 'certification', new.id, new.worker_id,
    public.certification_payload(new) || jsonb_build_object('from_status', old.status, 'to_status', new.status,
                                                             'changed_by', changed_by));
  if changed_by = 'owner' then
    category := case when new.status = 'suspended' then 'certification.suspended' when new.status = 'revoked' then 'certification.revoked'
                     when new.status = 'active' then 'certification.reinstated' end;
    body := case category
      when 'certification.suspended' then format('%s suspended your certification for %s. Open it to see the reason and ask for a review.',
                                                 shop_label, program_label)
      when 'certification.revoked' then format('%s revoked your certification for %s. Open it to see the reason and ask for a review.',
                                               shop_label, program_label)
      when 'certification.reinstated' then format('%s reinstated your certification for %s.', shop_label, program_label) end;
    if category is not null then
      perform public.enqueue_notification_safely(new.worker_id, category,
        case category when 'certification.suspended' then 'Certification suspended' when 'certification.revoked' then 'Certification revoked'
                      else 'Certification reinstated' end,
        body, format('certification:%s:%s', new.id, event_id), 'certification', new.id);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.certification_review_requests_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cert public.certifications;
  program_label text;
  shop_label text;
  event_id bigint;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status is not distinct from old.status) then
    return null;   -- removed with the certification (audited there) / decider account removed
  end if;
  select * into cert from public.certifications c where c.id = new.certification_id;
  program_label := public.notification_safe_label(cert.program_title_snapshot, 'your training');
  shop_label := public.notification_safe_label(cert.shop_name_snapshot, 'The shop');
  if tg_op = 'INSERT' then
    event_id := public.record_workforce_audit_event('certification.review_requested', 'certification', cert.id, cert.worker_id,
      public.certification_payload(cert) || jsonb_build_object('to_status', new.status));
    if auth.uid() is not null and cert.owner_id is not null
       and exists (select 1 from public.shops s where s.id = cert.shop_id and s.owner_id = cert.owner_id) then
      perform public.enqueue_notification_safely(cert.owner_id, 'certification.review_requested', 'Certification review requested',
        format('A worker asked for a review of a certification decision for %s.', program_label),
        format('certification:%s:%s', cert.id, event_id), 'certification', cert.id);
    end if;
  elsif new.status = 'withdrawn' then
    perform public.record_workforce_audit_event('certification.review_withdrawn', 'certification', cert.id, cert.worker_id,
      public.certification_payload(cert) || jsonb_build_object('from_status', old.status, 'to_status', new.status));
  else
    event_id := public.record_workforce_audit_event('certification.review_decided', 'certification', cert.id, cert.worker_id,
      public.certification_payload(cert) || jsonb_build_object('decision', new.status, 'to_status', cert.status));
    if auth.uid() is not null then
      perform public.enqueue_notification_safely(cert.worker_id, 'certification.review_decided', 'Certification review decided',
        format('%s reviewed your request for %s: %s', shop_label, program_label,
               case when new.status = 'reinstated' then 'reinstated.' else 'decision kept.' end),
        format('certification:%s:%s', cert.id, event_id), 'certification', cert.id);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.certification_reassessments_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cert public.certifications;
begin
  if tg_op <> 'INSERT' then
    return null;
  end if;
  select * into cert from public.certifications c where c.id = new.certification_id;
  perform public.record_workforce_audit_event('certification.reassessment_recorded', 'certification', cert.id, cert.worker_id,
    public.certification_payload(cert) || jsonb_build_object('result', new.result,
      'items_met_count', (select count(*) from unnest(new.items_met) item where item),
      'items_total', cardinality(new.items_met),
      'changed_by', case when auth.uid() is null then 'trusted_session' else new.assessor_role end));
  return null;
end;
$$;

create or replace function public.shop_certification_policies_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.validity_months is not distinct from old.validity_months) then
    return null;
  end if;
  perform public.record_workforce_audit_event('shop_certification_policy.updated', 'shop_certification_policy', new.shop_id,
    (select s.owner_id from public.shops s where s.id = new.shop_id),
    jsonb_build_object('shop_id', new.shop_id, 'validity_months', new.validity_months,
                       'changed_by', case when auth.uid() is null then 'trusted_session' else 'owner' end));
  return null;
end;
$$;

-- D-24: evidence recorded after issue that leaves the training NOT completed flags every live
-- certification of that enrollment and tells the issuing owner. It never changes a certificate.
create or replace function public.training_evidence_flag_certifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cert public.certifications;
  event_id bigint;
begin
  if not exists (select 1 from public.certifications c where c.enrollment_id = new.enrollment_id and c.status in ('active', 'suspended'))
     or public.training_enrollment_is_completed(new.enrollment_id) then
    return null;
  end if;
  for cert in
    select * from public.certifications c where c.enrollment_id = new.enrollment_id and c.status in ('active', 'suspended') order by c.id
  loop
    event_id := public.record_workforce_audit_event('certification.training_record_changed', 'certification', cert.id, cert.worker_id,
      public.certification_payload(cert) || jsonb_build_object('to_status', cert.status,
        'attended_training_days', public.training_enrollment_attended_days(cert.enrollment_id),
        'required_training_days', cert.required_training_days));
    if cert.owner_id is not null and exists (select 1 from public.shops s where s.id = cert.shop_id and s.owner_id = cert.owner_id) then
      perform public.enqueue_notification_safely(cert.owner_id, 'certification.training_record_changed', 'Training record changed',
        format('A training record for %s changed after a certification was issued. Review it.',
               public.notification_safe_label(cert.program_title_snapshot, 'a training program')),
        format('certification:%s:%s', cert.id, event_id), 'certification', cert.id);
    end if;
  end loop;
  return null;
end;
$$;

-- D-25: expiry notices (internal; trusted SQL or the W12 scheduler only). Returns new notices.
create or replace function public.enqueue_certification_expiry_notices(p_as_of timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cert public.certifications;
  kind text;
  notice_key text;
  created integer := 0;
begin
  if p_as_of is null or p_as_of < now() then
    raise exception 'A past time cannot be used.' using errcode = '22023';
  end if;
  for cert in
    select * from public.certifications c where c.status = 'active' and c.expires_at <= p_as_of + interval '30 days' order by c.id
  loop
    kind := case when public.certification_effective_status(cert.status, cert.expires_at, p_as_of) = 'expired' then 'expired' else 'due' end;
    notice_key := format('certification_expiry:%s:%s', cert.id, kind);
    if not exists (select 1 from public.notifications n where n.recipient_id = cert.worker_id and n.idempotency_key = notice_key)
       and public.enqueue_notification_safely(cert.worker_id, 'certification.' || case kind when 'due' then 'expiring' else 'expired' end,
             case kind when 'due' then 'Certification expires soon' else 'Certification expired' end,
             format(case kind when 'due' then 'Your certification for %s expires within 30 days.'
                              else 'Your certification for %s has expired.' end,
                    public.notification_safe_label(cert.program_title_snapshot, 'your training')),
             notice_key, 'certification', cert.id) is not null then
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;

do $$
declare
  item text[];
begin
  foreach item slice 1 in array array[
    array['certifications', 'certifications_audit'],
    array['certification_review_requests', 'certification_review_requests_audit'],
    array['certification_reassessments', 'certification_reassessments_audit'],
    array['shop_certification_policies', 'shop_certification_policies_audit']
  ] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated, service_role', item[2]);
    execute format('drop trigger if exists %I on public.%I', item[1] || '_audit', item[1]);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.%I()',
                   item[1] || '_audit', item[1], item[2]);
  end loop;
end $$;

revoke all on function public.training_evidence_flag_certifications() from public, anon, authenticated, service_role;
drop trigger if exists training_evidence_flag_certifications on public.training_attendance_records;
create trigger training_evidence_flag_certifications
  after insert on public.training_attendance_records
  for each row execute function public.training_evidence_flag_certifications();
drop trigger if exists training_evidence_flag_certifications on public.training_assessments;
create trigger training_evidence_flag_certifications
  after insert on public.training_assessments
  for each row execute function public.training_evidence_flag_certifications();

revoke all on function public.certification_payload(public.certifications) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_certification_expiry_notices(timestamptz) from public, anon, authenticated, service_role;

-- W3a pin assertion repeated (D-10 row 17).
do $$
declare
  unpinned text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into unpinned
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname in ('public', 'washlink_private')
    and not (n.nspname = 'public' and p.proname = 'handle_new_user' and p.pronargs = 0)
    and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c
                    where c like 'search_path=%'
                      and 'pg_temp' = any (string_to_array(replace(substr(c, 13), ' ', ''), ',')));
  if unpinned is not null then
    raise exception 'W7h: SECURITY DEFINER functions without pg_temp in search_path: % (pin them; D-10 row 17)', unpinned;
  end if;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a)
-- Audit rows and notifications already written stay (append-only, P11).
-- -------------------------------------------------------------
-- drop trigger if exists training_evidence_flag_certifications on public.training_assessments;
-- drop trigger if exists training_evidence_flag_certifications on public.training_attendance_records;
-- drop trigger if exists shop_certification_policies_audit on public.shop_certification_policies;
-- drop trigger if exists certification_reassessments_audit on public.certification_reassessments;
-- drop trigger if exists certification_review_requests_audit on public.certification_review_requests;
-- drop trigger if exists certifications_audit on public.certifications;
-- drop function if exists public.enqueue_certification_expiry_notices(timestamptz);
-- drop function if exists public.training_evidence_flag_certifications();
-- drop function if exists public.shop_certification_policies_audit();
-- drop function if exists public.certification_reassessments_audit();
-- drop function if exists public.certification_review_requests_audit();
-- drop function if exists public.certifications_audit();
-- drop function if exists public.certification_payload(public.certifications);
