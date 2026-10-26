-- =============================================================
-- WashLink W9f - worker contract owner RPCs (W9 PLAN 3.6, section 4; P45-P52; D-29, D-31, D-34). Requires w9c..w9e.
-- Idempotent. Caller: role owner and the CURRENT shops.owner_id of the contract's shop, else 42501 `Contract not
-- found.` (no existence oracle). Lock order: worker_contracts row FOR UPDATE -> its contract_versions rows FOR UPDATE
-- -> shop row FOR SHARE. The write flag is cleared before each RPC returns. Sending needs a recorded shop
-- verification (D-29); drafting does not. Manila date = (now() at time zone 'Asia/Manila')::date.
-- Owner-text helpers: w9b.
-- =============================================================

create or replace function public.worker_contract_party_name(p_profile_id uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select left(coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = p_profile_id)), ''), 'Name not provided on WashLink'), 200);
$$;

-- The caller's own contract (role owner, current shop owner), locked in the W9 order; anything else -> 42501.
create or replace function public.worker_contract_lock_for_owner(p_contract_id uuid)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
begin
  if auth.uid() is not null and coalesce(public.current_user_profile_role() = 'owner', false) then
    select * into c from public.worker_contracts where id = p_contract_id and owner_id = auth.uid() and shop_id is not null for update;
    if c.id is not null then
      perform 1 from public.contract_versions v where v.contract_id = c.id order by v.version_number for update;
      perform 1 from public.shops s where s.id = c.shop_id and s.owner_id = auth.uid() for share;
      if not found then
        c := null;
      end if;
    end if;
  end if;
  if c.id is null then
    raise exception 'Contract not found.' using errcode = '42501';
  end if;
  return c;
end;
$$;

-- A version of the caller's own active template, or the current standard version.
create or replace function public.worker_contract_pick_template_version(p_template_version_id uuid)
returns public.contract_template_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tv public.contract_template_versions;
  t public.contract_templates;
begin
  if p_template_version_id is null then
    raise exception 'Choose a contract template.' using errcode = '23514';
  end if;
  select * into tv from public.contract_template_versions v where v.id = p_template_version_id for share;
  select * into t from public.contract_templates x where x.id = tv.template_id;
  if tv.id is null or (t.scope = 'owner' and t.owner_id is distinct from auth.uid()) then
    raise exception 'Contract template not found.' using errcode = '42501';
  end if;
  if t.scope = 'platform' and tv.id is distinct from (public.contract_template_latest_platform_version()).id then
    raise exception 'Use the current standard template version.' using errcode = '23514';
  end if;
  if t.scope = 'owner' and t.status <> 'active' then
    raise exception 'Archived templates cannot be changed. Restore it first.' using errcode = '23514';
  end if;
  return tv;
end;
$$;

create or replace function public.worker_contract_check_terms(p_classification_key text, p_start_date date, p_end_date date)
returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_classification_key is null then
    raise exception 'Choose the relationship type for this contract.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.worker_classification_options o where o.classification_key = p_classification_key) then
    raise exception 'Unknown relationship type.' using errcode = '23514';
  end if;
  if p_start_date is null then
    raise exception 'Give a start date.' using errcode = '23514';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date.' using errcode = '23514';
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 1) Owner RPCs
-- -------------------------------------------------------------
-- p_classification_key has NO default (D-26); a null or unknown key is refused.
create or replace function public.create_worker_contract_draft(p_shop_id uuid, p_worker_id uuid, p_template_version_id uuid,
                                                               p_classification_key text, p_start_date date, p_end_date date default null,
                                                               p_owner_values jsonb default '{}'::jsonb)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.shops;
  tv public.contract_template_versions;
  eligible record;
  details jsonb;
  new_id uuid := gen_random_uuid();
  created public.worker_contracts;
begin
  if auth.uid() is not null and coalesce(public.current_user_profile_role() = 'owner', false) then
    select * into s from public.shops x where x.id = p_shop_id and x.owner_id = auth.uid() for share;
  end if;
  if s.id is null then
    raise exception 'Contract not found.' using errcode = '42501';
  end if;
  tv := public.worker_contract_pick_template_version(p_template_version_id);
  perform public.worker_contract_check_terms(p_classification_key, p_start_date, p_end_date);
  details := public.worker_contract_checked_owner_values(p_owner_values);
  select * into eligible from public.worker_contract_eligibility(s.id, p_worker_id);
  if eligible.origin is null then
    raise exception 'You can draft a contract only for a worker with an accepted application or completed training at this shop.'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.worker_contracts c where c.shop_id = s.id and c.worker_id = p_worker_id
             and c.status in ('draft', 'sent_for_review', 'accepted', 'active')) then
    raise exception 'This worker already has an open contract with this shop.' using errcode = '23505';
  end if;
  perform set_config('washlink.worker_contract_write', new_id::text, true);
  begin
    insert into public.worker_contracts (id, shop_id, owner_id, worker_id, origin, job_application_id, training_enrollment_id,
                                         shop_name_snapshot, shop_address_snapshot, owner_name_snapshot, worker_name_snapshot)
    values (new_id, s.id, auth.uid(), p_worker_id, eligible.origin, eligible.job_application_id, eligible.training_enrollment_id,
            left(s.name, 200), left(s.address, 200), public.worker_contract_party_name(auth.uid()), public.worker_contract_party_name(p_worker_id));
  exception when unique_violation then
    raise exception 'This worker already has an open contract with this shop.' using errcode = '23505';
  end;
  insert into public.contract_versions (contract_id, version_number, kind, template_version_id, template_name_snapshot,
                                        base_platform_version_id, base_platform_content_hash, base_platform_version_number,
                                        classification_key, classification_label, shop_terms, owner_values, start_date, end_date)
  values (new_id, 1, 'initial', tv.id, 'pending', coalesce(tv.base_platform_version_id, tv.id), repeat('0', 64), 1, p_classification_key,
          'pending', public.contract_template_shop_terms(tv.id), details, p_start_date, p_end_date);
  perform set_config('washlink.worker_contract_write', '', true);
  select * into created from public.worker_contracts where id = new_id;
  return created;
end;
$$;

-- The open draft version (initial or amendment). p_editable_bodies = the full set of contract-level edits
-- ({clause_key: body}); p_shop_terms = the full list ([{section_number, heading, body}]).
create or replace function public.save_worker_contract_draft(p_contract_id uuid, p_expected_draft_revision integer, p_classification_key text,
                                                             p_start_date date, p_end_date date, p_owner_values jsonb, p_editable_bodies jsonb,
                                                             p_shop_terms jsonb)
returns public.contract_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
  details jsonb;
  bodies jsonb := '{}'::jsonb;
  terms jsonb;
  item record;
  body text;
begin
  c := public.worker_contract_lock_for_owner(p_contract_id);
  select * into v from public.contract_versions x where x.contract_id = c.id and x.state = 'draft';
  if v.id is null or not ((v.kind = 'initial' and c.status = 'draft') or (v.kind = 'amendment' and c.status in ('accepted', 'active'))) then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if p_expected_draft_revision is distinct from v.draft_revision then
    raise exception 'This contract changed. Reload it and try again.' using errcode = '55000';
  end if;
  perform public.worker_contract_check_terms(p_classification_key, p_start_date, p_end_date);
  details := public.worker_contract_checked_owner_values(p_owner_values);
  if p_editable_bodies is not null and p_editable_bodies <> 'null'::jsonb and jsonb_typeof(p_editable_bodies) <> 'object' then
    raise exception 'Editable clause bodies must be text.' using errcode = '22023';
  end if;
  for item in select e.key, e.value from jsonb_each(coalesce(nullif(p_editable_bodies, 'null'::jsonb), '{}'::jsonb)) e loop
    if exists (select 1 from public.contract_template_clauses b where b.version_id = v.base_platform_version_id
               and b.clause_key = item.key and b.kind = 'locked_safeguard') then
      raise exception 'This clause is a WashLink safeguard and cannot be changed.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.contract_template_clauses b where b.version_id = v.base_platform_version_id
                   and b.clause_key = item.key and b.kind = 'editable') then
      raise exception 'Unknown clause.' using errcode = '22023';
    end if;
    if jsonb_typeof(item.value) <> 'string' then
      raise exception 'Editable clause bodies must be text.' using errcode = '22023';
    end if;
    body := public.contract_template_normalize_text(item.value #>> '{}');
    if char_length(body) = 0 then
      raise exception 'Editable clauses cannot be empty.' using errcode = '23514';
    end if;
    if char_length(body) > 4000 then
      raise exception 'A clause can hold up to 4000 characters.' using errcode = '23514';
    end if;
    perform public.worker_contract_check_owner_text(body);
    bodies := bodies || jsonb_build_object(item.key, body);
  end loop;
  terms := public.contract_template_checked_shop_terms(p_shop_terms);
  for item in select t.value from jsonb_array_elements(terms) t loop
    perform public.worker_contract_check_owner_text((item.value ->> 'heading') || E'\n' || (item.value ->> 'body'));
  end loop;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  update public.contract_versions
  set classification_key = p_classification_key, start_date = p_start_date, end_date = p_end_date, owner_values = details,
      editable_bodies = bodies, shop_terms = terms, draft_revision = draft_revision + 1
  where id = v.id
  returning * into v;
  perform set_config('washlink.worker_contract_write', '', true);
  return v;
end;
$$;

-- Seals the open draft (initial or amendment) and records the owner's acceptance (P46, P47). Checks in order: owner;
-- stale draft; recorded verification (D-29); initial start not in the past; nothing unfilled; statement keys; the
-- contractor acknowledgement when needed (D-26); the acknowledged flag count (D-33).
create or replace function public.send_worker_contract_version(p_contract_id uuid, p_expected_draft_revision integer,
                                                               p_acknowledgement_key text, p_contractor_acknowledgement_key text default null,
                                                               p_acknowledged_flag_count integer default null)
returns public.contract_versions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
  missing text[];
  needs_extra boolean;
begin
  c := public.worker_contract_lock_for_owner(p_contract_id);
  select * into v from public.contract_versions x where x.contract_id = c.id and x.state = 'draft';
  if v.id is null or not ((v.kind = 'initial' and c.status = 'draft')
                          or (v.kind = 'amendment' and public.worker_contract_effective_status(c.status, c.end_date) in ('accepted', 'active'))) then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  if p_expected_draft_revision is distinct from v.draft_revision then
    raise exception 'This contract changed. Reload it and try again.' using errcode = '55000';
  end if;
  if not public.is_verified_shop_owner(c.shop_id) then
    raise exception 'Your shop needs a recorded verification before you send a contract.' using errcode = '23514';
  end if;
  if v.kind = 'initial' and v.start_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'The start date cannot be in the past.' using errcode = '23514';
  end if;
  missing := public.worker_contract_unfilled(v.id);
  if cardinality(missing) > 0 then
    raise exception 'Fill in every shop clause and contract detail before sending (missing: %).', array_to_string(missing, ', ')
      using errcode = '23514';
  end if;
  if p_acknowledgement_key is distinct from 'w9_owner_send_v1' then
    raise exception 'Confirm the offer statement before sending.' using errcode = '23514';
  end if;
  select o.needs_extra_acknowledgement into needs_extra from public.worker_classification_options o where o.classification_key = v.classification_key;
  if needs_extra and p_contractor_acknowledgement_key is distinct from 'w9_contractor_owner_v1' then
    raise exception 'Confirm the independent contractor acknowledgement.' using errcode = '23514';
  end if;
  if p_acknowledged_flag_count is distinct from (select count(*)::integer from public.worker_contract_live_flags(v.id)) then
    raise exception 'The keyword check changed. Review the flags again.' using errcode = '55000';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  v := public.worker_contract_seal_version(v.id);
  insert into public.contract_acceptances (contract_id, version_id, version_number, version_content_hash, party_role, party_id,
                                           party_name_snapshot, statement_key, statement_text, contractor_ack_key)
  values (c.id, v.id, v.version_number, v.content_hash, 'owner', auth.uid(), 'pending', 'w9_owner_send_v1', 'pending',
          case when needs_extra then 'w9_contractor_owner_v1' end);
  perform public.validate_worker_contract_version(v.id);
  perform set_config('washlink.worker_contract_seal', '', true);
  if v.kind = 'initial' then
    update public.worker_contracts
    set status = 'sent_for_review', sent_at = now(), pending_version_id = v.id,
        shop_name_snapshot = coalesce(left((select s.name from public.shops s where s.id = c.shop_id), 200), shop_name_snapshot),
        shop_address_snapshot = coalesce(left((select s.address from public.shops s where s.id = c.shop_id), 200), shop_address_snapshot),
        owner_name_snapshot = public.worker_contract_party_name(c.owner_id),
        worker_name_snapshot = coalesce(case when c.worker_id is not null then public.worker_contract_party_name(c.worker_id) end,
                                        worker_name_snapshot)
    where id = c.id;
  else
    update public.worker_contracts set pending_version_id = v.id where id = c.id;
  end if;
  perform set_config('washlink.worker_contract_write', '', true);
  return v;
end;
$$;

-- The pending sent version: an initial offer -> contract withdrawn; an amendment -> the current version stays in force.
create or replace function public.withdraw_worker_contract_version(p_contract_id uuid, p_version_id uuid)
returns public.worker_contracts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts;
  v public.contract_versions;
begin
  c := public.worker_contract_lock_for_owner(p_contract_id);
  select * into v from public.contract_versions x where x.id = p_version_id and x.contract_id = c.id;
  if v.id is null or v.state <> 'sent_for_review' or c.pending_version_id is distinct from v.id then
    raise exception 'This contract change is not allowed.' using errcode = '42501';
  end if;
  perform set_config('washlink.worker_contract_write', c.id::text, true);
  update public.contract_versions set state = 'withdrawn', responded_at = now() where id = v.id;
  if v.kind = 'initial' then
    update public.worker_contracts set status = 'withdrawn', ended_at = now(), pending_version_id = null where id = c.id returning * into c;
  else
    update public.worker_contracts set pending_version_id = null where id = c.id returning * into c;
  end if;
  perform set_config('washlink.worker_contract_write', '', true);
  return c;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['worker_contract_party_name(uuid)', 'worker_contract_lock_for_owner(uuid)',
    'worker_contract_pick_template_version(uuid)', 'worker_contract_check_terms(text, date, date)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
  foreach sig in array array['create_worker_contract_draft(uuid, uuid, uuid, text, date, date, jsonb)',
    'save_worker_contract_draft(uuid, integer, text, date, date, jsonb, jsonb, jsonb)',
    'send_worker_contract_version(uuid, integer, text, text, integer)', 'withdraw_worker_contract_version(uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', sig);
    execute format('grant execute on function public.%s to authenticated', sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a)
-- -------------------------------------------------------------
-- drop function if exists public.withdraw_worker_contract_version(uuid, uuid),
--   public.send_worker_contract_version(uuid, integer, text, text, integer),
--   public.save_worker_contract_draft(uuid, integer, text, date, date, jsonb, jsonb, jsonb),
--   public.create_worker_contract_draft(uuid, uuid, uuid, text, date, date, jsonb),
--   public.worker_contract_check_terms(text, date, date), public.worker_contract_pick_template_version(uuid),
--   public.worker_contract_lock_for_owner(uuid), public.worker_contract_party_name(uuid);
