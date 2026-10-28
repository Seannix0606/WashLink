-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W10 owner relationships. Seeded AFTER test_helpers_worker_contracts.sql (fifth sql_paths
-- entry of the staged .local-supabase-test workdir only). Same rules as test_helpers.sql: SECURITY INVOKER,
-- transaction-local identity switching, fixtures must start in a trusted session (test_helpers.act_as_service())
-- and END in one. Contracts are created, accepted and started through the REAL W9 RPCs acting as the owner or the
-- worker. No helper inserts a relationship, a policy or an acceptance (relationships come from the w10e sync triggers).

-- A trusted accepted application of p_worker at p_shop, then (real RPCs) draft, fill, optional end date, send and the
-- worker's acceptance. Starts today (Manila). Returns the contract id.
create or replace function test_helpers.create_accepted_test_contract(p_owner_email text, p_shop uuid, p_worker uuid, p_worker_email text,
                                                                      p_end_date date default null)
returns uuid language plpgsql security invoker as $$
declare
  new_contract uuid;
  v public.contract_versions;
begin
  perform test_helpers.assert_service_session();
  perform test_helpers.create_accepted_application(p_shop, p_worker);
  new_contract := test_helpers.create_test_contract_draft(p_owner_email, p_shop, p_worker);
  perform test_helpers.fill_test_contract_draft(new_contract, p_owner_email);
  if p_end_date is not null then
    select * into strict v from public.contract_versions x where x.contract_id = new_contract and x.state = 'draft';
    perform test_helpers.act_as_owner(p_owner_email);
    perform public.save_worker_contract_draft(new_contract, v.draft_revision, v.classification_key, v.start_date, p_end_date,
                                              v.owner_values, v.editable_bodies, v.shop_terms);
    perform test_helpers.act_as_service();
  end if;
  perform test_helpers.send_test_contract(new_contract, p_owner_email);
  perform test_helpers.accept_test_contract(new_contract, p_worker_email);
  return new_contract;
end $$;

-- Same, then the owner records the start (real activate RPC). Returns the contract id.
create or replace function test_helpers.create_active_test_contract(p_owner_email text, p_shop uuid, p_worker uuid, p_worker_email text,
                                                                    p_end_date date default null)
returns uuid language plpgsql security invoker as $$
declare
  new_contract uuid := test_helpers.create_accepted_test_contract(p_owner_email, p_shop, p_worker, p_worker_email, p_end_date);
  current_revision integer;
begin
  select c.revision into strict current_revision from public.worker_contracts c where c.id = new_contract;
  perform test_helpers.act_as_owner(p_owner_email);
  perform public.activate_worker_contract(new_contract, current_revision);
  perform test_helpers.act_as_service();
  return new_contract;
end $$;

-- Stored relationship of the pair as 'status,reason,count' ('none' when no row). Trusted session only.
create or replace function test_helpers.relationship_row(p_worker uuid, p_owner uuid)
returns text language sql stable security invoker as $$
  select coalesce((select r.status || ',' || r.status_reason || ',' || r.qualifying_contract_count from public.worker_owner_relationships r
                   where r.worker_id = p_worker and r.owner_id is not distinct from p_owner order by r.created_at limit 1), 'none');
$$;

-- Live derivation of the pair (as of p_as_of, default Manila today) in the same shape ('none' without an accepted
-- contract). Trusted session only (the derivation is internal).
create or replace function test_helpers.relationship_live(p_worker uuid, p_owner uuid, p_as_of date default null)
returns text language sql stable security invoker as $$
  select case when d.has_accepted_contract then d.status || ',' || d.status_reason || ',' || d.qualifying_contract_count else 'none' end
  from public.worker_owner_relationship_derive(p_worker, p_owner, p_as_of) d;
$$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.relationship_live(uuid, uuid, date);
-- drop function if exists test_helpers.relationship_row(uuid, uuid);
-- drop function if exists test_helpers.create_active_test_contract(text, uuid, uuid, text, date);
-- drop function if exists test_helpers.create_accepted_test_contract(text, uuid, uuid, text, date);
