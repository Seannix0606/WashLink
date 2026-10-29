-- =============================================================
-- WashLink W11c - WashLink certification review RPCs (spec D, A; D-44, D-45, D-46; W11 PLAN 3.3, P66, P67, P71).
-- Requires w7b..w7f, w11b. Idempotent. Lock order: certifications row -> certification_review_requests row -> review row.
--   open      certificate worker (role worker, own certificate); suspended / revoked; a basis (D-44); escalating
--             withdraws the open shop request (W7 flag, linked by escalated_from_request_id).
--   withdraw  the certificate worker; open -> withdrawn.
--   decide    super_admin only (auth.uid() + is_super_admin() + role super_admin): reinstate (certificate -> active, reason
--             null, expiry / evidence / snapshots unchanged, no issuer verification needed, D-45) or uphold (unchanged).
--             One decision per suspension / revocation event: a WashLink status event (platform_review_id set) after
--             the latest suspended / revoked event blocks a new review of that event.
--   cap       at most 3 WashLink reviews per suspension / revocation event, withdrawn and resolved ones counting (N5).
--   blocker   certification_platform_review_blocker(): the ONE rule shared by open, can_open (w11d) and the admin
--             stranded count (w11h): 'open' (a review is open), 'decided' (WashLink decided the current event),
--             'limit' (3 reviews of the current event), else null.
--   N2        resuspended_after_shop_resolution: the issuing owner suspended / revoked again within 30 days after a
--             WashLink review closed as resolved_by_shop (owner reinstated): eligible at once, no shop request needed.
-- "After the latest event" compares certification_status_events ids (identity, strictly increasing), not times.
-- No function here issues, suspends, revokes or renews a certificate.
-- =============================================================

create or replace function public.certification_platform_review_owner_decision_days()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select 14 $$;

-- Internal: the basis a worker may use now, or null (not eligible). Precedence issuer_unavailable >
-- shop_decision_overdue > resuspended_after_shop_resolution > upheld_by_shop. Never reads statements or reasons.
create or replace function public.certification_platform_review_basis(p_cert uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  cert public.certifications;
  latest_event public.certification_status_events;
  open_request public.certification_review_requests;
  issuer_ok boolean;
begin
  select * into cert from public.certifications c where c.id = p_cert;
  if cert.id is null or cert.status not in ('suspended', 'revoked') then
    return null;
  end if;
  select * into latest_event from public.certification_status_events ev
  where ev.certification_id = cert.id and ev.event in ('suspended', 'revoked') order by ev.id desc limit 1;
  select * into open_request from public.certification_review_requests r where r.certification_id = cert.id and r.status = 'open';
  issuer_ok := cert.shop_id is not null and cert.owner_id is not null
    and exists (select 1 from public.shops s where s.id = cert.shop_id and s.owner_id = cert.owner_id)
    and exists (select 1 from public.profiles p where p.id = cert.owner_id and p.role::text = 'owner')
    and public.shop_has_recorded_verification(cert.shop_id);
  if not issuer_ok and (cert.status = 'suspended' or open_request.id is not null
                        or latest_event.created_at >= now() - interval '30 days') then
    return 'issuer_unavailable';
  end if;
  if open_request.id is not null
     and open_request.requested_at <= now() - make_interval(days => public.certification_platform_review_owner_decision_days()) then
    return 'shop_decision_overdue';
  end if;
  -- N2: the issuing owner re-suspended / revoked within 30 days after reinstating during a WashLink review.
  if latest_event.id is not null and latest_event.actor_role = 'owner' and latest_event.actor_id is not distinct from cert.owner_id
     and exists (select 1 from public.certification_platform_reviews p
                 where p.certification_id = cert.id and p.status = 'resolved_by_shop'
                   and p.closed_at <= latest_event.created_at and p.closed_at >= latest_event.created_at - interval '30 days') then
    return 'resuspended_after_shop_resolution';
  end if;
  if latest_event.id is not null and exists (
    select 1 from public.certification_status_events ev
    join public.certification_review_requests r on r.id = ev.review_request_id
    where ev.certification_id = cert.id and ev.event = 'review_upheld' and ev.id > latest_event.id
      and ev.platform_review_id is null and r.status = 'upheld' and r.decided_at >= now() - interval '30 days') then
    return 'upheld_by_shop';
  end if;
  return null;
end;
$$;

-- Internal: why no new WashLink review of the current event may open ('open' | 'decided' | 'limit'), or null.
create or replace function public.certification_platform_review_blocker(p_cert uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_event bigint := public.certification_platform_review_current_event(p_cert);
begin
  if exists (select 1 from public.certification_platform_reviews p where p.certification_id = p_cert and p.status = 'open') then
    return 'open';
  end if;
  if exists (select 1 from public.certification_status_events ev
             where ev.certification_id = p_cert and ev.platform_review_id is not null and ev.id > current_event) then
    return 'decided';
  end if;
  if (select count(*) from public.certification_platform_reviews p
      where p.certification_id = p_cert and p.status_event_id is not distinct from current_event) >= 3 then
    return 'limit';
  end if;
  return null;
end;
$$;

create or replace function public.open_certification_platform_review(p_certification_id uuid, p_expected_status text, p_statement text)
returns public.certification_platform_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.certifications;
  worker_text text := nullif(btrim(p_statement), '');
  chosen_basis text;
  open_request public.certification_review_requests;
  new_id uuid := gen_random_uuid();
  created public.certification_platform_reviews;
  blocker text;
begin
  if auth.uid() is null or coalesce(public.current_user_profile_role(), '') <> 'worker'
     or not exists (select 1 from public.certifications c where c.id = p_certification_id and c.worker_id = auth.uid()) then
    raise exception 'Certification not found.' using errcode = '42501';
  end if;
  select * into target from public.certifications c where c.id = p_certification_id for update;
  if target.status is distinct from p_expected_status then
    raise exception 'This certification changed. Refresh and try again.' using errcode = '55000';
  end if;
  if target.status not in ('suspended', 'revoked') then
    raise exception 'Only a suspended or revoked certification can be reviewed.' using errcode = '23514';
  end if;
  blocker := public.certification_platform_review_blocker(target.id);
  if blocker = 'open' then
    raise exception 'WashLink is already reviewing this certification.' using errcode = '23505';
  elsif blocker = 'decided' then
    raise exception 'WashLink already reviewed this decision.' using errcode = '23514';
  elsif blocker = 'limit' then
    raise exception 'You can ask WashLink to review this decision at most 3 times.' using errcode = '23514';
  end if;
  chosen_basis := public.certification_platform_review_basis(target.id);
  if chosen_basis is null then
    raise exception 'Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided within 14 days, or can no longer decide.'
      using errcode = '23514';
  end if;
  if worker_text is null or char_length(worker_text) not between 20 and 1000 then
    raise exception 'Write a statement of 20 to 1000 characters.' using errcode = '23514';
  end if;
  select * into open_request from public.certification_review_requests r
  where r.certification_id = target.id and r.status = 'open' for update;
  if open_request.id is not null then
    perform set_config('washlink.certification_write', open_request.id::text, true);
    update public.certification_review_requests set status = 'withdrawn' where id = open_request.id;
    perform set_config('washlink.certification_write', '', true);
  end if;
  begin
    perform set_config('washlink.certification_platform_review_write', new_id::text, true);
    insert into public.certification_platform_reviews (id, certification_id, worker_id, basis, escalated_from_request_id,
                                                       certification_status_at_open, worker_statement)
    values (new_id, target.id, target.worker_id, chosen_basis, open_request.id, target.status, worker_text)
    returning * into created;
  exception when unique_violation then
    raise exception 'WashLink is already reviewing this certification.' using errcode = '23505';
  end;
  perform set_config('washlink.certification_platform_review_write', '', true);
  return created;
end;
$$;

create or replace function public.withdraw_certification_platform_review(p_review_id uuid)
returns public.certification_platform_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  review public.certification_platform_reviews;
begin
  select * into review from public.certification_platform_reviews p where p.id = p_review_id;
  if review.id is null or auth.uid() is null or review.worker_id <> auth.uid()
     or coalesce(public.current_user_profile_role(), '') <> 'worker' then
    raise exception 'WashLink review not found.' using errcode = '42501';
  end if;
  perform 1 from public.certifications c where c.id = review.certification_id for update;
  select * into review from public.certification_platform_reviews p where p.id = p_review_id for update;
  if review.status <> 'open' then
    raise exception 'This review is no longer open.' using errcode = '23514';
  end if;
  perform set_config('washlink.certification_platform_review_write', review.id::text, true);
  update public.certification_platform_reviews set status = 'withdrawn' where id = review.id returning * into review;
  perform set_config('washlink.certification_platform_review_write', '', true);
  return review;
end;
$$;

create or replace function public.decide_certification_platform_review(p_review_id uuid, p_expected_revision integer, p_decision text,
                                                                       p_reason text)
returns public.certification_platform_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  review public.certification_platform_reviews;
  target public.certifications;
  clean_reason text;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can decide WashLink reviews.' using errcode = '42501';
  end if;
  select * into review from public.certification_platform_reviews p where p.id = p_review_id;
  if review.id is null then
    raise exception 'WashLink review not found.' using errcode = '42501';
  end if;
  select * into target from public.certifications c where c.id = review.certification_id for update;
  select * into review from public.certification_platform_reviews p where p.id = p_review_id for update;
  if review.status <> 'open' then
    raise exception 'This review is no longer open.' using errcode = '23514';
  end if;
  if p_expected_revision is distinct from review.revision then
    raise exception 'This review changed. Refresh and try again.' using errcode = '55000';
  end if;
  if p_decision is null or p_decision not in ('reinstate', 'uphold') then
    raise exception 'Choose reinstate or uphold.' using errcode = '22023';
  end if;
  clean_reason := public.certification_reason_or_fail(p_reason);
  if target.status not in ('suspended', 'revoked') then
    raise exception 'This certification is no longer suspended or revoked.' using errcode = '23514';
  end if;
  perform set_config('washlink.certification_change_source', 'review_decision', true);
  perform set_config('washlink.certification_platform_review_decision', review.id::text, true);
  perform set_config('washlink.certification_write', target.id::text, true);
  if p_decision = 'reinstate' then
    update public.certifications set status = 'active', status_reason = null where id = target.id;
  end if;
  insert into public.certification_status_events (certification_id, event, from_status, to_status, reason, actor_display_name,
                                                   platform_review_id)
  values (target.id, case when p_decision = 'reinstate' then 'reinstated' else 'review_upheld' end, target.status,
          case when p_decision = 'reinstate' then 'active' else target.status end, clean_reason, 'WashLink review', review.id);
  perform set_config('washlink.certification_write', '', true);
  perform set_config('washlink.certification_platform_review_write', review.id::text, true);
  update public.certification_platform_reviews
  set status = case when p_decision = 'reinstate' then 'reinstated' else 'upheld' end, decision_reason = clean_reason
  where id = review.id
  returning * into review;
  perform set_config('washlink.certification_platform_review_write', '', true);
  perform set_config('washlink.certification_platform_review_decision', '', true);
  perform set_config('washlink.certification_change_source', '', true);
  return review;
end;
$$;

revoke all on function public.certification_platform_review_basis(uuid) from public, anon, authenticated, service_role;
revoke all on function public.certification_platform_review_blocker(uuid) from public, anon, authenticated, service_role;
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.certification_platform_review_owner_decision_days()',
    'public.open_certification_platform_review(uuid, text, text)',
    'public.withdraw_certification_platform_review(uuid)',
    'public.decide_certification_platform_review(uuid, integer, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a; roll back w11d first)
-- -------------------------------------------------------------
-- drop function if exists public.decide_certification_platform_review(uuid, integer, text, text);
-- drop function if exists public.withdraw_certification_platform_review(uuid);
-- drop function if exists public.open_certification_platform_review(uuid, text, text);
-- drop function if exists public.certification_platform_review_blocker(uuid);
-- drop function if exists public.certification_platform_review_basis(uuid);
-- drop function if exists public.certification_platform_review_owner_decision_days();
