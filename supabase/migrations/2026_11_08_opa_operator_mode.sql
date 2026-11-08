-- =============================================================
-- WashLink operator mode (OP-1): WashLink runs the washes itself first.
-- 1) Washer sign-up closes. A sign-up that asks for the worker role becomes a customer, unless
--    platform_settings.washer_signup_open is turned on. Trusted sessions (SQL editor, migrations, tests) are not affected.
-- 2) A platform operator washer: one or more washer accounts WashLink runs itself. An operator counts as verified without
--    verification documents. Only a trusted session can make or remove one (make_platform_operator / remove_platform_operator),
--    every change is audited, and the admin panel lists them (admin_platform_operator_ids).
-- 3) An operator can cancel a booking assigned to them, with a reason. Other washers still can only hand a job back.
-- Existing washers are left as they are. Additive: no committed migration changes. Local proof only (D-10, D-11).
-- =============================================================

alter table public.platform_settings add column if not exists washer_signup_open boolean not null default false;
alter table public.independent_workers add column if not exists is_platform_operator boolean not null default false;

-- 1) Sign-up role whitelist, now with the washer sign-up switch. Same trigger as w2a, replaced in place.
create or replace function public.sanitize_profile_role_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- super_admin is granted only by a trusted UPDATE, never at insert.
  if new.role is null or new.role::text not in ('customer', 'owner', 'worker') then
    new.role := 'customer';
  end if;
  -- Washer sign-up is closed while WashLink operates the washes itself. Hiding the option in the apps is not enough.
  if new.role::text = 'worker' and not public.is_trusted_db_session()
     and not coalesce((select s.washer_signup_open from public.platform_settings s where s.id), false) then
    new.role := 'customer';
  end if;
  return new;
end;
$$;
revoke all on function public.sanitize_profile_role_on_insert() from public, anon, authenticated;

-- 2) Verifying needs documents, except for a platform operator. Otherwise unchanged from b2cn.
create or replace function public.admin_review_independent_worker(p_worker uuid, p_status text, p_note text default null)
returns public.independent_workers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.independent_workers;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  previous_status text;
  is_operator boolean;
begin
  perform public.b2c_require_super_admin();
  if p_status is null or p_status not in ('verified', 'rejected', 'suspended', 'pending') then
    raise exception 'Choose a verification status.' using errcode = '22023';
  end if;
  -- Waits for a document review in progress, so the check below reads the result. Always worker then document.
  select w.verification_status, w.is_platform_operator into previous_status, is_operator
    from public.independent_workers w where w.profile_id = p_worker for update;
  if previous_status is null then
    raise exception 'Worker not found.' using errcode = '42501';
  end if;
  if p_worker = auth.uid() then
    raise exception 'You can''t review your own washer account.' using errcode = '23514';
  end if;
  if p_status = 'verified' and not is_operator and not public.independent_worker_has_required_documents(p_worker) then
    raise exception 'Approve every required document before verifying this washer.' using errcode = '23514';
  end if;
  if p_status = 'verified' and not is_operator and not public.independent_worker_document_versions_match(p_worker) then
    raise exception 'A document file changed after it was approved. Revoke it and ask for a new one before verifying this washer.' using errcode = '23514';
  end if;
  if p_status in ('rejected', 'suspended') and char_length(coalesce(clean_note, '')) not between 10 and 500 then
    raise exception 'Give a reason of 10 to 500 characters.' using errcode = '23514';
  end if;
  result := public.independent_worker_apply_status(p_worker, p_status, clean_note);
  -- Fixed text, never the note. The washer reads the note in their setup screen.
  if p_status <> 'verified' and p_status is distinct from previous_status then
    perform public.enqueue_notification_safely(p_worker, 'independent_worker.documents', 'Your washer account',
      case p_status when 'suspended' then 'WashLink has suspended your washer account. Open your washer setup to see why.'
        when 'rejected' then 'WashLink has not approved your washer account. Open your washer setup to see why.'
        else 'Your washer account is back under review, and you won''t get new requests for now. Open your washer setup for details.' end,
      'worker_documents:' || p_worker || ':status:' || p_status || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint, 'independent_worker', p_worker);
  end if;
  return result;
end;
$$;

-- The one-off reset from b2cn never moves an operator back to pending if it is run again.
create or replace function public.independent_workers_reset_unevidenced()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
  reset_count integer := 0;
begin
  for target in
    select w.profile_id from public.independent_workers w
    where w.verification_status = 'verified' and not w.is_platform_operator
      and not public.independent_worker_has_required_documents(w.profile_id)
    order by w.profile_id for update
  loop
    update public.independent_workers
      set verification_status = 'pending', verified_at = null, verified_by = null, is_online = false, updated_at = now(),
          verification_note = 'WashLink now needs verification documents from every washer. Upload yours in your washer setup.'
      where profile_id = target;
    perform public.record_workforce_audit_event('independent_worker.verification_reset', 'independent_worker', target, target,
      jsonb_build_object('verification_status', 'pending') || public.independent_worker_withdraw_from_work(target, 'system'));
    perform public.enqueue_notification_safely(target, 'independent_worker.documents', 'Your washer account',
      'WashLink now needs verification documents from you, and you won''t get new requests until they are approved. Open your washer setup for details.',
      'worker_documents:' || target || ':reset', 'independent_worker', target);
    reset_count := reset_count + 1;
  end loop;
  return reset_count;
end;
$$;
revoke all on function public.independent_workers_reset_unevidenced() from public, anon, authenticated, service_role;

-- Run from the Supabase SQL editor: select public.make_platform_operator('you@example.com');
-- Turns a customer or washer account into a verified operator washer. Never callable from the apps.
create or replace function public.make_platform_operator(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
  target_role text;
begin
  if not public.is_trusted_db_session() then
    raise exception 'Only a trusted database session can make an operator account.' using errcode = '42501';
  end if;
  select u.id into target from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if target is null then
    raise exception 'No account uses that email.' using errcode = '22023';
  end if;
  select p.role::text into target_role from public.profiles p where p.id = target for update;
  if target_role is null or target_role not in ('customer', 'worker') then
    raise exception 'Only a customer or washer account can become an operator account.' using errcode = '23514';
  end if;
  if target_role = 'customer' and exists (select 1 from public.service_bookings b
      where b.customer_id = target and b.status not in ('completed', 'cancelled', 'expired')) then
    raise exception 'This account has open bookings as a customer. Finish or cancel them first.' using errcode = '23514';
  end if;
  if target_role <> 'worker' then
    update public.profiles set role = 'worker' where id = target;
  end if;
  insert into public.independent_workers as w (profile_id, verification_status, verified_at, is_platform_operator)
    values (target, 'verified', now(), true)
    on conflict (profile_id) do update set verification_status = 'verified', verification_note = null, verified_at = now(),
      verified_by = null, is_platform_operator = true, updated_at = now(), revision = w.revision + 1;
  perform public.record_workforce_audit_event('independent_worker.operator_granted', 'independent_worker', target, target,
    jsonb_build_object('verification_status', 'verified', 'is_platform_operator', true, 'previous_role', target_role));
  return target;
end;
$$;
revoke all on function public.make_platform_operator(text) from public, anon, authenticated, service_role;

-- Ends operator status. The account becomes an ordinary washer under review, and its unstarted jobs return to search.
create or replace function public.remove_platform_operator(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  if not public.is_trusted_db_session() then
    raise exception 'Only a trusted database session can remove an operator account.' using errcode = '42501';
  end if;
  select w.profile_id into target from public.independent_workers w join auth.users u on u.id = w.profile_id
    where lower(u.email) = lower(btrim(coalesce(p_email, ''))) and w.is_platform_operator for update of w;
  if target is null then
    raise exception 'No operator account uses that email.' using errcode = '22023';
  end if;
  update public.independent_workers set is_platform_operator = false where profile_id = target;
  perform public.record_workforce_audit_event('independent_worker.operator_removed', 'independent_worker', target, target,
    jsonb_build_object('is_platform_operator', false));
  perform public.independent_worker_apply_status(target, 'pending',
    'This account is no longer a WashLink operator account. Upload verification documents to keep working.');
  return target;
end;
$$;
revoke all on function public.remove_platform_operator(text) from public, anon, authenticated, service_role;

-- The admin panel marks operator accounts, so an account exempt from documents is never hidden.
create or replace function public.admin_platform_operator_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.b2c_require_super_admin();
  return query select w.profile_id from public.independent_workers w where w.is_platform_operator order by w.profile_id;
end;
$$;
revoke all on function public.admin_platform_operator_ids() from public, anon, service_role;
grant execute on function public.admin_platform_operator_ids() to authenticated;

-- 3) The operator cancels a booking assigned to them. The customer is told by the usual status notification.
create or replace function public.operator_cancel_service_booking(p_booking uuid, p_reason text)
returns public.service_booking_status_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.service_bookings;
  result public.service_booking_status_events;
begin
  select * into b from public.service_bookings x where x.id = p_booking and x.worker_id = auth.uid() for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.independent_workers w
      where w.profile_id = auth.uid() and w.is_platform_operator and w.verification_status = 'verified') then
    raise exception 'Only a WashLink operator account can cancel a booking. Hand it back instead.' using errcode = '42501';
  end if;
  if b.status not in ('accepted', 'worker_on_the_way', 'arrived', 'in_progress') then
    raise exception 'This booking can no longer be cancelled.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Give a reason of 10 to 500 characters.' using errcode = '23514';
  end if;
  perform public.service_booking_record_transition(p_booking, 'cancelled', 'worker', btrim(p_reason));
  perform public.service_dispatch_close_offers(p_booking, 'superseded');
  select * into result from public.service_booking_status_events e where e.booking_id = p_booking order by e.id desc limit 1;
  return result;
end;
$$;
revoke all on function public.operator_cancel_service_booking(uuid, text) from public, anon, service_role;
grant execute on function public.operator_cancel_service_booking(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK:
-- Re-run sanitize_profile_role_on_insert from 2026_10_24_w2a_session_helpers_and_profile_role_guard.sql, and
-- admin_review_independent_worker and independent_workers_reset_unevidenced from 2026_11_06_b2cn_worker_verification_gate.sql.
-- Operators without approved documents then stay verified until an admin reviews them. Then:
-- begin;
-- drop function if exists public.operator_cancel_service_booking(uuid, text), public.admin_platform_operator_ids(),
--   public.remove_platform_operator(text), public.make_platform_operator(text);
-- alter table public.independent_workers drop column if exists is_platform_operator;
-- alter table public.platform_settings drop column if exists washer_signup_open;
-- commit;
