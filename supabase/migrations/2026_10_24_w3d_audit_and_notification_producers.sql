-- =============================================================
-- WashLink W3d - audit wiring for the W2 sensitive actions, the first two notification
-- producers, and the append-only shop verification review log (R-4 part 1).
-- Requires 2026_10_24_w2a..w2f, w3b, w3c and the w3d0 preflight (D-10 row 20). Idempotent.
--
-- P14: producers are AFTER triggers on the W2 tables (not edits of the W2 RPC bodies), so one
-- place catches every path: RPC, direct owner update, FK cascade, trusted SQL. Triggers use
-- WHEN clauses on OLD/NEW instead of `UPDATE OF <column>` because BEFORE-trigger changes
-- (S6: name/address edit resets status to pending) are not in the UPDATE target list.
-- A notification problem never fails the business action (enqueue_notification_safely);
-- an audit problem does (the trail is required).
-- Each notification idempotency key embeds the audit event id: at most one notification per
-- recipient per event, and a re-fired producer cannot duplicate it.
-- =============================================================

-- -------------------------------------------------------------
-- 0) Wrapper: a data problem with one notification (23514, 23505, 23503, 23502) is WARNING-logged
--    and skipped; a null/unknown recipient already returns null in enqueue_notification. Every
--    other class (42501, 42703 drift, ...) is re-raised: a defect, not bad data.
-- -------------------------------------------------------------
create or replace function public.enqueue_notification_safely(
  p_recipient_id uuid,
  p_category text,
  p_title text,
  p_body text,
  p_idempotency_key text,
  p_subject_type text default null,
  p_subject_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.enqueue_notification(p_recipient_id, p_category, p_title, p_body,
                                     p_idempotency_key, p_subject_type, p_subject_id);
exception
  when check_violation or unique_violation or foreign_key_violation or not_null_violation then
    raise warning 'W3d: notification % skipped (SQLSTATE %)', p_category, sqlstate;
    return null;
end;
$$;

-- -------------------------------------------------------------
-- 1) Shops: submission, decision (notifies the owner), identity reset (S6).
-- -------------------------------------------------------------
create or replace function public.audit_shop_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id bigint;
  status_label text;
begin
  if coalesce(current_setting('washlink.submit_shop', true), '') = new.id::text then
    perform public.record_workforce_audit_event(
      'shop.verification_submitted', 'shop', new.id, new.owner_id,
      jsonb_build_object('from_status', old.verification_status, 'to_status', new.verification_status));
    return null;
  end if;
  if old.verification_status is not distinct from new.verification_status then
    return null;
  end if;
  if public.is_super_admin() or public.is_trusted_db_session() then
    event_id := public.record_workforce_audit_event(
      'shop.verification_decided', 'shop', new.id, new.owner_id,
      jsonb_build_object(
        'from_status', old.verification_status,
        'to_status', new.verification_status,
        'reviewed_by', new.verification_reviewed_by,
        'reviewed_at', new.verification_reviewed_at));
    status_label := case new.verification_status
      when 'approved' then 'Approved'
      when 'rejected' then 'Rejected'
      when 'changes_requested' then 'Changes requested'
      else 'Pending review'
    end;
    perform public.enqueue_notification_safely(
      new.owner_id,
      'shop_verification.status_changed',
      'Shop verification updated',
      format('%s is now %s.', public.notification_safe_label(new.name, 'Your shop'), status_label),
      format('shop_verification:%s:%s', new.id, event_id),
      'shop',
      new.id);
    return null;
  end if;
  if old.verification_status = 'approved' and new.verification_status = 'pending' then
    perform public.record_workforce_audit_event(
      'shop.verification_reset_by_identity_change', 'shop', new.id, new.owner_id,
      jsonb_build_object(
        'from_status', old.verification_status,
        'to_status', new.verification_status,
        'changed_fields', to_jsonb(array_remove(array[
          case when new.name is distinct from old.name then 'name' end,
          case when new.address is distinct from old.address then 'address' end
        ], null))));
  end if;
  return null;
end;
$$;

drop trigger if exists shops_audit_verification on public.shops;
create trigger shops_audit_verification
  after update on public.shops
  for each row
  when (old.verification_status is distinct from new.verification_status
        or old.verification_submitted_at is distinct from new.verification_submitted_at
        or coalesce(current_setting('washlink.submit_shop', true), '') = new.id::text)
  execute function public.audit_shop_verification_change();

-- -------------------------------------------------------------
-- 2) Link code issued (never the code or its hash).
-- -------------------------------------------------------------
create or replace function public.audit_roster_link_code_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_workforce_audit_event(
    'roster.link_code_issued', 'roster_entry', new.worker_row_id, null,
    jsonb_build_object('expires_at', new.expires_at));
  return null;
end;
$$;

drop trigger if exists worker_roster_link_codes_audit_issue on public.worker_roster_link_codes;
create trigger worker_roster_link_codes_audit_issue
  after insert on public.worker_roster_link_codes
  for each row
  execute function public.audit_roster_link_code_issue();

-- -------------------------------------------------------------
-- 3) Roster link / unlink (notifies the counterparty) and linked roster row deletion.
-- -------------------------------------------------------------
create or replace function public.audit_roster_link_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id bigint;
  unlinked_by text;
  roster_label text := public.notification_safe_label(new.name, 'A roster entry');
begin
  if old.user_id is null and new.user_id is not null then
    event_id := public.record_workforce_audit_event(
      'roster.linked', 'roster_entry', new.id, new.user_id,
      jsonb_build_object('owner_id', new.owner_id));
    perform public.enqueue_notification_safely(
      new.owner_id, 'roster.linked', 'Roster worker linked',
      format('%s is now linked to a worker account.', roster_label),
      format('roster_link:%s:%s', new.id, event_id), 'roster_entry', new.id);
    return null;
  end if;
  if old.user_id is null or new.user_id is not null then
    return null;   -- account to account is impossible (W2d guard)
  end if;
  -- The deleted-account check comes first: a cascade from any session is account_deleted.
  unlinked_by := case
    when not exists (select 1 from public.profiles p where p.id = old.user_id) then 'account_deleted'
    when auth.uid() = old.user_id then 'worker'
    when auth.uid() = old.owner_id then 'owner'
    else 'trusted_session'
  end;
  event_id := public.record_workforce_audit_event(
    'roster.unlinked', 'roster_entry', new.id, old.user_id,
    jsonb_build_object('owner_id', new.owner_id, 'unlinked_by', unlinked_by));
  if unlinked_by = 'worker' then
    perform public.enqueue_notification_safely(
      new.owner_id, 'roster.unlinked', 'Roster link removed',
      format('%s is no longer linked to a worker account.', roster_label),
      format('roster_link:%s:%s', new.id, event_id), 'roster_entry', new.id);
  elsif unlinked_by = 'owner' then
    perform public.enqueue_notification_safely(
      old.user_id, 'roster.unlinked', 'Roster link removed',
      'A shop removed the link between your account and its roster.',
      format('roster_link:%s:%s', new.id, event_id), 'roster_entry', new.id);
  end if;
  return null;
end;
$$;

create or replace function public.audit_roster_linked_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id bigint;
  -- workers.owner_id cascades from profiles: no owner profile = the owner's account was closed,
  -- the shop did not act (W3-L2), so the worker gets neutral text.
  owner_account_closed boolean :=
    not exists (select 1 from public.profiles p where p.id = old.owner_id);
begin
  event_id := public.record_workforce_audit_event(
    'roster.unlinked', 'roster_entry', old.id, old.user_id,
    jsonb_build_object('owner_id', old.owner_id,
                       'unlinked_by', case when owner_account_closed then 'owner_account_deleted'
                                           else 'roster_entry_deleted' end));
  perform public.enqueue_notification_safely(
    old.user_id, 'roster.unlinked', 'Roster link removed',
    case when owner_account_closed
      then 'A roster link ended because the shop''s account was closed.'
      else 'A shop removed the link between your account and its roster.'
    end,
    format('roster_link:%s:%s', old.id, event_id), 'roster_entry', old.id);
  return null;
end;
$$;

drop trigger if exists workers_audit_link on public.workers;
create trigger workers_audit_link
  after update on public.workers
  for each row
  when (old.user_id is distinct from new.user_id)
  execute function public.audit_roster_link_change();

drop trigger if exists workers_audit_linked_delete on public.workers;
create trigger workers_audit_linked_delete
  after delete on public.workers
  for each row
  when (old.user_id is not null)
  execute function public.audit_roster_linked_delete();

-- -------------------------------------------------------------
-- 4) Worker profile deleted (self, account deletion, trusted SQL).
-- -------------------------------------------------------------
create or replace function public.audit_worker_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_workforce_audit_event(
    'worker_profile.deleted', 'worker_profile', old.profile_id, old.profile_id,
    jsonb_build_object('deleted_by', case
      when not exists (select 1 from public.profiles p where p.id = old.profile_id) then 'account_deleted'
      when auth.uid() = old.profile_id then 'self'
      when public.is_trusted_db_session() then 'trusted_session'
      else 'other'
    end));
  return null;
end;
$$;

drop trigger if exists worker_profiles_audit_delete on public.worker_profiles;
create trigger worker_profiles_audit_delete
  after delete on public.worker_profiles
  for each row
  execute function public.audit_worker_profile_delete();

-- -------------------------------------------------------------
-- 5) Trusted role change (only trusted sessions can change role, W2a guard).
-- -------------------------------------------------------------
create or replace function public.audit_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.record_workforce_audit_event(
    'profile.role_changed', 'profile', new.id, new.id,
    jsonb_build_object('from_role', old.role::text, 'to_role', new.role::text));
  return null;
end;
$$;

drop trigger if exists profiles_audit_role_change on public.profiles;
create trigger profiles_audit_role_change
  after update on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.audit_profile_role_change();

revoke all on function public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.audit_shop_verification_change() from public, anon, authenticated, service_role;
revoke all on function public.audit_roster_link_code_issue() from public, anon, authenticated, service_role;
revoke all on function public.audit_roster_link_change() from public, anon, authenticated, service_role;
revoke all on function public.audit_roster_linked_delete() from public, anon, authenticated, service_role;
revoke all on function public.audit_worker_profile_delete() from public, anon, authenticated, service_role;
revoke all on function public.audit_profile_role_change() from public, anon, authenticated, service_role;

-- -------------------------------------------------------------
-- 6) R-4: append-only shop verification review log. security_invoker, so the base-table
--    RLS applies: super_admin only. Survives deletion of the reviewing admin (P11).
-- -------------------------------------------------------------
create or replace view public.shop_verification_review_log
with (security_invoker = true)
as
select e.id as event_id,
       e.subject_id as shop_id,
       e.action,
       e.payload ->> 'from_status' as from_status,
       e.payload ->> 'to_status' as to_status,
       e.actor_id as reviewed_by,
       e.actor_role,
       e.created_at
from public.workforce_audit_events e
where e.subject_type = 'shop'
  and e.action like 'shop.verification\_%';

revoke all on table public.shop_verification_review_log from public, anon, authenticated, service_role;
grant select on table public.shop_verification_review_log to authenticated;

comment on view public.shop_verification_review_log is
  'Append-only shop verification history (R-4), super_admin only via workforce_audit_events RLS. W7/W10 still snapshot verification at issue time.';

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W3 rollbacks in reverse order d..a)
-- Audit rows and notifications already written stay.
-- -------------------------------------------------------------
-- drop view if exists public.shop_verification_review_log;
-- drop trigger if exists profiles_audit_role_change on public.profiles;
-- drop trigger if exists worker_profiles_audit_delete on public.worker_profiles;
-- drop trigger if exists workers_audit_linked_delete on public.workers;
-- drop trigger if exists workers_audit_link on public.workers;
-- drop trigger if exists worker_roster_link_codes_audit_issue on public.worker_roster_link_codes;
-- drop trigger if exists shops_audit_verification on public.shops;
-- drop function if exists public.audit_profile_role_change();
-- drop function if exists public.audit_worker_profile_delete();
-- drop function if exists public.audit_roster_linked_delete();
-- drop function if exists public.audit_roster_link_change();
-- drop function if exists public.audit_roster_link_code_issue();
-- drop function if exists public.audit_shop_verification_change();
-- drop function if exists public.enqueue_notification_safely(uuid, text, text, text, text, text, uuid);
