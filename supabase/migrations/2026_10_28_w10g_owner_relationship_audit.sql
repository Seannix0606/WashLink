-- =============================================================
-- WashLink W10g - owner relationship audit producer, backfill and W10 function markers (W10 PLAN 3.7, P62; W3
-- rules; D-39). Requires w3b, w9j, w10c..w10f. Idempotent.
-- subject_type `worker_owner_relationship`, subject_id = relationship id, subject_profile_id = worker_id. Actions:
-- worker_owner_relationship.created, .status_changed, .owner_removed, .deleted. Payloads carry ids, status / reason
-- words, counts_toward_goal, qualifying_contract_count and changed_by only: never names, free text, dates or another
-- owner's ids. A refresh that leaves status, reason and count unchanged writes no row, so it writes no audit event.
-- No notifications (D-39: contract events already notify; W12 decides).
-- Backfill: every (worker, owner) pair with an accepted contract is derived once (audited as trusted_session).
-- =============================================================

create or replace function public.worker_owner_relationships_audit()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_workforce_audit_event('worker_owner_relationship.created', 'worker_owner_relationship', new.id, new.worker_id,
      jsonb_build_object('relationship_id', new.id, 'worker_id', new.worker_id, 'owner_id', new.owner_id, 'to_status', new.status,
                         'status_reason', new.status_reason, 'counts_toward_goal', new.status = 'active',
                         'qualifying_contract_count', new.qualifying_contract_count, 'changed_by', public.worker_contract_changed_by()));
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.record_workforce_audit_event('worker_owner_relationship.deleted', 'worker_owner_relationship', old.id, old.worker_id,
      jsonb_build_object('relationship_id', old.id, 'worker_id', old.worker_id, 'owner_id', old.owner_id, 'from_status', old.status,
                         'deleted_by', 'worker_account_deleted'));
    return null;
  end if;
  if (new.status, new.status_reason, new.qualifying_contract_count) is distinct from (old.status, old.status_reason, old.qualifying_contract_count) then
    perform public.record_workforce_audit_event(
      case when new.status = 'owner_removed' then 'worker_owner_relationship.owner_removed' else 'worker_owner_relationship.status_changed' end,
      'worker_owner_relationship', new.id, new.worker_id,
      jsonb_build_object('relationship_id', new.id, 'worker_id', new.worker_id, 'owner_id', new.owner_id, 'from_status', old.status,
                         'to_status', new.status, 'status_reason', new.status_reason, 'counts_toward_goal', new.status = 'active',
                         'qualifying_contract_count', new.qualifying_contract_count, 'changed_by', public.worker_contract_changed_by()));
  end if;
  return null;
end;
$$;

revoke all on function public.worker_owner_relationships_audit() from public, anon, authenticated, service_role;
drop trigger if exists worker_owner_relationships_audit on public.worker_owner_relationships;
create trigger worker_owner_relationships_audit
  after insert or update or delete on public.worker_owner_relationships
  for each row execute function public.worker_owner_relationships_audit();

-- Backfill from existing contracts (runs as the migration's trusted session; never fabricates: derived only).
do $$
declare
  pair record;
begin
  for pair in select distinct c.worker_id, c.owner_id from public.worker_contracts c
              where c.accepted_at is not null and c.worker_id is not null and c.owner_id is not null
              order by c.worker_id, c.owner_id loop
    perform public.refresh_worker_owner_relationship(pair.worker_id, pair.owner_id);
  end loop;
end $$;

-- Mark every W10 function with a `W10` comment (the w10a preflight refuses W10-named objects without one). A missing
-- W10 function aborts here. worker_contracts_guard_write keeps its W9 marker (w10b).
do $$
declare
  fn text;
  fn_oid oid;
begin
  foreach fn in array array['workforce_policies_guard_write', 'set_workforce_policy_value', 'workforce_policies_audit',
    'worker_owner_relationships_guard_write', 'worker_contract_qualifies', 'worker_distinct_qualifying_owner_count',
    'worker_owner_relationship_derive', 'refresh_worker_owner_relationship', 'refresh_worker_owner_relationships',
    'worker_contracts_sync_owner_relationship', 'shops_sync_owner_relationships', 'profiles_sync_owner_relationships',
    'my_owner_relationship_progress', 'my_owner_relationships', 'owner_worker_relationships', 'worker_owner_relationships_audit'] loop
    fn_oid := to_regproc('public.' || fn)::oid;
    if fn_oid is null then
      raise exception 'W10g: missing W10 function %', fn;
    end if;
    execute format('comment on function %s is %L', fn_oid::regprocedure,
                   'W10: owner relationships and workforce policies (created by the W10 migrations).');
  end loop;
end $$;

notify pgrst, 'reload schema';

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only; apply W10 rollbacks in reverse order g..a). Audit rows stay. The W10 function
-- comments go with their functions in the w10f..w10c rollbacks; backfilled rows go with the w10d table.
-- -------------------------------------------------------------
-- drop trigger if exists worker_owner_relationships_audit on public.worker_owner_relationships;
-- drop function if exists public.worker_owner_relationships_audit();
