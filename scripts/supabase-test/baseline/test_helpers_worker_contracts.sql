-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W9 worker contracts. Seeded AFTER test_helpers_contract_templates.sql (fourth sql_paths
-- entry of the staged .local-supabase-test workdir only). Same rules as test_helpers.sql: SECURITY INVOKER,
-- transaction-local identity switching, fixtures must start in a trusted session (test_helpers.act_as_service())
-- and END in one. Contracts, versions and acceptances are created through the REAL W9 RPCs acting as the owner or the
-- worker (P47: no acceptance is ever inserted by a fixture).

-- Trusted fixture: an accepted application of p_worker at p_shop (opening published by the trusted helper).
create or replace function test_helpers.create_accepted_application(p_shop uuid, p_worker uuid)
returns uuid language plpgsql security invoker as $$
declare
  opening_id uuid;
begin
  perform test_helpers.assert_service_session();
  opening_id := test_helpers.publish_job_opening(test_helpers.create_job_opening(p_shop, 'Local test washer'));
  return test_helpers.create_job_application(opening_id, p_worker, 'accepted');
end $$;

-- As the owner (email), drafts a contract for p_worker at p_shop from p_template_version (null = the latest standard
-- version), starting today (Manila). Returns the contract id.
create or replace function test_helpers.create_test_contract_draft(p_owner_email text, p_shop uuid, p_worker uuid,
                                                                   p_template_version uuid default null, p_classification text default 'employee')
returns uuid language plpgsql security invoker as $$
declare
  template_version uuid := coalesce(p_template_version, test_helpers.latest_platform_contract_version());
  contract_id uuid;
begin
  perform test_helpers.assert_service_session();
  perform test_helpers.act_as_owner(p_owner_email);
  contract_id := (public.create_worker_contract_draft(p_shop, p_worker, template_version, p_classification, test_helpers.manila_today(),
                                                      null, '{}'::jsonb)).id;
  perform test_helpers.act_as_service();
  return contract_id;
end $$;

-- As the owner, fills every editable clause of the open draft (neutral text, no keyword matches) plus p_bodies
-- overrides (a JSON null keeps the template body), the three contract details (+ p_values) and p_terms (null = keep
-- the current shop terms). Returns the draft version id.
create or replace function test_helpers.fill_test_contract_draft(p_contract uuid, p_owner_email text, p_bodies jsonb default '{}'::jsonb,
                                                                 p_terms jsonb default null, p_values jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker as $$
declare
  v public.contract_versions;
  bodies jsonb;
begin
  perform test_helpers.assert_service_session();
  select * into strict v from public.contract_versions where contract_id = p_contract and state = 'draft';
  select jsonb_strip_nulls(coalesce(jsonb_object_agg(c.clause_key, 'The shop and the worker agree to this local test clause.'), '{}'::jsonb)
                           || coalesce(p_bodies, '{}'::jsonb))
  into bodies
  from public.contract_template_clauses c where c.version_id = v.base_platform_version_id and c.kind = 'editable';
  perform test_helpers.act_as_owner(p_owner_email);
  v := public.save_worker_contract_draft(p_contract, v.draft_revision, v.classification_key, v.start_date, v.end_date,
         jsonb_build_object('role_title', 'Car wash attendant', 'schedule_summary', 'Weekdays from morning to afternoon',
                            'pay_details', 'Pay as agreed in writing by both parties') || coalesce(p_values, '{}'::jsonb),
         bodies, coalesce(p_terms, v.shop_terms));
  perform test_helpers.act_as_service();
  return v.id;
end $$;

-- As the owner, sends the open draft with the statement, the contractor acknowledgement when needed and the current
-- live flag count. Returns the sealed version id.
create or replace function test_helpers.send_test_contract(p_contract uuid, p_owner_email text)
returns uuid language plpgsql security invoker as $$
declare
  v public.contract_versions;
  needs_extra boolean;
  flag_total integer;
begin
  perform test_helpers.assert_service_session();
  select * into strict v from public.contract_versions where contract_id = p_contract and state = 'draft';
  select o.needs_extra_acknowledgement into needs_extra from public.worker_classification_options o where o.classification_key = v.classification_key;
  select count(*) into flag_total from public.worker_contract_live_flags(v.id);
  perform test_helpers.act_as_owner(p_owner_email);
  v := public.send_worker_contract_version(p_contract, v.draft_revision, 'w9_owner_send_v1',
                                           case when needs_extra then 'w9_contractor_owner_v1' end, flag_total);
  perform test_helpers.act_as_service();
  return v.id;
end $$;

-- As the worker, accepts the pending sent version with its hash and the required statements. Returns the version id.
create or replace function test_helpers.accept_test_contract(p_contract uuid, p_worker_email text)
returns uuid language plpgsql security invoker as $$
declare
  v public.contract_versions;
  needs_extra boolean;
begin
  perform test_helpers.assert_service_session();
  select v2.* into strict v from public.contract_versions v2 join public.worker_contracts c on c.pending_version_id = v2.id where c.id = p_contract;
  select o.needs_extra_acknowledgement into needs_extra from public.worker_classification_options o where o.classification_key = v.classification_key;
  perform test_helpers.act_as_worker(p_worker_email);
  perform public.accept_worker_contract_version(p_contract, v.id, v.content_hash, 'w9_worker_accept_v1',
                                                case when needs_extra then 'w9_contractor_worker_v1' end);
  perform test_helpers.act_as_service();
  return v.id;
end $$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.accept_test_contract(uuid, text);
-- drop function if exists test_helpers.send_test_contract(uuid, text);
-- drop function if exists test_helpers.fill_test_contract_draft(uuid, text, jsonb, jsonb, jsonb);
-- drop function if exists test_helpers.create_test_contract_draft(text, uuid, uuid, uuid, text);
-- drop function if exists test_helpers.create_accepted_application(uuid, uuid);
