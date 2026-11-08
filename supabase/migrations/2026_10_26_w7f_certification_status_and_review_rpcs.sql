-- =============================================================
-- WashLink W7f - certification status changes and worker review requests (spec D, H; D-21;
-- W7 PLAN 3.6). Requires w4b, w7b..w7d. Idempotent. Only the certification row is locked
-- (FOR UPDATE), then the review row.
--   active (effective active)            -> suspended   current owner of the issuing shop; reason
--   active (also effective expired)       -> revoked     same; reason
--   suspended                             -> revoked     same; reason
--   suspended                             -> active      same; reason; recorded verification (reinstate)
--   active, renewal window open           -> superseded  renew_certification only (w7e)
--   revoked | suspended                   -> active      decide_certification_review(..., 'reinstate') only
-- A direct reinstate closes an open review request as reinstated (same reason); a decision on a
-- request whose certificate is no longer suspended / revoked is refused (review polish).
-- Everything else (out of revoked or superseded, same status, worker / trainer / other owner /
-- super_admin / customer actor) is refused. Suspension needs no verification (protective action).
-- Errors: 42501 `Certification not found.` (not the worker and not the current issuing owner);
-- 55000 stale; 42501 not allowed; 23514 reason / verification / review rules.
-- =============================================================

create or replace function public.certification_reason_or_fail(p_reason text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  reason text := nullif(btrim(p_reason), '');
begin
  if reason is null or char_length(reason) not between 20 and 500 then
    raise exception 'Give a reason of 20 to 500 characters.' using errcode = '23514';
  end if;
  return reason;
end;
$$;
revoke all on function public.certification_reason_or_fail(text) from public, anon, authenticated, service_role;

create or replace function public.transition_certification(
  p_certification_id uuid, p_from_status text, p_to_status text, p_reason text)
returns public.certifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.certifications;
  caller_role text := coalesce(public.current_user_profile_role(), '');
  effective text;
  clean_reason text;
  event_name text;
  open_request public.certification_review_requests;
  decider text;
begin
  select * into target from public.certifications c where c.id = p_certification_id;
  if target.id is null or auth.uid() is null
     or not ((target.worker_id = auth.uid() and caller_role = 'worker')
             or (target.owner_id = auth.uid() and public.is_current_certification_shop_owner(target.shop_id))) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  select * into target from public.certifications c where c.id = p_certification_id for update;
  if target.status is distinct from p_from_status then
    raise exception 'This certification changed. Refresh and try again.' using errcode = '55000';
  end if;
  effective := public.certification_effective_status(target.status, target.expires_at, now());
  event_name := case
    when caller_role <> 'owner' or target.owner_id is distinct from auth.uid()
         or not public.is_current_certification_shop_owner(target.shop_id) then null
    when target.status = 'active' and p_to_status = 'suspended' and effective = 'active' then 'suspended'
    when target.status in ('active', 'suspended') and p_to_status = 'revoked' then 'revoked'
    when target.status = 'suspended' and p_to_status = 'active' then 'reinstated'
  end;
  if event_name is null then
    raise exception 'This certification status change is not allowed.' using errcode = '42501';
  end if;
  clean_reason := public.certification_reason_or_fail(p_reason);
  if event_name = 'reinstated' and not public.shop_has_recorded_verification(target.shop_id) then
    raise exception 'Only a verified shop can reinstate certifications.' using errcode = '23514';
  end if;
  -- Review polish: a direct reinstate decides the open review request (status reinstated, same reason) in this
  -- transaction, so no request stays open against an active certificate. A revoke keeps it open (still decidable).
  if event_name = 'reinstated' then
    select * into open_request from public.certification_review_requests r
    where r.certification_id = target.id and r.status = 'open' for update;
  end if;
  decider := public.certification_actor_display_name(auth.uid(), 'Shop owner');
  if open_request.id is not null then
    perform set_config('washlink.certification_change_source', 'review_decision', true);
  end if;
  perform set_config('washlink.certification_write', target.id::text, true);
  update public.certifications
  set status = p_to_status, status_reason = case when p_to_status in ('suspended', 'revoked') then clean_reason end
  where id = target.id
  returning * into target;
  insert into public.certification_status_events (certification_id, event, from_status, to_status, reason, actor_display_name,
                                                   review_request_id)
  values (target.id, event_name, p_from_status, p_to_status, clean_reason, decider, open_request.id);
  if open_request.id is not null then
    perform set_config('washlink.certification_write', open_request.id::text, true);
    update public.certification_review_requests
    set status = 'reinstated', decision_reason = clean_reason, decider_display_name = decider
    where id = open_request.id;
    perform set_config('washlink.certification_change_source', '', true);
  end if;
  perform set_config('washlink.certification_write', '', true);
  return target;
end;
$$;

create or replace function public.request_certification_review(p_certification_id uuid, p_statement text)
returns public.certification_review_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.certifications;
  worker_text text := nullif(btrim(p_statement), '');
  decision_time timestamptz;
  new_id uuid := gen_random_uuid();
  created public.certification_review_requests;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'worker'
     or not exists (select 1 from public.certifications c where c.id = p_certification_id and c.worker_id = auth.uid()) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  select * into target from public.certifications c where c.id = p_certification_id for update;
  if target.status not in ('suspended', 'revoked') then
    raise exception 'Only a suspended or revoked certification can be reviewed.' using errcode = '23514';
  end if;
  select max(ev.created_at) into decision_time from public.certification_status_events ev
  where ev.certification_id = target.id and ev.event in ('suspended', 'revoked');
  if decision_time is null or now() > decision_time + interval '30 days' then
    raise exception 'The review period for this decision has ended.' using errcode = '23514';
  end if;
  if exists (select 1 from public.certification_review_requests r where r.certification_id = target.id and r.status = 'open') then
    raise exception 'A review request is already open for this certification.' using errcode = '23505';
  end if;
  if (select count(*) from public.certification_review_requests r where r.certification_id = target.id) >= 3 then
    raise exception 'A certification can be reviewed at most 3 times.' using errcode = '23514';
  end if;
  if worker_text is null or char_length(worker_text) not between 20 and 1000 then
    raise exception 'Write a statement of 20 to 1000 characters.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.certification_write', new_id::text, true);
    insert into public.certification_review_requests (id, certification_id, worker_id, worker_statement)
    values (new_id, target.id, target.worker_id, worker_text)
    returning * into created;
  exception when unique_violation then
    raise exception 'A review request is already open for this certification.' using errcode = '23505';
  end;
  perform set_config('washlink.certification_write', '', true);
  return created;
end;
$$;

create or replace function public.withdraw_certification_review(p_request_id uuid)
returns public.certification_review_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request public.certification_review_requests;
begin
  select * into request from public.certification_review_requests r where r.id = p_request_id;
  if request.id is null or auth.uid() is null or request.worker_id <> auth.uid()
     or coalesce(public.current_user_profile_role(), '') <> 'worker' then
    raise exception 'Review request not found.' using errcode = '42501';
  end if;
  perform 1 from public.certifications c where c.id = request.certification_id for update;
  select * into request from public.certification_review_requests r where r.id = p_request_id for update;
  if request.status <> 'open' then
    raise exception 'This review request is no longer open.' using errcode = '23514';
  end if;
  perform set_config('washlink.certification_write', request.id::text, true);
  update public.certification_review_requests set status = 'withdrawn' where id = request.id returning * into request;
  perform set_config('washlink.certification_write', '', true);
  return request;
end;
$$;

create or replace function public.decide_certification_review(p_request_id uuid, p_decision text, p_reason text)
returns public.certification_review_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request public.certification_review_requests := (select r from public.certification_review_requests r where r.id = p_request_id);
  target public.certifications;
  clean_reason text;
  decider text := public.certification_actor_display_name(auth.uid(), 'Shop owner');
begin
  if request.id is null then
    raise exception 'Review request not found.' using errcode = '42501';
  end if;
  target := public.lock_certification_for_owner(request.certification_id);
  select * into request from public.certification_review_requests r where r.id = p_request_id for update;
  if request.status <> 'open' then
    raise exception 'This review request is no longer open.' using errcode = '23514';
  end if;
  if p_decision is null or p_decision not in ('reinstate', 'uphold') then
    raise exception 'Choose reinstate or uphold.' using errcode = '22023';
  end if;
  clean_reason := public.certification_reason_or_fail(p_reason);
  if target.status not in ('suspended', 'revoked') then   -- never 'upheld' against an active certificate
    raise exception 'This certification is no longer suspended or revoked.' using errcode = '23514';
  end if;
  if p_decision = 'reinstate' and not public.shop_has_recorded_verification(target.shop_id) then
    raise exception 'Only a verified shop can reinstate certifications.' using errcode = '23514';
  end if;
  perform set_config('washlink.certification_change_source', 'review_decision', true);
  perform set_config('washlink.certification_write', target.id::text, true);
  if p_decision = 'reinstate' then
    update public.certifications set status = 'active', status_reason = null where id = target.id;
  end if;
  insert into public.certification_status_events (certification_id, event, from_status, to_status, reason, actor_display_name,
                                                   review_request_id)
  values (target.id, case when p_decision = 'reinstate' then 'reinstated' else 'review_upheld' end, target.status,
          case when p_decision = 'reinstate' then 'active' else target.status end, clean_reason, decider, request.id);
  perform set_config('washlink.certification_write', request.id::text, true);
  update public.certification_review_requests
  set status = case when p_decision = 'reinstate' then 'reinstated' else 'upheld' end,
      decision_reason = clean_reason, decider_display_name = decider
  where id = request.id
  returning * into request;
  perform set_config('washlink.certification_write', '', true);
  perform set_config('washlink.certification_change_source', '', true);
  return request;
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.transition_certification(uuid, text, text, text)',
    'public.request_certification_review(uuid, text)',
    'public.withdraw_certification_review(uuid)',
    'public.decide_certification_review(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W7 rollbacks in reverse order h..a)
-- -------------------------------------------------------------
-- drop function if exists public.decide_certification_review(uuid, text, text);
-- drop function if exists public.withdraw_certification_review(uuid);
-- drop function if exists public.request_certification_review(uuid, text);
-- drop function if exists public.transition_certification(uuid, text, text, text);
-- drop function if exists public.certification_reason_or_fail(text);
