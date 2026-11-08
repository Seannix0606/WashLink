-- =============================================================
-- WashLink W9j - worker contract audit producers and notifications (spec I; W3 pattern; W9 PLAN 3.10, P54). Requires
-- w3b, w3c, w3d, w9c..w9i. Idempotent.
-- subject_type `worker_contract`, subject_id = contract id, subject_profile_id = owner_id (worker_id once the owner is
-- gone). Actions: worker_contract.created, .sent, .withdrawn, .accepted (party_role worker; the owner acceptance is part
-- of .sent), .declined, .activated, .terminated, .expired, .amendment_created, .draft_discarded, .party_removed, .deleted
-- (a trusted status repair is audited with changed_by trusted_session); job_application_record.retained. Payloads carry
-- ids, status / kind words and small counts only: never text, names, reasons, notes, pay, dates or hashes. Draft saves
-- are not audited; refused actions write nothing (the RPC aborts). An audit failure aborts the action (W3 rule).
-- Notifications (enqueue_notification_safely; key worker_contract:<contract id>:<audit event id>) carry only the shop
-- label (notification_safe_label(shop_name_snapshot, 'The shop')) and fixed wording; trusted repairs notify nobody.
-- =============================================================

create or replace function public.worker_contract_changed_by()
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is not null then coalesce(public.current_user_profile_role(), 'system')
              when public.is_trusted_db_session() then 'trusted_session' else 'system' end;
$$;

create or replace function public.worker_contract_notify(p_recipient uuid, p_contract_id uuid, p_event_id bigint, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.enqueue_notification_safely(p_recipient, 'worker_contract', p_title, p_body,
                                             'worker_contract:' || p_contract_id::text || ':' || p_event_id::text, 'worker_contract', p_contract_id);
end;
$$;

create or replace function public.worker_contracts_audit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.worker_contracts := case when tg_op = 'DELETE' then old else new end;
  shop_label text := public.notification_safe_label(c.shop_name_snapshot, 'The shop');
  repair boolean := coalesce(current_setting('washlink.worker_contract_write', true), '') is distinct from c.id::text;
  v public.contract_versions;
  event_id bigint;
  action text;
begin
  if tg_op = 'INSERT' then
    perform public.record_workforce_audit_event('worker_contract.created', 'worker_contract', new.id, new.owner_id,
      jsonb_build_object('contract_id', new.id, 'shop_id', new.shop_id, 'origin', new.origin, 'changed_by', public.worker_contract_changed_by()));
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event(
      case when old.sent_at is null and old.owner_id is not null and old.shop_id is not null and old.worker_id is not null
           then 'worker_contract.draft_discarded' else 'worker_contract.deleted' end,
      'worker_contract', old.id, coalesce(old.owner_id, old.worker_id),
      jsonb_build_object('contract_id', old.id, 'shop_id', old.shop_id, 'from_status', old.status, 'version_kind', 'initial',
        'deleted_by', case when old.worker_id is null then 'worker_account_deleted'
                           when old.owner_id is null or not exists (select 1 from public.profiles p where p.id = old.owner_id) then 'owner_account_deleted'
                           when old.shop_id is null or not exists (select 1 from public.shops s where s.id = old.shop_id) then 'shop_deleted'
                           else 'owner_discarded' end));
    return null;
  end if;
  if new.status is distinct from old.status then
    select * into v from public.contract_versions x where x.id = coalesce(old.pending_version_id, new.current_version_id, old.current_version_id);
    action := case new.status when 'sent_for_review' then 'worker_contract.sent' when 'withdrawn' then 'worker_contract.withdrawn'
                              when 'accepted' then 'worker_contract.accepted' when 'declined' then 'worker_contract.declined'
                              when 'active' then 'worker_contract.activated' when 'terminated' then 'worker_contract.terminated'
                              when 'expired' then 'worker_contract.expired' else 'worker_contract.status_changed' end;
    if new.status = 'sent_for_review' then
      select * into v from public.contract_versions x where x.id = new.pending_version_id;
    end if;
    event_id := public.record_workforce_audit_event(action, 'worker_contract', new.id, coalesce(new.owner_id, new.worker_id),
      jsonb_strip_nulls(jsonb_build_object('contract_id', new.id, 'version_id', v.id, 'version_number', v.version_number,
        'version_kind', v.kind, 'shop_id', new.shop_id, 'from_status', old.status, 'to_status', new.status,
        'flag_count', case when new.status = 'sent_for_review' then v.flag_count end,
        'classification_key', case when new.status in ('sent_for_review', 'accepted') then v.classification_key end,
        'party_role', case new.status when 'sent_for_review' then 'owner' when 'accepted' then 'worker' when 'declined' then 'worker' end,
        'ended_by', new.ended_by,
        'changed_by', case when repair then 'trusted_session' when new.status = 'expired' then 'system' else public.worker_contract_changed_by() end)));
    if not repair then
      case new.status
        when 'sent_for_review' then
          perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract offer',
            shop_label || ' sent you a contract draft to review. It applies only if you accept it.');
        when 'withdrawn' then
          perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract offer withdrawn', shop_label || ' withdrew a contract offer.');
        when 'accepted' then
          perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract accepted', 'A worker accepted your contract offer.');
        when 'declined' then
          perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract declined', 'A worker declined your contract offer.');
        when 'active' then
          perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract started', shop_label || ' recorded that your contract has started.');
        when 'terminated' then
          if new.ended_by = 'worker' then
            perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract ended', 'A worker ended a contract. Open it to see the reason.');
          else
            perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract ended', shop_label || ' ended a contract. Open it to see the reason.');
          end if;
        when 'expired' then
          perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract expired',
            'Your contract with ' || shop_label || ' reached its end date and has expired.');
          perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract expired', 'A contract reached its end date and has expired.');
        else
          null;
      end case;
    end if;
  end if;
  if (old.owner_removed_at is null and old.shop_removed_at is null and (new.owner_removed_at is not null or new.shop_removed_at is not null))
     or (old.worker_removed_at is null and new.worker_removed_at is not null) then
    event_id := public.record_workforce_audit_event('worker_contract.party_removed', 'worker_contract', new.id, coalesce(new.owner_id, new.worker_id),
      jsonb_build_object('contract_id', new.id, 'shop_id', new.shop_id, 'from_status', new.status,
        'removed_party', case when old.worker_removed_at is null and new.worker_removed_at is not null then 'worker'
                              when new.owner_removed_at is not null then 'owner' else 'shop' end,
        'changed_by', public.worker_contract_changed_by()));
    perform public.worker_contract_notify(case when old.worker_removed_at is null and new.worker_removed_at is not null then new.owner_id
                                               when new.sent_at is not null then new.worker_id end,
      new.id, event_id, 'Contract party left', 'A contract''s other party left WashLink. Your contract record is kept.');
  end if;
  return null;
end;
$$;

-- Amendment events (the initial version's events are the contract's own status changes).
create or replace function public.contract_versions_audit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.contract_versions := case when tg_op = 'DELETE' then old else new end;
  c public.worker_contracts;
  shop_label text;
  event_id bigint;
  payload jsonb;
begin
  if v.kind <> 'amendment' then
    return null;
  end if;
  select * into c from public.worker_contracts x where x.id = v.contract_id;
  if c.id is null then
    return null;   -- the contract itself was deleted (audited there)
  end if;
  shop_label := public.notification_safe_label(c.shop_name_snapshot, 'The shop');
  payload := jsonb_build_object('contract_id', c.id, 'version_id', v.id, 'version_number', v.version_number, 'version_kind', v.kind,
                                'shop_id', c.shop_id, 'changed_by', public.worker_contract_changed_by());
  if tg_op = 'INSERT' then
    perform public.record_workforce_audit_event('worker_contract.amendment_created', 'worker_contract', c.id, coalesce(c.owner_id, c.worker_id), payload);
  elsif tg_op = 'DELETE' then
    perform public.record_workforce_audit_event('worker_contract.draft_discarded', 'worker_contract', c.id, coalesce(c.owner_id, c.worker_id),
      payload || jsonb_build_object('deleted_by', case when auth.uid() is not null and auth.uid() = c.owner_id then 'owner_discarded' else 'system' end));
  elsif new.state is distinct from old.state and new.state in ('sent_for_review', 'accepted', 'declined', 'withdrawn') then
    event_id := public.record_workforce_audit_event('worker_contract.' || case new.state when 'sent_for_review' then 'sent' else new.state end,
      'worker_contract', c.id, coalesce(c.owner_id, c.worker_id),
      payload || jsonb_build_object('from_status', old.state, 'to_status', new.state)
              || case new.state when 'sent_for_review' then jsonb_build_object('flag_count', new.flag_count, 'classification_key',
                                                                               new.classification_key, 'party_role', 'owner')
                                when 'withdrawn' then '{}'::jsonb else jsonb_build_object('party_role', 'worker') end);
    if new.state = 'sent_for_review' then
      perform public.worker_contract_notify(c.worker_id, c.id, event_id, 'Contract change proposed',
        shop_label || ' proposed a change to your contract. Your current terms stay until you accept it.');
    elsif new.state = 'accepted' then
      perform public.worker_contract_notify(c.owner_id, c.id, event_id, 'Contract change accepted', 'A worker accepted your proposed contract change.');
    elsif new.state = 'declined' then
      perform public.worker_contract_notify(c.owner_id, c.id, event_id, 'Contract change declined', 'A worker declined your proposed contract change.');
    elsif auth.uid() is not null and auth.uid() = c.owner_id
          and coalesce(current_setting('washlink.worker_contract_closing', true), '') is distinct from c.id::text then
      perform public.worker_contract_notify(c.worker_id, c.id, event_id, 'Contract change withdrawn',
        shop_label || ' withdrew a proposed contract change. Your current terms stay.');
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.retained_job_application_records_audit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.record_workforce_audit_event('job_application_record.retained', 'job_application_record', new.application_id, new.worker_id,
    jsonb_build_object('application_id', new.application_id, 'record_id', new.id, 'removal_reason', new.removal_reason));
  return null;
end;
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array['worker_contract_changed_by()', 'worker_contract_notify(uuid, uuid, bigint, text, text)', 'worker_contracts_audit()',
    'contract_versions_audit()', 'retained_job_application_records_audit()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', sig);
  end loop;
end $$;

drop trigger if exists worker_contracts_audit on public.worker_contracts;
create trigger worker_contracts_audit after insert or update or delete on public.worker_contracts
  for each row execute function public.worker_contracts_audit();
drop trigger if exists contract_versions_audit on public.contract_versions;
create trigger contract_versions_audit after insert or update or delete on public.contract_versions
  for each row execute function public.contract_versions_audit();
drop trigger if exists retained_job_application_records_audit on public.retained_job_application_records;
create trigger retained_job_application_records_audit after insert on public.retained_job_application_records
  for each row execute function public.retained_job_application_records_audit();

-- Mark every W9 function with a `W9` comment; the w9a preflight refuses W9-named objects without one. A missing W9
-- function aborts here.
do $$
declare
  fn text;
  fn_oid oid;
begin
  foreach fn in array array['worker_contract_reference_guard_write', 'contract_problem_term_matches', 'worker_contract_check_owner_text',
    'worker_contract_checked_owner_values', 'worker_contracts_guard_write', 'contract_versions_guard_write',
    'contract_version_records_guard_write', 'contract_acceptances_guard_write', 'worker_contract_eligibility', 'worker_contract_draft_clauses',
    'worker_contract_safe_value', 'worker_contract_render_values', 'worker_contract_rendered_clauses', 'worker_contract_unfilled',
    'worker_contract_build_text', 'worker_contract_live_flags', 'worker_contract_seal_version', 'validate_worker_contract_version',
    'contract_versions_validate_at_commit', 'worker_contract_effective_status', 'worker_contract_party_name', 'worker_contract_lock_for_owner',
    'worker_contract_pick_template_version', 'worker_contract_check_terms', 'create_worker_contract_draft', 'save_worker_contract_draft',
    'send_worker_contract_version', 'withdraw_worker_contract_version', 'worker_contract_lock_for_worker', 'worker_contract_close_open_versions',
    'discard_worker_contract_draft', 'create_worker_contract_amendment', 'activate_worker_contract', 'accept_worker_contract_version',
    'decline_worker_contract_version', 'terminate_worker_contract', 'expire_worker_contracts', 'owner_worker_contracts', 'my_worker_contracts',
    'owner_contract_eligible_workers', 'worker_contract_versions', 'worker_contract_version_document', 'worker_contract_version_clauses',
    'worker_contract_flag_notices', 'worker_contract_version_flags', 'worker_contract_version_changes', 'worker_contract_acceptances',
    'preview_worker_contract_draft', 'worker_contracts_retention', 'retained_job_application_records_guard_write',
    'job_applications_retain_accepted', 'my_retained_application_records', 'worker_contract_changed_by', 'worker_contract_notify',
    'worker_contracts_audit', 'contract_versions_audit', 'retained_job_application_records_audit'] loop
    fn_oid := to_regproc('public.' || fn)::oid;
    if fn_oid is null then
      raise exception 'W9j: missing W9 function %', fn;
    end if;
    execute format('comment on function %s is %L', fn_oid::regprocedure, 'W9: worker contracts (created by the W9 migrations).');
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W9 rollbacks in reverse order j..a). Audit rows and notifications stay.
-- -------------------------------------------------------------
-- drop trigger if exists retained_job_application_records_audit on public.retained_job_application_records;
-- drop trigger if exists contract_versions_audit on public.contract_versions;
-- drop trigger if exists worker_contracts_audit on public.worker_contracts;
-- drop function if exists public.retained_job_application_records_audit(), public.contract_versions_audit(), public.worker_contracts_audit(),
--   public.worker_contract_notify(uuid, uuid, bigint, text, text), public.worker_contract_changed_by();
-- (the W9 function comments go with their functions in the w9i..w9b rollbacks)
