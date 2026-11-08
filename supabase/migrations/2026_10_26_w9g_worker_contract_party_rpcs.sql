-- =============================================================
-- WashLink W9g - worker contract party RPCs and the remaining owner transitions (W9 PLAN 3.6 / 3.7, section 4; P47,
-- P52; spec F; D-34; C7). Requires w9c..w9f. Idempotent.
-- Worker: accept / decline the pending sent version (decline is always possible while sent, also when the shop is
-- unverified or gone), terminate an accepted / active contract (reason 10..500; no other gate). Owner (w9f rules):
-- discard an unsent draft, create an amendment (D-34: every change after acceptance), record the start (activate,
-- C7 gate), terminate. expire_worker_contracts is internal (W12 schedules it). Lock order as w9f.
-- (discard / amendment / activate live here, not in w9f, to keep each file <= 350 lines.)
-- =============================================================

-- The caller's own contract as its worker (sent at least once), locked in the W9 order; anything else -> 42501.
create or replace function public.worker_contract_lock_for_worker(p_contract_id uuid)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
begin
  if auth.uid() is not null and coalesce(public.current_user_profile_role() = 'worker', false) then
    select * into c from public.worker_contracts where id = p_contract_id and worker_id = auth.uid() and sent_at is not null for update;
    if c.id is not null then
      perform 1 from public.contract_versions v where v.contract_id = c.id order by v.version_number for update;
      perform 1 from public.shops s where s.id = c.shop_id for share;
    end if;
  end if;
  if c.id is null then
    raise exception 'Contract not found.' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- Ends every open amendment of a contract that is ending (or whose party left): a sent one -> withdrawn, an unsent
-- draft -> deleted. The caller holds the write flag and the locks.
create or replace function public.worker_contract_close_open_versions(p_contract_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('washlink.worker_contract_closing', p_contract_id::text, true);   -- w9j: no separate withdrawal notice
  update public.contract_versions set state = 'withdrawn', responded_at = now()
  where contract_id = p_contract_id and kind = 'amendment' and state = 'sent_for_review';
  delete from public.contract_versions where contract_id = p_contract_id and kind = 'amendment' and state = 'draft';
  update public.worker_contracts set pending_version_id = null
  where id = p_contract_id and pending_version_id is not null
    and not exists (select 1 from public.contract_versions v where v.id = pending_version_id and v.state = 'sent_for_review');
  perform set_config('washlink.worker_contract_closing', '', true);
end;
$$;

create or replace function public.discard_worker_contract_draft(p_contract_id uuid, p_version_id uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
begin
  c := public.worker_contract_lock_for_owner(p_contract_id);
  select * into v from public.contract_versions x where x.id = p_version_id and x.contract_id = c.id;
  if v.id is null or v.state <> 'draft' or (v.kind = 'initial' and (c.status <> 'draft' or c.sent_at is not null)) then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  if v.kind = 'initial' then
    delete from public.worker_contracts where id = c.id;   -- cascades the draft version
  else
    delete from public.contract_versions where id = v.id;
  end if;
  perform set_config('washlink.worker_contract_write', '', true);
  return true;
end;
$$;

-- A new draft version copying the version in force (D-34); optional switch to another own template version or the
-- current standard (contract-level edits and shop terms are kept).
create or replace function public.create_worker_contract_amendment(p_contract_id uuid, p_expected_revision integer,
                                                                   p_template_version_id uuid default null)
returns public.contract_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  cur public.contract_versions;
  tv public.contract_template_versions;
  base_id uuid;
  created public.contract_versions;
begin
  c := public.worker_contract_lock_for_owner(p_contract_id);
  if public.worker_contract_effective_status(c.status, c.end_date) not in ('accepted', 'active') or c.worker_id is null then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from c.revision then
    raise exception 'This contract changed. Reload it and try again.' using errcode = '55000';
  end if;
  if exists (select 1 from public.contract_versions v where v.contract_id = c.id and v.state in ('draft', 'sent_for_review')) then
    raise exception 'This contract already has an open change.' using errcode = '23505';
  end if;
  select * into cur from public.contract_versions where id = c.current_version_id;
  if p_template_version_id is null then
    tv.id := cur.template_version_id;
    base_id := cur.base_platform_version_id;
  else
    tv := public.worker_contract_pick_template_version(p_template_version_id);
    base_id := coalesce(tv.base_platform_version_id, tv.id);
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  insert into public.contract_versions (contract_id, version_number, kind, template_version_id, template_name_snapshot,
                                        base_platform_version_id, base_platform_content_hash, base_platform_version_number,
                                        classification_key, classification_label, editable_bodies, shop_terms, owner_values, start_date, end_date)
  values (c.id, (select max(v.version_number) + 1 from public.contract_versions v where v.contract_id = c.id), 'amendment', tv.id,
          cur.template_name_snapshot, base_id, repeat('0', 64), 1, cur.classification_key, 'pending',
          coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(cur.editable_bodies) e
                    where exists (select 1 from public.contract_template_clauses b where b.version_id = base_id
                                  and b.clause_key = e.key and b.kind = 'editable')), '{}'::jsonb),
          cur.shop_terms, cur.owner_values, cur.start_date, cur.end_date)
  returning * into created;
  perform set_config('washlink.worker_contract_write', '', true);
  return created;
end;
$$;

-- The owner records the start (D-31) after acceptance: start date reached, verified shop, and not while the worker is
-- still in required training with this owner (C7: training is not productive work).
create or replace function public.activate_worker_contract(p_contract_id uuid, p_expected_revision integer)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
begin
  c := public.worker_contract_lock_for_owner(p_contract_id);
  if public.worker_contract_effective_status(c.status, c.end_date) <> 'accepted' then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from c.revision then
    raise exception 'This contract changed. Reload it and try again.' using errcode = '55000';
  end if;
  if c.start_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The contract start date has not been reached yet.' using errcode = '23514';
  end if;
  if not public.is_verified_shop_owner(c.shop_id) then
    raise exception 'Your shop needs a recorded verification before you record the start.' using errcode = '23514';
  end if;
  if exists (select 1 from public.training_enrollments e join public.training_programs p on p.id = e.program_id
             where e.worker_id = c.worker_id and e.owner_id = c.owner_id and e.status = 'accepted'
               and p.training_kind = 'required_initial' and public.training_enrollment_is_live(e.id)) then
    raise exception 'This worker is still in required training with your shop. Training is not productive work, so the contract cannot start yet.'
      using errcode = '23514';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  update public.worker_contracts set status = 'active', activated_at = now() where id = c.id returning * into c;
  perform set_config('washlink.worker_contract_write', '', true);
  return c;
end;
$$;

-- -------------------------------------------------------------
-- Worker responses (P47: the acceptance row is created here, for the calling worker only).
-- -------------------------------------------------------------
create or replace function public.accept_worker_contract_version(p_contract_id uuid, p_version_id uuid, p_content_hash text,
                                                                 p_acknowledgement_key text, p_contractor_acknowledgement_key text default null)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
  needs_extra boolean;
begin
  c := public.worker_contract_lock_for_worker(p_contract_id);
  select * into v from public.contract_versions x where x.id = p_version_id and x.contract_id = c.id;
  if v.id is null or v.state <> 'sent_for_review' or c.pending_version_id is distinct from v.id
     or not ((v.kind = 'initial' and c.status = 'sent_for_review')
             or (v.kind = 'amendment' and public.worker_contract_effective_status(c.status, c.end_date) in ('accepted', 'active'))) then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if p_content_hash is distinct from v.content_hash then
    raise exception 'This contract changed. Read the new version before you accept.' using errcode = '55000';
  end if;
  if c.owner_id is null or c.shop_id is null then
    raise exception 'This shop is no longer on WashLink, so this offer can only be declined.' using errcode = '23514';
  end if;
  if not public.shop_has_recorded_verification(c.shop_id) then
    raise exception 'This shop''s verification is not current. You can decline or wait.' using errcode = '23514';
  end if;
  if p_acknowledgement_key is distinct from 'w9_worker_accept_v1' then
    raise exception 'Confirm the acceptance statement before accepting.' using errcode = '23514';
  end if;
  select o.needs_extra_acknowledgement into needs_extra from public.worker_classification_options o where o.classification_key = v.classification_key;
  if needs_extra and p_contractor_acknowledgement_key is distinct from 'w9_contractor_worker_v1' then
    raise exception 'Confirm the independent contractor acknowledgement.' using errcode = '23514';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  insert into public.contract_acceptances (contract_id, version_id, version_number, version_content_hash, party_role, party_id,
                                           party_name_snapshot, statement_key, statement_text, contractor_ack_key)
  values (c.id, v.id, v.version_number, v.content_hash, 'worker', auth.uid(), 'pending', 'w9_worker_accept_v1', 'pending',
          case when needs_extra then 'w9_contractor_worker_v1' end);
  update public.contract_versions set state = 'accepted', responded_at = now() where id = v.id;
  if v.kind = 'amendment' then
    update public.contract_versions set state = 'superseded' where id = c.current_version_id;
  end if;
  update public.worker_contracts
  set status = case when v.kind = 'initial' then 'accepted' else status end,
      accepted_at = case when v.kind = 'initial' then now() else accepted_at end,
      current_version_id = v.id, pending_version_id = null, start_date = v.start_date, end_date = v.end_date
  where id = c.id
  returning * into c;
  perform set_config('washlink.worker_contract_write', '', true);
  return c;
end;
$$;

create or replace function public.decline_worker_contract_version(p_contract_id uuid, p_version_id uuid, p_note text default null)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
  note text := nullif(public.contract_template_normalize_text(p_note), '');
begin
  c := public.worker_contract_lock_for_worker(p_contract_id);
  select * into v from public.contract_versions x where x.id = p_version_id and x.contract_id = c.id;
  if v.id is null or v.state <> 'sent_for_review' or c.pending_version_id is distinct from v.id then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if char_length(note) > 500 then
    raise exception 'Keep the note to 500 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  update public.contract_versions set state = 'declined', responded_at = now(), decline_note = note where id = v.id;
  if v.kind = 'initial' then
    update public.worker_contracts set status = 'declined', ended_at = now(), decline_note = note, pending_version_id = null
    where id = c.id returning * into c;
  else
    update public.worker_contracts set pending_version_id = null where id = c.id returning * into c;
  end if;
  perform set_config('washlink.worker_contract_write', '', true);
  return c;
end;
$$;

-- The worker (always) or the current owner ends an accepted / active contract; a pending amendment is withdrawn.
create or replace function public.terminate_worker_contract(p_contract_id uuid, p_expected_revision integer, p_reason text)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  actor text := case public.current_user_profile_role() when 'worker' then 'worker' when 'owner' then 'owner' end;
  reason text := public.contract_template_normalize_text(p_reason);
begin
  if actor = 'worker' then
    c := public.worker_contract_lock_for_worker(p_contract_id);
  elsif actor = 'owner' then
    c := public.worker_contract_lock_for_owner(p_contract_id);
  else
    raise exception 'Contract not found.' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from c.revision then
    raise exception 'This contract changed. Reload it and try again.' using errcode = '55000';
  end if;
  if public.worker_contract_effective_status(c.status, c.end_date) not in ('accepted', 'active') then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if coalesce(char_length(reason), 0) not between 10 and 500 then
    raise exception 'Give a reason of 10 to 500 characters.' using errcode = '23514';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  perform public.worker_contract_close_open_versions(c.id);
  update public.worker_contracts set status = 'terminated', ended_at = now(), ended_by = actor, end_reason = reason, pending_version_id = null
  where id = c.id returning * into c;
  perform set_config('washlink.worker_contract_write', '', true);
  return c;
end;
$$;

-- Internal, idempotent (W12 schedules it): accepted / active contracts whose end date is before p_as_of -> expired.
create or replace function public.expire_worker_contracts(p_as_of date default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Manila')::date);
  target uuid;
  expired_count integer := 0;
begin
  if as_of < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The expiry date cannot be in the past.' using errcode = '22023';
  end if;
  for target in select c.id from public.worker_contracts c where c.status in ('accepted', 'active') and c.end_date < as_of
                order by c.id for update loop
    perform 1 from public.contract_versions v where v.contract_id = target order by v.version_number for update;
    perform set_config('washlink.worker_contract_write', target::text, true);
    perform public.worker_contract_close_open_versions(target);
    update public.worker_contracts set status = 'expired', ended_at = now(), ended_by = 'system', pending_version_id = null where id = target;
    expired_count := expired_count + 1;
  end loop;
  perform set_config('washlink.worker_contract_write', '', true);
  return expired_count;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['worker_contract_lock_for_worker(uuid)', 'worker_contract_close_open_versions(uuid)',
    'expire_worker_contracts(date)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
  foreach sig in array array['discard_worker_contract_draft(uuid, uuid)', 'create_worker_contract_amendment(uuid, integer, uuid)',
    'activate_worker_contract(uuid, integer)', 'accept_worker_contract_version(uuid, uuid, text, text, text)',
    'decline_worker_contract_version(uuid, uuid, text)', 'terminate_worker_contract(uuid, integer, text)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a)
-- -------------------------------------------------------------
-- drop function if exists public.expire_worker_contracts(date), public.terminate_worker_contract(uuid, integer, text),
--   public.decline_worker_contract_version(uuid, uuid, text), public.accept_worker_contract_version(uuid, uuid, text, text, text),
--   public.activate_worker_contract(uuid, integer), public.create_worker_contract_amendment(uuid, integer, uuid),
--   public.discard_worker_contract_draft(uuid, uuid), public.worker_contract_close_open_versions(uuid),
--   public.worker_contract_lock_for_worker(uuid);
