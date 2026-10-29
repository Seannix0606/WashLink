-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W14 job opening moderation and unreviewed approved shops. Seeded AFTER
-- test_helpers_oversight.sql (seventh sql_paths entry of the staged .local-supabase-test workdir only). Same rules as
-- test_helpers.sql: SECURITY INVOKER, transaction-local identity switching, fixtures must start in a trusted session
-- (test_helpers.act_as_service()) and END in one. Reports go through the REAL report_job_opening RPC acting as the worker.
-- No helper inserts a moderation case, report, action or access record. make_test_shop_legacy_unreviewed is a TEST-ONLY
-- trusted update reproducing a pre-W2 production row (approved without a recorded review, D-10 row 14).

-- As the worker (email), reports a job opening (real report_job_opening). Returns the report id.
create or replace function test_helpers.report_test_job_opening(p_opening uuid, p_worker_email text, p_category text default 'age_requirement',
                                                                p_statement text default 'This local test posting asks for an age limit')
returns uuid language plpgsql security invoker as $$
declare
  report_id uuid;
begin
  perform test_helpers.assert_service_session();
  perform test_helpers.act_as_worker(p_worker_email);
  select r.report_id into report_id from public.report_job_opening(p_opening, p_category, p_statement) r;
  perform test_helpers.act_as_service();
  return report_id;
end $$;

-- TEST-ONLY: an approved shop as a pre-W2 production row: reviewer and review time nulled (or only the review time when
-- p_keep_reviewer). Trusted session: the W2b guard lets trusted repairs through; the W3 audit does not fire (status
-- unchanged).
create or replace function test_helpers.make_test_shop_legacy_unreviewed(p_shop uuid, p_keep_reviewer boolean default false)
returns uuid language plpgsql security invoker as $$
begin
  perform test_helpers.assert_service_session();
  update public.shops
  set verification_status = 'approved',
      verification_reviewed_by = case when p_keep_reviewer then verification_reviewed_by end,
      verification_reviewed_at = null
  where id = p_shop;
  if not found then
    raise exception 'test_helpers.make_test_shop_legacy_unreviewed: no shop %', p_shop;
  end if;
  return p_shop;
end $$;

-- Removes an administrator account through the real auth.users -> profiles cascade (FK set null on every reference).
create or replace function test_helpers.delete_test_admin_profile(p_admin uuid)
returns uuid language plpgsql security invoker as $$
begin
  perform test_helpers.assert_service_session();
  delete from auth.users where id = p_admin;
  if not found then
    raise exception 'test_helpers.delete_test_admin_profile: no auth user %', p_admin;
  end if;
  return p_admin;
end $$;

-- TEST-ONLY time shift: moves a moderation case's opened / status_changed / created / updated stamps and its opening's
-- updated_at p_minutes into the past (as if the WashLink decision was taken earlier; pgTAP runs in one transaction where
-- now() is constant). The W14 case guard and the W4 normalize trigger refuse / re-stamp this for every session, so the
-- fixture disables them for the one statement (superuser, inside the test transaction) and re-enables them.
create or replace function test_helpers.backdate_test_moderation_case(p_case uuid, p_minutes integer default 60)
returns uuid language plpgsql security invoker as $$
declare
  shift interval := make_interval(mins => p_minutes);
begin
  perform test_helpers.assert_service_session();
  alter table public.job_opening_moderation_cases disable trigger job_opening_moderation_cases_guard_write;
  update public.job_opening_moderation_cases
  set opened_at = opened_at - shift, status_changed_at = status_changed_at - shift, created_at = created_at - shift, updated_at = updated_at - shift
  where id = p_case;
  alter table public.job_opening_moderation_cases enable trigger job_opening_moderation_cases_guard_write;
  alter table public.job_openings disable trigger job_openings_normalize;
  update public.job_openings set updated_at = updated_at - shift
  where id = (select c.job_opening_id from public.job_opening_moderation_cases c where c.id = p_case);
  alter table public.job_openings enable trigger job_openings_normalize;
  return p_case;
end $$;

-- TEST-ONLY time shift for the N6 flag: moves a reported contract problem's created_at p_days into the past (technique of
-- test_helpers.backdate_shop_review_request; the W11 guard refuses this for every session).
create or replace function test_helpers.backdate_test_contract_dispute(p_dispute uuid, p_days integer)
returns uuid language plpgsql security invoker as $$
begin
  perform test_helpers.assert_service_session();
  alter table public.worker_contract_disputes disable trigger worker_contract_disputes_guard_write;
  update public.worker_contract_disputes set created_at = created_at - make_interval(days => p_days) where id = p_dispute;
  alter table public.worker_contract_disputes enable trigger worker_contract_disputes_guard_write;
  return p_dispute;
end $$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.backdate_test_contract_dispute(uuid, integer);
-- drop function if exists test_helpers.backdate_test_moderation_case(uuid, integer);
-- drop function if exists test_helpers.delete_test_admin_profile(uuid);
-- drop function if exists test_helpers.make_test_shop_legacy_unreviewed(uuid, boolean);
-- drop function if exists test_helpers.report_test_job_opening(uuid, text, text, text);
