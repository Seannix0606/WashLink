-- J16 (W11): reported contract problems and WashLink reviews never change contracts and never block a worker's decline
-- or termination (D-47; W11 PLAN P69). With an open dispute the worker still declines, accepts and terminates and the
-- owner still activates and terminates; closing a dispute (after case and document reads) leaves the contract, its
-- versions and acceptances byte-identical; no W11 function writes a contract table; the W9 / W7 RPCs never reference
-- the W11 tables. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j16d-a1@local.test')::text, true);
create temporary table j16d_ids (label text primary key, id uuid) on commit drop;
grant all on j16d_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j16d_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.status(p_label text) returns text language sql stable security definer
as $$ select status from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.pending(p_label text) returns uuid language sql stable security definer
as $$ select pending_version_id from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.contract_md5(p_label text) returns text language sql stable security definer as $$
  select md5(coalesce((select to_jsonb(c)::text from public.worker_contracts c where c.id = pg_temp.id(p_label)), '')
             || coalesce((select string_agg(to_jsonb(v)::text, '|' order by v.version_number) from public.contract_versions v where v.contract_id = pg_temp.id(p_label)), '')
             || coalesce((select string_agg(to_jsonb(a)::text, '|' order by a.version_number, a.party_role) from public.contract_acceptances a
                          where a.contract_id = pg_temp.id(p_label)), '')) $$;
insert into j16d_ids values ('o1', test_helpers.create_owner('j16d-o1@local.test'));
insert into j16d_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j16d-w' || n || '@local.test')) from generate_series(1, 4) n;
insert into j16d_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1')));
insert into j16d_ids values ('k1', test_helpers.create_active_test_contract('j16d-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j16d-w1@local.test')),
  ('k3', test_helpers.create_active_test_contract('j16d-o1@local.test', pg_temp.id('s1'), pg_temp.id('w3'), 'j16d-w3@local.test'));
create function pg_temp.sent_contract(p_label text, p_worker text) returns uuid language plpgsql as $$
begin
  perform test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id(p_worker));
  insert into j16d_ids values (p_label, test_helpers.create_test_contract_draft('j16d-o1@local.test', pg_temp.id('s1'), pg_temp.id(p_worker)));
  perform test_helpers.fill_test_contract_draft(pg_temp.id(p_label), 'j16d-o1@local.test');
  perform test_helpers.send_test_contract(pg_temp.id(p_label), 'j16d-o1@local.test');
  return pg_temp.id(p_label);
end $$;
select pg_temp.sent_contract('k2', 'w2') is not null as k2_sent, pg_temp.sent_contract('k4', 'w4') is not null as k4_sent;
insert into j16d_ids values ('d1', test_helpers.raise_test_contract_dispute(pg_temp.id('k1'), 'j16d-w1@local.test')),
  ('d2', test_helpers.raise_test_contract_dispute(pg_temp.id('k2'), 'j16d-o1@local.test')),
  ('d2w', test_helpers.raise_test_contract_dispute(pg_temp.id('k2'), 'j16d-w2@local.test')),
  ('d3', test_helpers.raise_test_contract_dispute(pg_temp.id('k3'), 'j16d-o1@local.test')),
  ('d4', test_helpers.raise_test_contract_dispute(pg_temp.id('k4'), 'j16d-w4@local.test'));

-- ---------- open disputes never block ----------
select test_helpers.act_as_worker('j16d-w1@local.test');
select is((public.terminate_worker_contract(pg_temp.id('k1'), pg_temp.rev('k1'), 'I am leaving for another local test job')).status, 'terminated',
          'j16_w11_open_dispute_does_not_block_terminate_or_decline');
select test_helpers.act_as_worker('j16d-w2@local.test');
select is((public.decline_worker_contract_version(pg_temp.id('k2'), pg_temp.pending('k2'), null)).status, 'declined',
          'j16_w11_open_dispute_does_not_block_terminate_or_decline');
select test_helpers.act_as_service();
select lives_ok(format($s$ select test_helpers.accept_test_contract(%L, 'j16d-w4@local.test') $s$, pg_temp.id('k4')),
                'j16_w11_open_dispute_does_not_block_terminate_or_decline');
select is(pg_temp.status('k4'), 'accepted', 'j16_w11_open_dispute_does_not_block_terminate_or_decline');
select test_helpers.act_as_owner('j16d-o1@local.test');
select is((public.activate_worker_contract(pg_temp.id('k4'), pg_temp.rev('k4'))).status, 'active', 'j16_w11_open_dispute_does_not_block_terminate_or_decline');
select is((public.terminate_worker_contract(pg_temp.id('k4'), pg_temp.rev('k4'), 'The shop ends this local test contract')).status, 'terminated',
          'j16_w11_open_dispute_does_not_block_terminate_or_decline');
select test_helpers.act_as_service();
select is((select array_agg(status order by created_at, id) from public.worker_contract_disputes where id in (pg_temp.id('d1'), pg_temp.id('d2'),
             pg_temp.id('d2w'), pg_temp.id('d4'))), array['open', 'open', 'open', 'open'], 'j16_w11_open_dispute_does_not_block_terminate_or_decline');

-- ---------- closing leaves the contract unchanged ----------
select set_config('fx.k3_before', pg_temp.contract_md5('k3'), true);
insert into j16d_ids select 'v3', current_version_id from public.worker_contracts where id = pg_temp.id('k3');
select test_helpers.act_as_admin('j16d-a1@local.test');
select ok(public.admin_contract_dispute_case(pg_temp.id('d3')) ? 'contract', 'j16_w11_closing_dispute_leaves_contract_and_versions_unchanged');
select is((select count(*)::int from public.admin_contract_dispute_version_document(pg_temp.id('d3'), pg_temp.id('v3'))), 1,
          'j16_w11_closing_dispute_leaves_contract_and_versions_unchanged');
select is((public.close_contract_dispute(pg_temp.id('d3'), 1, 'information_shared', 'WashLink shared where both parties can get help')).status, 'closed',
          'j16_w11_closing_dispute_leaves_contract_and_versions_unchanged');
select test_helpers.act_as_service();
select is(pg_temp.contract_md5('k3'), current_setting('fx.k3_before'), 'j16_w11_closing_dispute_leaves_contract_and_versions_unchanged');

-- ---------- static scans ----------
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W11:%'
             and p.prosrc ~* '(insert\s+into|update|delete\s+from|truncate)\s+(only\s+)?(public\.)?(worker_contracts|contract_versions|contract_acceptances|contract_version_clauses|contract_version_flags|worker_owner_relationships|retained_job_application_records)\M'),
          0, 'j16_w11_no_w11_function_writes_contract_tables');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W11:%'), 31,
          'j16_w11_no_w11_function_writes_contract_tables');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
             and (obj_description(p.oid, 'pg_proc') like 'W9:%' or obj_description(p.oid, 'pg_proc') like 'W10:%'
                  or p.proname in ('decline_worker_contract_version', 'terminate_worker_contract', 'accept_worker_contract_version',
                                   'activate_worker_contract', 'transition_certification', 'request_certification_review',
                                   'decide_certification_review', 'withdraw_certification_review'))
             and p.prosrc ~* '(worker_contract_dispute|certification_platform_review)'), 0, 'j16_w11_w9_rpcs_do_not_reference_dispute_tables');

select * from finish();
rollback;
