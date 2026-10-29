-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W11 WashLink certification reviews and reported contract problems. Seeded AFTER
-- test_helpers_owner_relationships.sql (sixth sql_paths entry of the staged .local-supabase-test workdir only). Same
-- rules as test_helpers.sql: SECURITY INVOKER, transaction-local identity switching, fixtures must start in a trusted
-- session (test_helpers.act_as_service()) and END in one. Suspensions, shop review requests and disputes go through the
-- REAL W7 / W11 RPCs acting as the owner or the worker. No helper inserts a WashLink review, a dispute, a status event or
-- an acceptance. test_helpers.backdate_shop_review_request is a TEST-ONLY time shift (technique of
-- test_helpers.backdate_certification).

-- As the issuing owner (email), suspends an active certificate with p_reason (real transition_certification).
create or replace function test_helpers.suspend_test_certification(p_certification uuid, p_owner_email text,
                                                                   p_reason text default 'Suspended while a local test complaint is checked')
returns uuid language plpgsql security invoker as $$
begin
  perform test_helpers.assert_service_session();
  perform test_helpers.act_as_owner(p_owner_email);
  perform public.transition_certification(p_certification, 'active', 'suspended', p_reason);
  perform test_helpers.act_as_service();
  return p_certification;
end $$;

-- As the certificate worker (email), asks the issuing shop to review the decision (real request_certification_review).
-- Returns the shop review request id.
create or replace function test_helpers.request_test_shop_review(p_certification uuid, p_worker_email text,
                                                                 p_statement text default 'Please review this local test decision again')
returns uuid language plpgsql security invoker as $$
declare
  request_id uuid;
begin
  perform test_helpers.assert_service_session();
  perform test_helpers.act_as_worker(p_worker_email);
  request_id := (public.request_certification_review(p_certification, p_statement)).id;
  perform test_helpers.act_as_service();
  return request_id;
end $$;

-- TEST-ONLY time shift: moves a shop review request's requested / decided / withdrawn / created stamps p_days into the
-- past. The W7 guard refuses this for every session, so the fixture disables it for the one statement (superuser,
-- inside the test transaction) and re-enables it.
create or replace function test_helpers.backdate_shop_review_request(p_request uuid, p_days integer)
returns uuid language plpgsql security invoker as $$
declare
  shift interval := make_interval(days => p_days);
begin
  perform test_helpers.assert_service_session();
  alter table public.certification_review_requests disable trigger certification_review_requests_guard_write;
  update public.certification_review_requests
  set requested_at = requested_at - shift, decided_at = decided_at - shift, withdrawn_at = withdrawn_at - shift,
      created_at = created_at - shift
  where id = p_request;
  alter table public.certification_review_requests enable trigger certification_review_requests_guard_write;
  return p_request;
end $$;

-- As the party (email; role worker or owner from the profile), reports a contract problem (real raise_contract_dispute).
-- Returns the dispute id.
create or replace function test_helpers.raise_test_contract_dispute(p_contract uuid, p_email text, p_category text default 'contract_terms',
                                                                    p_statement text default 'The local test contract terms need a closer look')
returns uuid language plpgsql security invoker as $$
declare
  party_role text;
  dispute_id uuid;
begin
  perform test_helpers.assert_service_session();
  select p.role::text into strict party_role from auth.users u join public.profiles p on p.id = u.id where u.email = lower(p_email);
  perform test_helpers.act_as_role(p_email, party_role);
  dispute_id := (public.raise_contract_dispute(p_contract, p_category, p_statement)).id;
  perform test_helpers.act_as_service();
  return dispute_id;
end $$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.raise_test_contract_dispute(uuid, text, text, text);
-- drop function if exists test_helpers.backdate_shop_review_request(uuid, integer);
-- drop function if exists test_helpers.request_test_shop_review(uuid, text, text);
-- drop function if exists test_helpers.suspend_test_certification(uuid, text, text);
