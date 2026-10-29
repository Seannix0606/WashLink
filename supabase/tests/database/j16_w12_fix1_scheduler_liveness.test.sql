-- J16 (W12 fix cycle 1, REVIEW N3 / N4): one failing item never stalls a scheduled job, and an item the run skips holds
-- no lock. A TEST-ONLY trigger (created inside this transaction, rolled back) makes the expiry of one planted contract
-- and the relationship write of one planted pair raise 23514. The run still completes: the planted item is counted as
-- skipped_failed with its SQLSTATE only (no ids, no text), nothing of it is written, its pair lock is released (a
-- SECOND database session, TEST-ONLY dblink to the local stack, can take the exact W10 key), the other candidates are
-- processed, both cursors move past the planted item and the item is retried on the next pass. The candidates are read
-- without a row lock and the pair try-lock comes before the row lock; the runner sets lock_timeout 1 s. As in
-- j16_w12_scheduler_locking, the W10 sync trigger is disabled BEFORE any fixture contract exists (TEST-ONLY, rolled
-- back) and the per-transaction job flag is cleared between runs (TEST-ONLY). Local Docker stack only; backdating is a
-- TEST-ONLY time shift; batch sizes are changed by trusted SQL (runbook).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------- fixtures ----------
alter table public.worker_contracts disable trigger worker_contracts_sync_owner_relationship;   -- TEST-ONLY, see above
create temporary table j16f_ids (label text primary key, id uuid) on commit drop;
grant all on j16f_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j16f_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j16f-' || p_label || '@local.test' $$;
create function pg_temp.run(p_job text) returns jsonb language plpgsql as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('washlink.scheduled_job', '', true);   -- TEST-ONLY: a new transaction for each scheduled run
  return public.run_workforce_scheduled_job(p_job);
end $$;
create function pg_temp.counts(p_result jsonb) returns text language sql immutable as $$
  select concat_ws(',', p_result ->> 'outcome', p_result ->> 'processed', p_result ->> 'skipped_locked', p_result ->> 'skipped_failed',
                   p_result -> 'failed_sqlstates', p_result ->> 'remaining') $$;
create function pg_temp.status(p_id uuid) returns text language sql stable security definer
as $$ select status from public.worker_contracts where id = p_id $$;
create function pg_temp.job(p_job text) returns public.workforce_scheduled_jobs language sql stable security definer
as $$ select * from public.workforce_scheduled_jobs where job_key = p_job $$;
create function pg_temp.pair_key(p_worker uuid, p_owner uuid) returns bigint language sql immutable
as $$ select hashtextextended('w10:' || p_worker::text || ':' || p_owner::text, 0) $$;
-- TEST-ONLY planted failure (rolled back): created before any fixture contract (no pending trigger events yet) and
-- switched on per table by the transaction setting fx.plant.
create function pg_temp.planted_failure() returns trigger language plpgsql as $$
begin
  if (tg_table_name = 'worker_contracts' and current_setting('fx.plant', true) = 'contract'
      and new.id = (select id from pg_temp.j16f_ids where label = 'bad_k') and new.status = 'expired')
     or (tg_table_name = 'worker_owner_relationships' and current_setting('fx.plant', true) = 'pair'
         and new.worker_id = (select id from pg_temp.j16f_ids where label = 'bad_w')) then
    raise exception 'TEST-ONLY planted failure' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger j16f_planted_failure before update on public.worker_contracts for each row execute function pg_temp.planted_failure();
create trigger j16f_planted_failure before insert or update on public.worker_owner_relationships for each row execute function pg_temp.planted_failure();
insert into j16f_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j16f_ids values ('o1', test_helpers.create_owner(pg_temp.email('o1')));
insert into j16f_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 4) n;
insert into j16f_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j16f_ids select 'k' || n, test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w' || n),
                                                                               pg_temp.email('w' || n), test_helpers.manila_today()) from generate_series(1, 4) n;
select count(test_helpers.backdate_test_worker_contract(pg_temp.id('k' || n), 2)) as backdated from generate_series(1, 4) n;
-- The planted contract is the FIRST candidate in id order (the worst case for starvation); the planted pair is the
-- first pair in (worker, owner) order.
insert into j16f_ids select 'bad_k', min(id::text)::uuid from j16f_ids where label like 'k_';
insert into j16f_ids select 'bad_w', min(id::text)::uuid from j16f_ids where label like 'w_';
insert into j16f_ids select 'bad_k_worker', worker_id from public.worker_contracts where id = pg_temp.id('bad_k');
select set_config('fx.plant', 'contract', true);
update public.workforce_scheduled_jobs set batch_size = 2 where job_key in ('worker_contract_expiry', 'owner_relationship_refresh');
select set_config('fx.events0', (select coalesce(max(id), 0)::text from public.workforce_audit_events), true);
select set_config('fx.bad_versions', (select string_agg(id || ':' || state, ',' order by version_number) from public.contract_versions
                                      where contract_id = pg_temp.id('bad_k')), true);

-- ---------- contract expiry: the planted contract fails, the rest are processed ----------
select is(pg_temp.counts(pg_temp.run('worker_contract_expiry')), 'completed,1,0,1,["23514"],3', 'w12_fix1_expiry_failed_item_skipped_run_completes');
select is(pg_temp.status(pg_temp.id('bad_k')) || '|' || (select count(*) from public.notifications where subject_id = pg_temp.id('bad_k') and title = 'Contract expired')
          || '|' || (select string_agg(id || ':' || state, ',' order by version_number) from public.contract_versions where contract_id = pg_temp.id('bad_k')),
          'active|0|' || current_setting('fx.bad_versions'), 'w12_fix1_expiry_failed_item_writes_nothing');
-- The failed item's pair lock was released with its subtransaction; a processed item keeps its pair lock until commit.
select is(test_helpers.hold_lock_in_second_session(pg_temp.pair_key(pg_temp.id('bad_k_worker'), pg_temp.id('o1'))), true,
          'w12_fix1_failed_item_releases_its_pair_lock');
select is(test_helpers.hold_lock_in_second_session(pg_temp.pair_key((select c.worker_id from public.worker_contracts c
                                                                     where c.worker_id in (select id from j16f_ids where label like 'w_')
                                                                       and c.status = 'expired' limit 1), pg_temp.id('o1'))), false,
          'w12_fix1_processed_item_keeps_its_pair_lock_until_commit');
select test_helpers.release_second_session();
select is((select (j.cursor_contract_id is not null and j.cursor_contract_id > pg_temp.id('bad_k'))::text || ',' || j.last_skipped_failed_count || ','
                  || array_to_string(j.last_failed_sqlstates, ' ') from pg_temp.job('worker_contract_expiry') j), 'true,1,23514',
          'w12_fix1_expiry_cursor_moves_past_failed_item');
select is(pg_temp.counts(pg_temp.run('worker_contract_expiry')), 'completed,2,0,0,[],1', 'w12_fix1_expiry_rest_processed_on_next_run');
select set_config('fx.run', pg_temp.counts(pg_temp.run('worker_contract_expiry')), true);   -- a separate statement: the read below sees the run
select is(current_setting('fx.run') || '|' || (select (j.cursor_contract_id is null and j.last_pass_completed_at = now())::text
                                               from pg_temp.job('worker_contract_expiry') j),
          'completed,0,0,0,[],1|true', 'w12_fix1_expiry_pass_completes_and_cursor_resets');
select is(pg_temp.counts(pg_temp.run('worker_contract_expiry')), 'completed,0,0,1,["23514"],1', 'w12_fix1_expiry_failed_item_retried_next_pass');
select is((select string_agg(pg_temp.status(id), ',' order by id) from j16f_ids where label like 'k_' and id <> pg_temp.id('bad_k')),
          'expired,expired,expired', 'w12_fix1_expiry_every_other_contract_expired');

-- ---------- relationship refresh: the planted pair fails, the cursor still advances ----------
select set_config('fx.plant', 'pair', true);
create temporary table j16f_pairs on commit drop as
  select distinct c.worker_id, c.owner_id from public.worker_contracts c where c.accepted_at is not null order by 1, 2;
select is((select count(*)::int || ',' || (min(worker_id::text)::uuid = pg_temp.id('bad_w'))::text from j16f_pairs), '4,true',
          'w12_fix1_refresh_fixture_planted_pair_first');
select is(pg_temp.counts(pg_temp.run('owner_relationship_refresh') - 'remaining'), 'completed,1,0,1,["23514"]', 'w12_fix1_refresh_failed_pair_skipped_run_completes');
select is((select (j.cursor_worker_id, j.cursor_owner_id)::text from pg_temp.job('owner_relationship_refresh') j),
          (select (p.worker_id, p.owner_id)::text from j16f_pairs p order by p.worker_id, p.owner_id offset 1 limit 1), 'w12_fix1_refresh_cursor_moves_past_failed_pair');
select is(test_helpers.relationship_row(pg_temp.id('bad_w'), pg_temp.id('o1')), 'none', 'w12_fix1_refresh_failed_pair_writes_nothing');
select is(pg_temp.counts(pg_temp.run('owner_relationship_refresh') - 'remaining'), 'completed,2,0,0,[]', 'w12_fix1_refresh_rest_processed_on_next_run');
select set_config('fx.run', pg_temp.counts(pg_temp.run('owner_relationship_refresh') - 'remaining'), true);
select is(current_setting('fx.run') || '|'
          || (select (j.cursor_worker_id is null and j.last_pass_completed_at = now())::text from pg_temp.job('owner_relationship_refresh') j),
          'completed,0,0,0,[]|true', 'w12_fix1_refresh_pass_completes_and_cursor_resets');
select set_config('fx.plant', '', true);
select is(pg_temp.counts(pg_temp.run('owner_relationship_refresh') - 'remaining'), 'completed,2,0,0,[]', 'w12_fix1_refresh_failed_pair_retried_next_pass');
select isnt(test_helpers.relationship_row(pg_temp.id('bad_w'), pg_temp.id('o1')), 'none', 'w12_fix1_refresh_failed_pair_written_once_it_succeeds');

-- ---------- audit: SQLSTATE only, no ids, no text ----------
select is((select count(*) filter (where e.payload::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-' or e.payload::text ilike '%planted%'
                  or jsonb_typeof(e.payload -> 'failed_sqlstates') <> 'array'
                  or exists (select 1 from jsonb_array_elements_text(e.payload -> 'failed_sqlstates') x where x !~ '^[0-9A-Z]{5}$'))
                  || ',' || count(*) filter (where e.payload -> 'failed_sqlstates' = '["23514"]'::jsonb and (e.payload ->> 'skipped_failed_count')::int = 1)
           from public.workforce_audit_events e
           where e.id > current_setting('fx.events0')::bigint and e.action = 'workforce_scheduled_job.ran'), '0,3',
          'w12_fix1_audit_records_sqlstate_only');

-- ---------- N3: no row lock on the candidate read; pair try-lock before the row lock; lock_timeout 1 s ----------
select is((select strpos(p.prosrc, 'worker_owner_pair_try_lock') > 0
                  and strpos(p.prosrc, 'worker_owner_pair_try_lock') < strpos(p.prosrc, 'for update skip locked')
                  and strpos(substr(p.prosrc, 1, strpos(p.prosrc, 'loop')), 'for update') = 0
           from pg_proc p where p.oid = 'public.expire_worker_contracts_batch(uuid, integer)'::regprocedure), true,
          'w12_fix1_pair_try_lock_before_row_lock');
select is(current_setting('lock_timeout'), '1s', 'w12_fix1_runner_lock_timeout_1s');

select * from finish();
rollback;
