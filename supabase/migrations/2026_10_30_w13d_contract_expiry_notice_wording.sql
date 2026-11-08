-- =============================================================
-- WashLink W13d - contract expiry notice wording (W13 PLAN 3.4; D-72; closes W12 C2 / W12-L9). Requires w9j, w12e,
-- w13a (which refuses to run unless md5(prosrc) is the exact w9j or w13d body, D-10). Idempotent.
-- worker_contracts_audit() is the w9j body (w9j lines 30-116) BYTE-IDENTICAL except the two `expired` notice bodies:
--   worker  'Your contract with <shop> reached the end date written in it, so WashLink now shows it as expired. What this
--           means for your work depends on the contract terms and the law.'
--   owner   'A contract reached the end date written in it, so WashLink now shows it as expired. What this means for
--           you and the worker depends on the contract terms and the law.'   (fix cycle 1, W13 C2 / W13-L8)
-- The notice title 'Contract expired' (a notice title only; the UI status label is "Past end date", W13 C4),
-- the category, the idempotency key, the registry row, the audit payload, the line layout and every other branch are
-- unchanged. Notices already sent keep their text (true records). This is the only function body W13 replaces.
-- Same trigger, same revokes; the W9 comment marker is kept (j17_w9 / j16 count it as a W9 function) and
-- `W13: expiry notice wording (D-72).` is appended.
-- =============================================================

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
            'Your contract with ' || shop_label || ' reached the end date written in it, so WashLink now shows it as expired. What this means for your work depends on the contract terms and the law.');
          perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract expired', 'A contract reached the end date written in it, so WashLink now shows it as expired. What this means for you and the worker depends on the contract terms and the law.');
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

revoke all on function public.worker_contracts_audit() from public, anon, authenticated, service_role;
comment on function public.worker_contracts_audit() is
  'W9: worker contracts (created by the W9 migrations). W13: expiry notice wording (D-72).';
-- The w9j trigger (after insert or update or delete, for each row) is unchanged and keeps calling this function.

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W13 rollbacks in reverse order d..a). Notices already sent with the W13 wording
-- stay. Re-create the complete w9j body (w9j lines 30-116, verbatim; the first line is split after `create or replace` only
-- so this file holds a single live definition) and comment:
-- -------------------------------------------------------------
-- create or replace
-- function public.worker_contracts_audit()
-- returns trigger
-- language plpgsql security definer set search_path = public, pg_temp as $$
-- declare
--   c public.worker_contracts := case when tg_op = 'DELETE' then old else new end;
--   shop_label text := public.notification_safe_label(c.shop_name_snapshot, 'The shop');
--   repair boolean := coalesce(current_setting('washlink.worker_contract_write', true), '') is distinct from c.id::text;
--   v public.contract_versions;
--   event_id bigint;
--   action text;
-- begin
--   if tg_op = 'INSERT' then
--     perform public.record_workforce_audit_event('worker_contract.created', 'worker_contract', new.id, new.owner_id,
--       jsonb_build_object('contract_id', new.id, 'shop_id', new.shop_id, 'origin', new.origin, 'changed_by', public.worker_contract_changed_by()));
--     return null;
--   end if;
--   if tg_op = 'DELETE' then
--     perform public.record_workforce_audit_event(
--       case when old.sent_at is null and old.owner_id is not null and old.shop_id is not null and old.worker_id is not null
--            then 'worker_contract.draft_discarded' else 'worker_contract.deleted' end,
--       'worker_contract', old.id, coalesce(old.owner_id, old.worker_id),
--       jsonb_build_object('contract_id', old.id, 'shop_id', old.shop_id, 'from_status', old.status, 'version_kind', 'initial',
--         'deleted_by', case when old.worker_id is null then 'worker_account_deleted'
--                            when old.owner_id is null or not exists (select 1 from public.profiles p where p.id = old.owner_id) then 'owner_account_deleted'
--                            when old.shop_id is null or not exists (select 1 from public.shops s where s.id = old.shop_id) then 'shop_deleted'
--                            else 'owner_discarded' end));
--     return null;
--   end if;
--   if new.status is distinct from old.status then
--     select * into v from public.contract_versions x where x.id = coalesce(old.pending_version_id, new.current_version_id, old.current_version_id);
--     action := case new.status when 'sent_for_review' then 'worker_contract.sent' when 'withdrawn' then 'worker_contract.withdrawn'
--                               when 'accepted' then 'worker_contract.accepted' when 'declined' then 'worker_contract.declined'
--                               when 'active' then 'worker_contract.activated' when 'terminated' then 'worker_contract.terminated'
--                               when 'expired' then 'worker_contract.expired' else 'worker_contract.status_changed' end;
--     if new.status = 'sent_for_review' then
--       select * into v from public.contract_versions x where x.id = new.pending_version_id;
--     end if;
--     event_id := public.record_workforce_audit_event(action, 'worker_contract', new.id, coalesce(new.owner_id, new.worker_id),
--       jsonb_strip_nulls(jsonb_build_object('contract_id', new.id, 'version_id', v.id, 'version_number', v.version_number,
--         'version_kind', v.kind, 'shop_id', new.shop_id, 'from_status', old.status, 'to_status', new.status,
--         'flag_count', case when new.status = 'sent_for_review' then v.flag_count end,
--         'classification_key', case when new.status in ('sent_for_review', 'accepted') then v.classification_key end,
--         'party_role', case new.status when 'sent_for_review' then 'owner' when 'accepted' then 'worker' when 'declined' then 'worker' end,
--         'ended_by', new.ended_by,
--         'changed_by', case when repair then 'trusted_session' when new.status = 'expired' then 'system' else public.worker_contract_changed_by() end)));
--     if not repair then
--       case new.status
--         when 'sent_for_review' then
--           perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract offer',
--             shop_label || ' sent you a contract draft to review. It applies only if you accept it.');
--         when 'withdrawn' then
--           perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract offer withdrawn', shop_label || ' withdrew a contract offer.');
--         when 'accepted' then
--           perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract accepted', 'A worker accepted your contract offer.');
--         when 'declined' then
--           perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract declined', 'A worker declined your contract offer.');
--         when 'active' then
--           perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract started', shop_label || ' recorded that your contract has started.');
--         when 'terminated' then
--           if new.ended_by = 'worker' then
--             perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract ended', 'A worker ended a contract. Open it to see the reason.');
--           else
--             perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract ended', shop_label || ' ended a contract. Open it to see the reason.');
--           end if;
--         when 'expired' then
--           perform public.worker_contract_notify(new.worker_id, new.id, event_id, 'Contract expired',
--             'Your contract with ' || shop_label || ' reached its end date and has expired.');
--           perform public.worker_contract_notify(new.owner_id, new.id, event_id, 'Contract expired', 'A contract reached its end date and has expired.');
--         else
--           null;
--       end case;
--     end if;
--   end if;
--   if (old.owner_removed_at is null and old.shop_removed_at is null and (new.owner_removed_at is not null or new.shop_removed_at is not null))
--      or (old.worker_removed_at is null and new.worker_removed_at is not null) then
--     event_id := public.record_workforce_audit_event('worker_contract.party_removed', 'worker_contract', new.id, coalesce(new.owner_id, new.worker_id),
--       jsonb_build_object('contract_id', new.id, 'shop_id', new.shop_id, 'from_status', new.status,
--         'removed_party', case when old.worker_removed_at is null and new.worker_removed_at is not null then 'worker'
--                               when new.owner_removed_at is not null then 'owner' else 'shop' end,
--         'changed_by', public.worker_contract_changed_by()));
--     perform public.worker_contract_notify(case when old.worker_removed_at is null and new.worker_removed_at is not null then new.owner_id
--                                                when new.sent_at is not null then new.worker_id end,
--       new.id, event_id, 'Contract party left', 'A contract''s other party left WashLink. Your contract record is kept.');
--   end if;
--   return null;
-- end;
-- $$;
-- revoke all on function public.worker_contracts_audit() from public, anon, authenticated, service_role;
-- comment on function public.worker_contracts_audit() is 'W9: worker contracts (created by the W9 migrations).';
