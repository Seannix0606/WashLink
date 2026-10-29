-- =============================================================
-- WashLink W11f - reported contract problem RPCs (spec A, E, F; D-47; W11 PLAN 3.6, P69, P71). Requires w9c, w9e, w11e.
-- Idempotent. Lock order: worker_contracts row FOR SHARE -> dispute row FOR UPDATE.
-- A party is the worker (role worker, worker_id = caller, contract sent) or the owner (role owner, owner_id = caller).
--   raise     either party; sent contract; not ended more than 90 days ago; category fits the contract end; one open per
--             party; at most 3 per party and contract.
--   respond   the other party only; once; while open.
--   withdraw  the raising party; open -> withdrawn.
--   close     super_admin only; open -> closed with a resolution kind and a note to both parties.
-- None of the four reads for update, inserts, updates or deletes worker_contracts or any contract child table, and none
-- blocks a decline or a termination (J16): the FOR SHARE lock is held only for the statement's transaction.
-- =============================================================

create or replace function public.raise_contract_dispute(p_contract_id uuid, p_category text, p_statement text)
returns public.worker_contract_disputes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.worker_contracts;
  caller_role text := coalesce(public.current_user_profile_role(), '');
  party text;
  statement_text text := nullif(btrim(p_statement), '');
  ended_time timestamptz;
  new_id uuid := gen_random_uuid();
  created public.worker_contract_disputes;
begin
  select * into c from public.worker_contracts x where x.id = p_contract_id;
  party := case when auth.uid() is null or c.id is null then null
                when caller_role = 'worker' and c.worker_id = auth.uid() and c.sent_at is not null then 'worker'
                when caller_role = 'owner' and c.owner_id = auth.uid() then 'owner' end;
  if party is null then
    raise exception 'Contract not found.' using errcode = '42501';
  end if;
  select * into c from public.worker_contracts x where x.id = p_contract_id for share;
  if c.sent_at is null then
    raise exception 'Only a contract that was sent can be reported.' using errcode = '23514';
  end if;
  ended_time := case when c.status in ('declined', 'withdrawn', 'expired', 'terminated') then c.ended_at
                     when public.worker_contract_effective_status(c.status, c.end_date) = 'expired'
                       then ((c.end_date + 1)::timestamp at time zone 'Asia/Manila') end;
  if ended_time is not null and now() > ended_time + interval '90 days' then
    raise exception 'Problems can be reported up to 90 days after a contract ends.' using errcode = '23514';
  end if;
  if p_category is null or p_category not in ('owner_ended_contract', 'worker_ended_contract', 'contract_terms', 'amendment',
                                              'acceptance_record', 'other') then
    raise exception 'Choose a problem category.' using errcode = '22023';
  end if;
  if (p_category = 'owner_ended_contract' and (c.ended_by is distinct from 'owner' or party <> 'worker'))
     or (p_category = 'worker_ended_contract' and (c.ended_by is distinct from 'worker' or party <> 'owner')) then
    raise exception 'This category does not match the contract.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contract_dispute:' || c.id::text || ':' || party, 0));
  if exists (select 1 from public.worker_contract_disputes d where d.contract_id = c.id and d.raised_by_role = party and d.status = 'open') then
    raise exception 'You already reported a problem with this contract.' using errcode = '23505';
  end if;
  if (select count(*) from public.worker_contract_disputes d where d.contract_id = c.id and d.raised_by_role = party) >= 3 then
    raise exception 'You can report at most 3 problems with this contract.' using errcode = '23514';
  end if;
  if statement_text is null or char_length(statement_text) not between 20 and 1000 then
    raise exception 'Write a statement of 20 to 1000 characters.' using errcode = '23514';
  end if;
  begin
    perform set_config('washlink.contract_dispute_write', new_id::text, true);
    insert into public.worker_contract_disputes (id, contract_id, raised_by, raised_by_role, category, statement, contract_status_at_raise)
    values (new_id, c.id, auth.uid(), party, p_category, statement_text, public.worker_contract_effective_status(c.status, c.end_date))
    returning * into created;
  exception when unique_violation then
    raise exception 'You already reported a problem with this contract.' using errcode = '23505';
  end;
  perform set_config('washlink.contract_dispute_write', '', true);
  return created;
end;
$$;

create or replace function public.respond_to_contract_dispute(p_dispute_id uuid, p_statement text)
returns public.worker_contract_disputes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.worker_contract_disputes;
  c public.worker_contracts;
  caller_role text := coalesce(public.current_user_profile_role(), '');
  party text;
  statement_text text := nullif(btrim(p_statement), '');
begin
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id;
  select * into c from public.worker_contracts x where x.id = d.contract_id;
  party := case when auth.uid() is null or d.id is null or c.id is null then null
                when caller_role = 'worker' and c.worker_id = auth.uid() and c.sent_at is not null then 'worker'
                when caller_role = 'owner' and c.owner_id = auth.uid() then 'owner' end;
  if party is null then
    raise exception 'Reported problem not found.' using errcode = '42501';
  end if;
  if party = d.raised_by_role then
    raise exception 'Only the other party can add a response.' using errcode = '42501';
  end if;
  perform 1 from public.worker_contracts x where x.id = c.id for share;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id for update;
  if d.status <> 'open' then
    raise exception 'This reported problem is no longer open.' using errcode = '23514';
  end if;
  if d.response_statement is not null then
    raise exception 'A response was already recorded.' using errcode = '23505';
  end if;
  if statement_text is null or char_length(statement_text) not between 20 and 1000 then
    raise exception 'Write a statement of 20 to 1000 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.contract_dispute_write', d.id::text, true);
  update public.worker_contract_disputes set response_statement = statement_text where id = d.id returning * into d;
  perform set_config('washlink.contract_dispute_write', '', true);
  return d;
end;
$$;

create or replace function public.withdraw_contract_dispute(p_dispute_id uuid)
returns public.worker_contract_disputes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.worker_contract_disputes;
  c public.worker_contracts;
  caller_role text := coalesce(public.current_user_profile_role(), '');
  party text;
begin
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id;
  select * into c from public.worker_contracts x where x.id = d.contract_id;
  party := case when auth.uid() is null or d.id is null or c.id is null then null
                when caller_role = 'worker' and c.worker_id = auth.uid() and c.sent_at is not null then 'worker'
                when caller_role = 'owner' and c.owner_id = auth.uid() then 'owner' end;
  if party is null or party <> d.raised_by_role then
    raise exception 'Reported problem not found.' using errcode = '42501';
  end if;
  perform 1 from public.worker_contracts x where x.id = c.id for share;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id for update;
  if d.status <> 'open' then
    raise exception 'This reported problem is no longer open.' using errcode = '23514';
  end if;
  perform set_config('washlink.contract_dispute_write', d.id::text, true);
  update public.worker_contract_disputes set status = 'withdrawn' where id = d.id returning * into d;
  perform set_config('washlink.contract_dispute_write', '', true);
  return d;
end;
$$;

create or replace function public.close_contract_dispute(p_dispute_id uuid, p_expected_revision integer, p_resolution_kind text,
                                                         p_resolution_note text)
returns public.worker_contract_disputes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.worker_contract_disputes;
  note_text text := nullif(btrim(p_resolution_note), '');
begin
  if auth.uid() is null or not public.is_super_admin() or coalesce(public.current_user_profile_role(), '') <> 'super_admin' then
    raise exception 'Only a platform administrator can close disputes.' using errcode = '42501';
  end if;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id;
  if d.id is null then
    raise exception 'Reported problem not found.' using errcode = '42501';
  end if;
  perform 1 from public.worker_contracts x where x.id = d.contract_id for share;
  select * into d from public.worker_contract_disputes x where x.id = p_dispute_id for update;
  if d.status <> 'open' then
    raise exception 'This reported problem is no longer open.' using errcode = '23514';
  end if;
  if p_expected_revision is distinct from d.revision then
    raise exception 'This reported problem changed. Refresh and try again.' using errcode = '55000';
  end if;
  if p_resolution_kind is null or p_resolution_kind not in ('information_shared', 'referred_outside_washlink', 'no_platform_action') then
    raise exception 'Choose how the problem was closed.' using errcode = '22023';
  end if;
  if note_text is null or char_length(note_text) not between 20 and 1000 then
    raise exception 'Write a note of 20 to 1000 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.contract_dispute_write', d.id::text, true);
  update public.worker_contract_disputes set status = 'closed', resolution_kind = p_resolution_kind, resolution_note = note_text
  where id = d.id returning * into d;
  perform set_config('washlink.contract_dispute_write', '', true);
  return d;
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.raise_contract_dispute(uuid, text, text)',
    'public.respond_to_contract_dispute(uuid, text)',
    'public.withdraw_contract_dispute(uuid)',
    'public.close_contract_dispute(uuid, integer, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W11 rollbacks in reverse order i..a)
-- -------------------------------------------------------------
-- drop function if exists public.close_contract_dispute(uuid, integer, text, text);
-- drop function if exists public.withdraw_contract_dispute(uuid);
-- drop function if exists public.respond_to_contract_dispute(uuid, text);
-- drop function if exists public.raise_contract_dispute(uuid, text, text);
