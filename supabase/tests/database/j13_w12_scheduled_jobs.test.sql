-- J13 / J15 (W12): the scheduled workforce jobs through the single date-free entry point run_workforce_scheduled_job
-- (W12 PLAN 3.3..3.5, P83, P84; D-64, D-65; closes W10 S3 / C8). Contract expiry records accepted / active contracts
-- past their Manila end date as expired (each party notified once; terminated, declined and future contracts untouched)
-- and an expired contract stops counting; the notices job sends due and expired notices; the relationship refresh walks
-- every pair with a cursor in batches and resets it when a pass completes; a disabled job does nothing; one job per
-- transaction (55000); no date parameter anywhere on the scheduled path; batch bounds (22023); state and audit hold
-- counts only; the runner refuses signed-in users and service_role JWTs. Called as pg_cron would (trusted session);
-- between two runs the test clears the per-transaction job flag (TEST-ONLY: pgTAP runs in one transaction). Local
-- Docker stack only; backdating is a TEST-ONLY time shift; enabled / batch_size are changed by trusted SQL (runbook).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- fixtures ----------
create temporary table j13s_ids (label text primary key, id uuid) on commit drop;
grant all on j13s_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j13s_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j13s-' || p_label || '@local.test' $$;
create function pg_temp.run(p_job text) returns jsonb language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('washlink.scheduled_job', '', true);   -- TEST-ONLY: a new transaction for each scheduled run
  return public.run_workforce_scheduled_job(p_job);
end $$;
create function pg_temp.job(p_job text) returns public.workforce_scheduled_jobs language sql stable security definer
as $$ select * from public.workforce_scheduled_jobs where job_key = p_job $$;
create function pg_temp.status(p_label text) returns text language sql stable security definer
as $$ select status from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.notes_of(p_label text) returns text language sql stable security definer as $$
  select count(*) filter (where n.recipient_id = c.worker_id) || ',' || count(*) filter (where n.recipient_id = c.owner_id)
  from public.worker_contracts c join public.notifications n on n.subject_id = c.id and n.title = 'Contract expired' where c.id = pg_temp.id(p_label) $$;
insert into j13s_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j13s_ids select 'o' || n, test_helpers.create_owner(pg_temp.email('o' || n)) from generate_series(1, 2) n;
insert into j13s_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 7) n;
insert into j13s_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1'))),
  ('s2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.id('a1'))), ('s3', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
-- k1 active and k5 accepted, both past their end date; k2 terminated and k3 declined (also past); k4 active, ends in 30 days.
insert into j13s_ids values ('k1', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w1'), pg_temp.email('w1'),
                                                                            test_helpers.manila_today()));
insert into j13s_ids values ('k2', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w2'), pg_temp.email('w2'),
                                                                            test_helpers.manila_today()));
select test_helpers.act_as_worker(pg_temp.email('w2'));
select (public.terminate_worker_contract(pg_temp.id('k2'), (select revision from public.worker_contracts where id = pg_temp.id('k2')),
                                         'Ending this before the season closes.')).status;
select test_helpers.act_as_service();
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w3')) is not null as w3_applied;
insert into j13s_ids values ('k3', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w3')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k3'), pg_temp.email('o1'));
insert into j13s_ids values ('k3v1', test_helpers.send_test_contract(pg_temp.id('k3'), pg_temp.email('o1')));
select test_helpers.act_as_worker(pg_temp.email('w3'));
select (public.decline_worker_contract_version(pg_temp.id('k3'), pg_temp.id('k3v1'), null)).status;
select test_helpers.act_as_service();
insert into j13s_ids values ('k4', test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w4'), pg_temp.email('w4'),
                                                                            test_helpers.manila_today() + 30));
insert into j13s_ids values ('k5', test_helpers.create_accepted_test_contract(pg_temp.email('o2'), pg_temp.id('s2'), pg_temp.id('w5'), pg_temp.email('w5'),
                                                                              test_helpers.manila_today()));
select count(test_helpers.backdate_test_worker_contract(pg_temp.id(k), 3)) as backdated from unnest(array['k1', 'k2', 'k3', 'k5']) k;
-- Certificates of a 1-month shop: c6 within 30 days (due), c7 past its expiry.
select test_helpers.act_as_owner(pg_temp.email('o1'));
select (public.set_shop_certification_validity(pg_temp.id('s3'), 1)).validity_months as s3_validity;
select test_helpers.act_as_service();
insert into j13s_ids select 'c' || n, test_helpers.issue_test_certification(pg_temp.id('s3'), pg_temp.id('w' || n), pg_temp.email('o1')) from generate_series(6, 7) n;
select test_helpers.backdate_certification(pg_temp.id('c6'), 5) is not null and test_helpers.backdate_certification(pg_temp.id('c7'), 40) is not null as shifted;
select set_config('fx.events0', (select coalesce(max(id), 0)::text from public.workforce_audit_events), true);

-- ---------- contract expiry ----------
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')) || '|' || public.worker_distinct_qualifying_owner_count(pg_temp.id('w1')),
          'active,contract_active,1|0', 'w12_expired_contract_stops_counting');
select is(pg_temp.run('worker_contract_expiry'), '{"job": "worker_contract_expiry", "outcome": "completed", "processed": 2, "changed": 2, "remaining": 0, "skipped_locked": 0,
           "skipped_failed": 0, "failed_sqlstates": []}'::jsonb,
          'w12_contract_expiry_job_expires_past_end_and_notifies_each_party_once');
select is(array[pg_temp.status('k1'), pg_temp.notes_of('k1'), pg_temp.status('k5'), pg_temp.notes_of('k5')], array['expired', '1,1', 'expired', '1,1'],
          'w12_contract_expiry_job_notifies_each_party_once');
select is((select string_agg(ended_by || ':' || (ended_at = now()) || ':' || (pending_version_id is null), ',') from public.worker_contracts
           where id in (pg_temp.id('k1'), pg_temp.id('k5'))), 'system:true:true,system:true:true',
          'w12_contract_expiry_job_stamps_system_end_and_clears_pending');
select is(array[pg_temp.status('k2'), pg_temp.status('k3'), pg_temp.status('k4'), pg_temp.notes_of('k2'), pg_temp.notes_of('k4')],
          array['terminated', 'declined', 'active', '0,0', '0,0'], 'w12_contract_expiry_ignores_terminated_declined_and_future');
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')) || '|' || public.worker_distinct_qualifying_owner_count(pg_temp.id('w1'))
          || '|' || public.worker_distinct_qualifying_owner_count(pg_temp.id('w4')), 'ended,contract_expired,0|0|1', 'w12_expired_contract_stops_counting');
select is((pg_temp.run('worker_contract_expiry') ->> 'processed')::int || ',' || pg_temp.notes_of('k1'), '0,1,1',
          'w12_contract_expiry_job_second_run_changes_nothing');

-- ---------- certification notices ----------
select is((pg_temp.run('certification_expiry_notices') ->> 'processed')::int, 2, 'w12_certification_notice_job_sends_due_and_expired');
select is((select string_agg(n.category || ':' || split_part(n.idempotency_key, ':', 3), ',' order by n.category) from public.notifications n
           where n.subject_id in (pg_temp.id('c6'), pg_temp.id('c7')) and n.category like 'certification.expir%'),
          'certification.expired:expired,certification.expiring:due', 'w12_certification_notice_job_sends_due_and_expired');

-- ---------- relationship refresh: cursor over every pair in batches ----------
update public.workforce_scheduled_jobs set batch_size = 3 where job_key = 'owner_relationship_refresh';   -- trusted SQL (runbook)
create temporary table j13s_pairs on commit drop as
  select distinct c.worker_id, c.owner_id from public.worker_contracts c where c.accepted_at is not null order by 1, 2;
select is((select count(*)::int from j13s_pairs), 4, 'w12_relationship_refresh_cursor_walks_all_pairs');
select is((pg_temp.run('owner_relationship_refresh') ->> 'processed')::int, 3, 'w12_relationship_refresh_cursor_walks_all_pairs');
select is((select (j.cursor_worker_id, j.cursor_owner_id)::text from pg_temp.job('owner_relationship_refresh') j),
          (select (p.worker_id, p.owner_id)::text from j13s_pairs p order by 1 offset 2 limit 1), 'w12_relationship_refresh_cursor_walks_all_pairs');
select is((select j.last_pass_completed_at is null from pg_temp.job('owner_relationship_refresh') j), true, 'w12_relationship_refresh_cursor_walks_all_pairs');
select is((pg_temp.run('owner_relationship_refresh') ->> 'processed')::int, 1, 'w12_relationship_refresh_pass_completed_resets_cursor');
select is((select row(j.cursor_worker_id is null, j.cursor_owner_id is null, j.last_pass_completed_at = now(), j.run_count)::text
           from pg_temp.job('owner_relationship_refresh') j), '(t,t,t,2)', 'w12_relationship_refresh_pass_completed_resets_cursor');
select is((pg_temp.run('owner_relationship_refresh') ->> 'processed')::int, 3, 'w12_relationship_refresh_pass_completed_resets_cursor');

-- ---------- disabled job ----------
update public.workforce_scheduled_jobs set enabled = false where job_key = 'worker_contract_expiry';   -- trusted SQL (runbook pause)
select test_helpers.backdate_test_worker_contract(pg_temp.id('k4'), 40);
select is(pg_temp.run('worker_contract_expiry') - 'remaining', '{"job": "worker_contract_expiry", "outcome": "disabled", "processed": 0, "changed": 0, "skipped_locked": 0,
           "skipped_failed": 0, "failed_sqlstates": []}'::jsonb,
          'w12_disabled_job_does_nothing');
select is(pg_temp.status('k4') || ',' || (pg_temp.job('worker_contract_expiry')).last_outcome, 'active,disabled', 'w12_disabled_job_does_nothing');
update public.workforce_scheduled_jobs set enabled = true where job_key = 'worker_contract_expiry';
select set_config('fx.k4_run', pg_temp.run('worker_contract_expiry') ->> 'processed', true);
select is(current_setting('fx.k4_run') || ',' || pg_temp.status('k4'), '1,expired', 'w12_disabled_job_does_nothing');

-- ---------- one job per transaction; no date parameter; batch bounds ----------
select throws_ok($$ select public.run_workforce_scheduled_job('certification_expiry_notices') $$, '55000', 'W12: one scheduled job per transaction.',
                 'w12_one_job_per_transaction_55000');
select is((select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ',' order by p.proname) from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('run_workforce_scheduled_job', 'expire_worker_contracts_batch', 'refresh_worker_owner_relationships_batch')),
          'expire_worker_contracts_batch(p_after_contract uuid, p_limit integer),refresh_worker_owner_relationships_batch(p_after_worker uuid, p_after_owner uuid, p_limit integer),'
          || 'run_workforce_scheduled_job(p_job text)', 'w12_runner_has_no_date_parameter');
select is(test_helpers.attempt($$ select public.run_workforce_scheduled_job('worker_contract_expiry', current_date) $$), '42883', 'w12_runner_has_no_date_parameter');
select is(array[test_helpers.attempt('select public.expire_worker_contracts_batch(null, 0)'), test_helpers.attempt('select public.expire_worker_contracts_batch(null, 201)'),
                test_helpers.attempt('select public.refresh_worker_owner_relationships_batch(null, null, 0)'),
                test_helpers.attempt('select public.refresh_worker_owner_relationships_batch(null, null, null)'),
                test_helpers.attempt($$ update public.workforce_scheduled_jobs set batch_size = 201 where job_key = 'worker_contract_expiry' $$)],
          array['22023', '22023', '22023', '22023', '23514'], 'w12_batch_limit_bounds_22023');
select throws_ok('select public.expire_worker_contracts_batch(null, 0)', '22023', 'Batch size must be between 1 and 200.', 'w12_batch_limit_bounds_22023');

-- ---------- state and audit ----------
select is((select row(j.last_outcome, j.last_processed_count, j.last_changed_count, j.last_skipped_locked_count, j.run_count, j.last_started_at = now(),
                      j.last_finished_at >= j.last_started_at)::text from pg_temp.job('worker_contract_expiry') j),
          '(completed,1,1,0,4,t,t)', 'w12_job_state_updated_and_audited_without_ids');
create temporary table j13s_runs on commit drop as
  select e.* from public.workforce_audit_events e where e.id > current_setting('fx.events0')::bigint and e.action = 'workforce_scheduled_job.ran';
select is((select string_agg(e.payload ->> 'job_key', ',' order by e.id) from j13s_runs e),
          'worker_contract_expiry,certification_expiry_notices,owner_relationship_refresh,owner_relationship_refresh,owner_relationship_refresh,worker_contract_expiry',
          'w12_job_state_updated_and_audited_without_ids');
select is((select count(*)::int from j13s_runs e
           where e.subject_type <> 'workforce_scheduled_job' or e.subject_id is not null or e.subject_profile_id is not null or e.actor_id is not null
              or e.actor_kind <> 'trusted_session' or e.payload::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-'
              or (select array_agg(k order by k) from jsonb_object_keys(e.payload) k)
                 <> array['changed_by', 'changed_count', 'failed_sqlstates', 'job_key', 'pass_completed', 'processed_count', 'skipped_failed_count',
                          'skipped_locked_count']), 0,
          'w12_job_state_updated_and_audited_without_ids');

-- ---------- the runner refuses signed-in users and service_role JWTs ----------
select set_config('washlink.scheduled_job', '', true);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('a1'), 'role', 'authenticated')::text, true);
select throws_ok($$ select public.run_workforce_scheduled_job('worker_contract_expiry') $$, '42501',
                 'Scheduled jobs run only from a trusted database session.', 'w12_runner_refused_for_authenticated_and_service_role_jwt');
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select throws_ok($$ select public.run_workforce_scheduled_job('worker_contract_expiry') $$, '42501',
                 'Scheduled jobs run only from a trusted database session.', 'w12_runner_refused_for_authenticated_and_service_role_jwt');
select test_helpers.act_as_admin(pg_temp.email('a1'));
select is(test_helpers.attempt($$ select public.run_workforce_scheduled_job('worker_contract_expiry') $$), '42501',
          'w12_runner_refused_for_authenticated_and_service_role_jwt');
select test_helpers.act_as_service();
select throws_ok($$ select public.run_workforce_scheduled_job('everything') $$, '22023', 'Unknown scheduled job.',
                 'w12_runner_refused_for_authenticated_and_service_role_jwt');

select * from finish();
rollback;
