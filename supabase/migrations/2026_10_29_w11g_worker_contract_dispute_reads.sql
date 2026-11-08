-- =============================================================
-- WashLink W11g - reported contract problem reads (spec A, E, H; D-47; W11 PLAN 3.7, P65, P70). Requires w9c..w9h,
-- w10e, w11e, w11f. Idempotent. Definer, scoped to auth.uid() and the profile role.
-- Parties (my_contract_disputes): the worker of a sent contract or its owner; never administrator ids or names.
-- super_admin (P70): the queue lists disputes; its contract status / effective status / shop name are null unless the
-- dispute is open (fix cycle 1 N4: the queue is not audited, so nothing about the contract after close); contract metadata, sealed versions, acceptance records and the live
-- (worker, owner) relationship status are readable ONLY through the two case functions, ONLY while that dispute is
-- open, and EVERY call writes worker_contract_dispute.case_viewed (VOLATILE; an audit failure aborts the read). The
-- relationship block carries status and reason only: no count, remaining, minimum or other owners. A closed or
-- withdrawn dispute returns the dispute row without any contract block.
-- =============================================================

create or replace function public.my_contract_disputes()
returns table (dispute_id uuid, contract_id uuid, shop_name text, counterpart_name text, category text, status text, raised_by_me boolean,
               statement text, response_statement text, resolution_kind text, resolution_note text, created_at timestamptz,
               responded_at timestamptz, closed_at timestamptz, washlink_has_viewed boolean, can_respond boolean, can_withdraw boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, c.id, c.shop_name_snapshot, case when x.party = 'worker' then c.owner_name_snapshot else c.worker_name_snapshot end,
         d.category, d.status, d.raised_by_role = x.party, d.statement, d.response_statement, d.resolution_kind, d.resolution_note,
         d.created_at, d.responded_at, d.closed_at, d.first_viewed_by_admin_at is not null,
         d.status = 'open' and d.raised_by_role <> x.party and d.response_statement is null,
         d.status = 'open' and d.raised_by_role = x.party
  from public.worker_contract_disputes d
  join public.worker_contracts c on c.id = d.contract_id
  cross join lateral (select case when public.current_user_profile_role() = 'worker' and c.worker_id = auth.uid() and c.sent_at is not null
                                  then 'worker'
                                  when public.current_user_profile_role() = 'owner' and c.owner_id = auth.uid() then 'owner' end as party) x
  where auth.uid() is not null and x.party is not null
  order by (d.status <> 'open'), d.created_at desc, d.id;
$$;

create or replace function public.admin_contract_dispute_queue(p_status text default 'open')
returns table (dispute_id uuid, contract_id uuid, category text, status text, revision integer, raised_by_role text, has_response boolean,
               contract_status text, effective_status text, shop_name_snapshot text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('open', 'closed', 'withdrawn') then
    raise exception 'Choose a dispute status.' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    return;
  end if;
  return query
  select d.id, d.contract_id, d.category, d.status, d.revision, d.raised_by_role, d.response_statement is not null,
         case when d.status = 'open' then c.status end,
         case when d.status = 'open' then public.worker_contract_effective_status(c.status, c.end_date) end,
         case when d.status = 'open' then c.shop_name_snapshot end, d.created_at
  from public.worker_contract_disputes d
  join public.worker_contracts c on c.id = d.contract_id
  where d.status = p_status
  order by d.created_at, d.id
  limit 200;
end;
$$;

create or replace function public.admin_contract_dispute_case(p_dispute_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  d public.worker_contract_disputes;
  c public.worker_contracts;
  result jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can read reported contract problems.' using errcode = '42501';
  end if;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id;
  if d.id is null then
    raise exception 'Reported problem not found.' using errcode = '42501';
  end if;
  select * into c from public.worker_contracts x where x.id = d.contract_id for share;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id for update;
  if d.status = 'open' and d.first_viewed_by_admin_at is null then
    perform set_config('washlink.contract_dispute_write', d.id::text, true);
    update public.worker_contract_disputes set first_viewed_by_admin_at = now() where id = d.id returning * into d;
    perform set_config('washlink.contract_dispute_write', '', true);
  end if;
  perform public.record_workforce_audit_event('worker_contract_dispute.case_viewed', 'worker_contract', c.id, coalesce(c.owner_id, c.worker_id),
    jsonb_build_object('dispute_id', d.id, 'contract_id', c.id, 'to_status', d.status, 'contract_block', d.status = 'open'));
  result := jsonb_build_object('dispute', jsonb_build_object('id', d.id, 'contract_id', d.contract_id, 'category', d.category,
    'status', d.status, 'revision', d.revision, 'raised_by_role', d.raised_by_role, 'statement', d.statement,
    'contract_status_at_raise', d.contract_status_at_raise, 'response_statement', d.response_statement, 'responded_at', d.responded_at,
    'resolution_kind', d.resolution_kind, 'resolution_note', d.resolution_note, 'created_at', d.created_at, 'closed_at', d.closed_at,
    'withdrawn_at', d.withdrawn_at, 'first_viewed_by_admin_at', d.first_viewed_by_admin_at));
  if d.status <> 'open' then
    return result;
  end if;
  return result || jsonb_build_object(
    'contract', jsonb_build_object('status', c.status, 'effective_status', public.worker_contract_effective_status(c.status, c.end_date),
      'classification_key', (select v.classification_key from public.contract_versions v
                             where v.contract_id = c.id and v.rendered_text is not null
                             order by (v.id = c.current_version_id) is true desc, v.version_number desc limit 1),
      'start_date', c.start_date, 'end_date', c.end_date, 'sent_at', c.sent_at, 'accepted_at', c.accepted_at,
      'activated_at', c.activated_at, 'ended_at', c.ended_at, 'ended_by', c.ended_by, 'end_reason', c.end_reason,
      'decline_note', c.decline_note, 'shop_name_snapshot', c.shop_name_snapshot, 'owner_name_snapshot', c.owner_name_snapshot,
      'worker_name_snapshot', c.worker_name_snapshot, 'owner_removed', c.owner_removed_at is not null,
      'shop_removed', c.shop_removed_at is not null, 'worker_removed', c.worker_removed_at is not null),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'version_number', v.version_number, 'kind', v.kind,
        'state', v.state, 'sealed_at', v.sealed_at, 'content_hash', v.content_hash, 'flag_count', v.flag_count) order by v.version_number)
      from public.contract_versions v where v.contract_id = c.id and v.rendered_text is not null), '[]'::jsonb),
    'acceptances', coalesce((select jsonb_agg(jsonb_build_object('party_role', a.party_role, 'version_number', a.version_number,
        'accepted_at', a.accepted_at, 'version_content_hash', a.version_content_hash, 'record_label', a.record_label)
        order by a.version_number, a.accepted_at)
      from public.contract_acceptances a where a.contract_id = c.id), '[]'::jsonb),
    'relationship', (select jsonb_build_object('status', r.status, 'status_reason', r.status_reason)
                     from public.worker_owner_relationship_derive(c.worker_id, c.owner_id, null) r
                     where c.worker_id is not null and c.owner_id is not null and r.has_accepted_contract));
end;
$$;

create or replace function public.admin_contract_dispute_version_document(p_dispute_id uuid, p_version_id uuid)
returns table (rendered_text text, content_hash text, sealed_at timestamptz, record_label text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  d public.worker_contract_disputes;
  v public.contract_versions;
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can read reported contract problems.' using errcode = '42501';
  end if;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id and x.status = 'open';
  select * into v from public.contract_versions x where x.id = p_version_id and x.contract_id = d.contract_id and x.rendered_text is not null;
  if d.id is null or v.id is null then
    return;
  end if;
  perform public.record_workforce_audit_event('worker_contract_dispute.case_viewed', 'worker_contract', d.contract_id,
    (select coalesce(c.owner_id, c.worker_id) from public.worker_contracts c where c.id = d.contract_id),
    jsonb_build_object('dispute_id', d.id, 'contract_id', d.contract_id, 'version_id', v.id, 'to_status', d.status));
  return query select v.rendered_text, v.content_hash, v.sealed_at, 'Acceptance record — not an e-signature'::text;
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.my_contract_disputes()',
    'public.admin_contract_dispute_queue(text)',
    'public.admin_contract_dispute_case(uuid)',
    'public.admin_contract_dispute_version_document(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.admin_contract_dispute_version_document(uuid, uuid);
-- drop function if exists public.admin_contract_dispute_case(uuid);
-- drop function if exists public.admin_contract_dispute_queue(text);
-- drop function if exists public.my_contract_disputes();
