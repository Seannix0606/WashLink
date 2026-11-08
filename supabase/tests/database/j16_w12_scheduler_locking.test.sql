-- J16 (W12): the scheduler never waits on a lock and never blocks a worker (W12 PLAN P84; closes W10 REVIEW S2 / C8; R3,
-- R4). A SECOND database session (TEST-ONLY dblink to the local stack, test_helpers.hold_lock_in_second_session) holds
-- the exact W10 pair key or the W12 job key: the pair try-lock collides with the w10e key expression, a contract whose
-- pair is busy is skipped (not waited for) and expired on the next run, a busy relationship pair is skipped and
-- refreshed on the next pass, a busy job returns already_running and writes nothing; after the runs a worker still
-- terminates and declines (J16). Rows of this transaction are invisible to the second session: only lock keys are
-- shared. A transaction already holding a pair lock cannot be blocked on it, and the W10 sync trigger takes the pair lock
-- of every fixture contract it touches, so this file disables that trigger BEFORE any fixture contract exists (TEST-ONLY,
-- rolled back): the transaction then starts like a fresh scheduler transaction holding no pair lock, and relationships
-- are written only by the refresh job. Called as pg_cron would (trusted session); between two runs the test clears the
-- per-transaction job flag (TEST-ONLY). Local Docker stack only; backdating is a TEST-ONLY time shift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ---------- fixtures ----------
alter table public.worker_contracts disable trigger worker_contracts_sync_owner_relationship;   -- TEST-ONLY, see above
create temporary table j16l_ids (label text primary key, id uuid) on commit drop;
grant all on j16l_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j16l_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j16l-' || p_label || '@local.test' $$;
create function pg_temp.run(p_job text) returns jsonb language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('washlink.scheduled_job', '', true);   -- TEST-ONLY: a new transaction for each scheduled run
  return public.run_workforce_scheduled_job(p_job);
end $$;
create function pg_temp.pair_key(p_worker text, p_owner text) returns bigint language sql stable
as $$ select hashtextextended('w10:' || pg_temp.id(p_worker)::text || ':' || pg_temp.id(p_owner)::text, 0) $$;
create function pg_temp.status(p_label text) returns text language sql stable security definer
as $$ select status from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.job_state(p_job text) returns text language sql stable security definer as $$
  select row(j.run_count, j.last_started_at, j.last_outcome, j.last_processed_count, j.updated_at)::text from public.workforce_scheduled_jobs j where j.job_key = p_job $$;
insert into j16l_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j16l_ids values ('o1', test_helpers.create_owner(pg_temp.email('o1')));
insert into j16l_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 4) n;
insert into j16l_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j16l_ids select 'k' || n, test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w' || n), pg_temp.email('w' || n),
                                                                              test_helpers.manila_today() + (n - 1) * 10) from generate_series(1, 3) n;
select test_helpers.backdate_test_worker_contract(pg_temp.id('k1'), 1);

-- ---------- the pair try-lock is the W10 lock ----------
select is(test_helpers.hold_lock_in_second_session(pg_temp.pair_key('w1', 'o1')), true, 'w12_pair_try_lock_key_collides_with_w10_lock');
select is(array[public.worker_owner_pair_try_lock(pg_temp.id('w1'), pg_temp.id('o1')), public.worker_owner_pair_try_lock(pg_temp.id('w4'), pg_temp.id('o1')),
                public.worker_owner_pair_try_lock(null, pg_temp.id('o1'))], array[false, true, true], 'w12_pair_try_lock_key_collides_with_w10_lock');
-- The other direction: the W10 refresh takes its (blocking) pair lock here; the second session cannot take that key.
select public.refresh_worker_owner_relationship(pg_temp.id('w3'), pg_temp.id('o1')) as w3_refreshed;
select is(test_helpers.hold_lock_in_second_session(pg_temp.pair_key('w3', 'o1')), false, 'w12_pair_try_lock_key_collides_with_w10_lock');
select is((select count(*)::int from pg_proc p where p.oid in ('public.refresh_worker_owner_relationship(uuid, uuid, date)'::regprocedure,
                                                              'public.worker_owner_pair_try_lock(uuid, uuid)'::regprocedure)
           and strpos(p.prosrc, $k$hashtextextended('w10:' || p_worker::text || ':' || p_owner::text, 0)$k$) > 0), 2,
          'w12_pair_try_lock_key_collides_with_w10_lock');

-- ---------- a contract whose pair is busy is skipped, then expired ----------
select is(pg_temp.run('worker_contract_expiry') - 'job' - 'outcome', '{"processed": 0, "changed": 0, "skipped_locked": 1, "skipped_failed": 0, "failed_sqlstates": [], "remaining": 1}'::jsonb,
          'w12_contract_skipped_while_pair_locked_then_expired');
select is(pg_temp.status('k1') || ',' || (select count(*) from public.notifications where subject_id = pg_temp.id('k1') and title = 'Contract expired'),
          'active,0', 'w12_contract_skipped_while_pair_locked_then_expired');
select is(test_helpers.release_second_session(), true, 'w12_contract_skipped_while_pair_locked_then_expired');
select is(pg_temp.run('worker_contract_expiry') - 'job' - 'outcome', '{"processed": 1, "changed": 1, "skipped_locked": 0, "skipped_failed": 0, "failed_sqlstates": [], "remaining": 0}'::jsonb,
          'w12_contract_skipped_while_pair_locked_then_expired');
select is(pg_temp.status('k1') || ',' || (select count(*) from public.notifications where subject_id = pg_temp.id('k1') and title = 'Contract expired'),
          'expired,2', 'w12_contract_skipped_while_pair_locked_then_expired');

-- ---------- a busy relationship pair is skipped, then refreshed ----------
select test_helpers.backdate_test_worker_contract(pg_temp.id('k2'), 11);
select is(test_helpers.hold_lock_in_second_session(pg_temp.pair_key('w2', 'o1')), true, 'w12_relationship_skipped_while_pair_locked');
select is(pg_temp.run('owner_relationship_refresh') - 'job' - 'outcome' - 'remaining', '{"processed": 2, "changed": 1, "skipped_locked": 1, "skipped_failed": 0, "failed_sqlstates": []}'::jsonb,
          'w12_relationship_skipped_while_pair_locked');
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o1')) || '|' || test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')),
          'none|ended,contract_expired,0', 'w12_relationship_skipped_while_pair_locked');
select test_helpers.release_second_session();
select is(pg_temp.run('owner_relationship_refresh') - 'job' - 'outcome' - 'remaining', '{"processed": 3, "changed": 1, "skipped_locked": 0, "skipped_failed": 0, "failed_sqlstates": []}'::jsonb,
          'w12_relationship_skipped_while_pair_locked');
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o1')), 'ended,contract_expired,0', 'w12_relationship_skipped_while_pair_locked');

-- ---------- a busy job writes nothing ----------
select set_config('fx.state', pg_temp.job_state('certification_expiry_notices'), true);
select set_config('fx.events', (select count(*)::text from public.workforce_audit_events), true);
select test_helpers.hold_lock_in_second_session(hashtextextended('w12:job:certification_expiry_notices', 0));
select is(pg_temp.run('certification_expiry_notices'),
          '{"job": "certification_expiry_notices", "outcome": "already_running", "processed": 0, "changed": 0, "skipped_locked": 0,
           "skipped_failed": 0, "failed_sqlstates": [], "remaining": null}'::jsonb,
          'w12_job_already_running_writes_nothing');
select is(pg_temp.job_state('certification_expiry_notices') || '|' || (select count(*) from public.workforce_audit_events),
          current_setting('fx.state') || '|' || current_setting('fx.events'), 'w12_job_already_running_writes_nothing');
select test_helpers.release_second_session();

-- ---------- J16: a worker still terminates and declines after the runs ----------
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w4')) is not null as w4_applied;
insert into j16l_ids values ('k4', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w4')));
select test_helpers.fill_test_contract_draft(pg_temp.id('k4'), pg_temp.email('o1'));
insert into j16l_ids values ('k4v1', test_helpers.send_test_contract(pg_temp.id('k4'), pg_temp.email('o1')));
select pg_temp.run('worker_contract_expiry') ->> 'outcome';
select pg_temp.run('owner_relationship_refresh') ->> 'outcome';
select test_helpers.act_as_worker(pg_temp.email('w3'));
select is((public.terminate_worker_contract(pg_temp.id('k3'), pg_temp.rev('k3'), 'I found another job closer to home.')).status, 'terminated',
          'w12_worker_terminate_and_decline_succeed_after_runs');
select test_helpers.act_as_worker(pg_temp.email('w4'));
select is((public.decline_worker_contract_version(pg_temp.id('k4'), pg_temp.id('k4v1'), null)).status, 'declined',
          'w12_worker_terminate_and_decline_succeed_after_runs');
select test_helpers.act_as_service();

select * from finish();
rollback;
