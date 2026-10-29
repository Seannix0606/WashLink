-- =============================================================
-- WashLink W11d - WashLink certification review reads (spec D, A, E, H; W11 PLAN 3.4, P65, P66). Requires w7b..w7g,
-- w11b, w11c. Idempotent. Definer, scoped to auth.uid() and the profile role; a wrong role or no JWT returns 0 rows.
-- Workers and owners never see an administrator id or name (the decider is "WashLink review"). No contacts, no
-- attendance record ids. The two admin case / queue reads are super_admin only; the case read is VOLATILE because
-- every call writes certification_platform_review.case_viewed (an audit failure aborts the read).
-- =============================================================

-- Worker: own suspended / revoked certificates and any certificate with a WashLink review. can_open uses the same rule
-- as open_certification_platform_review: suspended / revoked, certification_platform_review_blocker() null (no open
-- review, not yet decided for this event, fewer than 3 reviews of this event) and a basis.
create or replace function public.my_certification_platform_reviews()
returns table (certification_id uuid, can_open boolean, basis text, open_review_id uuid, latest_status text, latest_decision_reason text,
               latest_decided_at timestamptz, opened_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         c.status in ('suspended', 'revoked') and k.blocker is null and b.basis is not null,
         b.basis, o.id, l.status, l.decision_reason, l.decided_at, l.opened_at
  from public.certifications c
  cross join lateral (select public.certification_platform_review_basis(c.id) as basis) b
  cross join lateral (select public.certification_platform_review_blocker(c.id) as blocker) k
  left join lateral (select p.id from public.certification_platform_reviews p where p.certification_id = c.id and p.status = 'open') o on true
  left join lateral (select p.status, p.decision_reason, p.decided_at, p.opened_at from public.certification_platform_reviews p
                     where p.certification_id = c.id order by p.opened_at desc, p.created_at desc, p.id limit 1) l on true
  where auth.uid() is not null and c.worker_id = auth.uid() and coalesce(public.current_user_profile_role() = 'worker', false)
    and (c.status in ('suspended', 'revoked') or l.status is not null)
  order by (o.id is null), c.status_changed_at desc nulls last, c.id;
$$;

-- Owner: WashLink reviews of certificates of the CURRENT issuing owner (same rule as owner_certifications).
create or replace function public.owner_certification_platform_reviews()
returns table (certification_id uuid, review_id uuid, status text, basis text, worker_statement text, decision_reason text,
               opened_at timestamptz, decided_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, p.id, p.status, p.basis, p.worker_statement, p.decision_reason, p.opened_at, p.decided_at
  from public.certification_platform_reviews p
  join public.certifications c on c.id = p.certification_id
  where auth.uid() is not null and c.owner_id = auth.uid() and public.is_current_certification_shop_owner(c.shop_id)
  order by (p.status <> 'open'), p.opened_at desc, p.id;
$$;

create or replace function public.admin_certification_platform_review_queue(p_status text default 'open')
returns table (review_id uuid, certification_id uuid, basis text, status text, revision integer, opened_at timestamptz,
               decided_at timestamptz, certification_title text, shop_name_snapshot text, certification_status text,
               issuing_shop_present boolean, issuing_shop_currently_verified boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('open', 'reinstated', 'upheld', 'withdrawn', 'resolved_by_shop') then
    raise exception 'Choose a review status.' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    return;
  end if;
  return query
  select p.id, p.certification_id, p.basis, p.status, p.revision, p.opened_at, p.decided_at, c.certification_title,
         c.shop_name_snapshot, c.status, s.id is not null, coalesce(s.id is not null and public.shop_has_recorded_verification(s.id), false)
  from public.certification_platform_reviews p
  join public.certifications c on c.id = p.certification_id
  left join public.shops s on s.id = c.shop_id
  where p.status = p_status
  order by p.opened_at, p.id
  limit 200;
end;
$$;

create or replace function public.admin_certification_platform_review_case(p_review_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  review public.certification_platform_reviews;
  cert public.certifications;
  result jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can read WashLink reviews.' using errcode = '42501';
  end if;
  select * into review from public.certification_platform_reviews p where p.id = p_review_id;
  if review.id is null then
    raise exception 'WashLink review not found.' using errcode = '42501';
  end if;
  select * into cert from public.certifications c where c.id = review.certification_id;
  perform public.record_workforce_audit_event('certification_platform_review.case_viewed', 'certification', cert.id, cert.worker_id,
    jsonb_build_object('certification_id', cert.id, 'platform_review_id', review.id, 'to_status', review.status));
  select jsonb_build_object(
    'review', jsonb_build_object('id', review.id, 'certification_id', review.certification_id, 'basis', review.basis,
      'status', review.status, 'revision', review.revision, 'certification_status_at_open', review.certification_status_at_open,
      'escalated_from_request_id', review.escalated_from_request_id, 'worker_statement', review.worker_statement,
      'opened_at', review.opened_at, 'decided_at', review.decided_at, 'decision_reason', review.decision_reason,
      'closed_at', review.closed_at),
    'worker_display_name', coalesce(nullif(btrim(pr.full_name), ''), 'Worker'),
    'certification', jsonb_build_object('certification_title', cert.certification_title,
      'program_title_snapshot', cert.program_title_snapshot, 'shop_name_snapshot', cert.shop_name_snapshot,
      'issued_at', cert.issued_at, 'expires_at', cert.expires_at, 'status', cert.status,
      'effective_status', public.certification_effective_status(cert.status, cert.expires_at, now()),
      'status_reason', cert.status_reason, 'attended_training_days', cert.attended_training_days,
      'required_training_days', cert.required_training_days,
      'shop_verification_status_at_issue', cert.shop_verification_status_at_issue,
      'shop_verified_at_at_issue', cert.shop_verified_at_at_issue,
      'issuing_shop_present', s.id is not null,
      'issuing_owner_current', s.id is not null and cert.owner_id is not null and s.owner_id = cert.owner_id,
      'issuing_shop_currently_verified', coalesce(s.id is not null and public.shop_has_recorded_verification(s.id), false),
      'training_record_changed_after_issue', not public.training_enrollment_is_completed(cert.enrollment_id)),
    'status_events', coalesce((select jsonb_agg(jsonb_build_object('event', ev.event, 'from_status', ev.from_status,
        'to_status', ev.to_status, 'reason', ev.reason, 'actor_role', ev.actor_role, 'actor_display_name', ev.actor_display_name,
        'created_at', ev.created_at) order by ev.id)
      from public.certification_status_events ev where ev.certification_id = cert.id), '[]'::jsonb),
    'shop_requests', coalesce((select jsonb_agg(jsonb_build_object('worker_statement', r.worker_statement, 'status', r.status,
        'decision_reason', r.decision_reason, 'requested_at', r.requested_at, 'decided_at', r.decided_at)
        order by r.requested_at, r.created_at, r.id)
      from public.certification_review_requests r where r.certification_id = cert.id), '[]'::jsonb))
  into result
  from (select 1) one
  left join public.profiles pr on pr.id = cert.worker_id
  left join public.shops s on s.id = cert.shop_id;
  return result;
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.my_certification_platform_reviews()',
    'public.owner_certification_platform_reviews()',
    'public.admin_certification_platform_review_queue(text)',
    'public.admin_certification_platform_review_case(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.admin_certification_platform_review_case(uuid);
-- drop function if exists public.admin_certification_platform_review_queue(text);
-- drop function if exists public.owner_certification_platform_reviews();
-- drop function if exists public.my_certification_platform_reviews();
