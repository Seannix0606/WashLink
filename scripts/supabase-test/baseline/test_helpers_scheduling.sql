-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- WashLink pgTAP helpers for W12 notification wiring and scheduled jobs. Seeded AFTER test_helpers_moderation.sql
-- (eighth sql_paths entry of the staged .local-supabase-test workdir only). Same rules as test_helpers.sql: SECURITY
-- INVOKER, transaction-local identity switching, fixtures must start in a trusted session (test_helpers.act_as_service())
-- and END in one. No helper function writes the registry, the job state or a notification.

-- LOCAL TEST BASELINE ONLY: the W3 writer tests (j17_w3_notifications, which predate the W12 registry and stay
-- unchanged) enqueue synthetic `test.*` categories with `test:` keys and no subject. They are registered here, in the
-- local seed only (trusted session, no signed-in user), never by a migration; production never has these rows.
insert into public.notification_categories (category, source_increment, key_prefixes, subject_types, recipient_kind, description)
values ('test.notice', 'W3', array['test'], null, 'owner', 'LOCAL TEST BASELINE ONLY: synthetic W3 writer test notice.'),
       ('test.dup', 'W3', array['test'], null, 'owner', 'LOCAL TEST BASELINE ONLY: synthetic W3 idempotency test notice.'),
       ('test.text', 'W3', array['test'], null, 'owner', 'LOCAL TEST BASELINE ONLY: synthetic W3 text rule test notice.')
on conflict (category) do nothing;

-- TEST-ONLY time shift: moves a worker contract's start and end dates p_days into the past, as if those days had
-- passed. The W9 guard refuses this for every session and nothing fires when a real day passes, so the fixture skips the
-- W9 guard and the W10 sync trigger for the one statement with session_replication_role = replica (the j13_w10 technique;
-- ALTER TABLE ... DISABLE TRIGGER is refused while the deferred W9 FK checks are pending), inside the test transaction,
-- and restores it: the stored relationship stays as it was until a refresh, exactly as after a real day.
create or replace function test_helpers.backdate_test_worker_contract(p_contract uuid, p_days integer)
returns uuid language plpgsql security invoker as $$
begin
  perform test_helpers.assert_service_session();
  set local session_replication_role = replica;
  update public.worker_contracts set start_date = start_date - p_days, end_date = end_date - p_days where id = p_contract;
  set local session_replication_role = origin;
  if not exists (select 1 from public.worker_contracts c where c.id = p_contract) then
    raise exception 'test_helpers.backdate_test_worker_contract: no contract %', p_contract;
  end if;
  return p_contract;
end $$;

-- TEST-ONLY second database session (dblink to the LOCAL stack with the local default credentials; the extension is
-- created inside the test transaction and rolled back with it). Host `db` is the local Docker network alias of this
-- same container (scram, so dblink accepts the password; loopback is trust and is refused for a non-superuser).
-- Tries a session-level advisory lock on p_key in the
-- second session and returns whether it got it; the lock is held until release_second_session() or the end of the
-- test connection. Rows created by the test transaction are invisible to the second session (only keys are shared).
create or replace function test_helpers.hold_lock_in_second_session(p_key bigint)
returns boolean language plpgsql security invoker as $$
declare
  got boolean;
begin
  perform test_helpers.assert_service_session();
  create extension if not exists dblink with schema extensions;
  if not ('w12_second' = any (coalesce(extensions.dblink_get_connections(), '{}'::text[]))) then
    -- LOCAL DEFAULT, local test stack only (the published Supabase CLI local credentials; never a real project).
    perform extensions.dblink_connect('w12_second', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
  end if;
  select t.ok into got from extensions.dblink('w12_second', format('select pg_try_advisory_lock(%s)', p_key)) as t(ok boolean);
  return got;
end $$;

-- Releases every advisory lock of the second session and closes it. True when a session was open.
create or replace function test_helpers.release_second_session()
returns boolean language plpgsql security invoker as $$
begin
  perform test_helpers.assert_service_session();
  if to_regprocedure('extensions.dblink_get_connections()') is null
     or not ('w12_second' = any (coalesce(extensions.dblink_get_connections(), '{}'::text[]))) then
    return false;
  end if;
  perform extensions.dblink_exec('w12_second', 'do $u$ begin perform pg_advisory_unlock_all(); end $u$');
  perform extensions.dblink_disconnect('w12_second');
  return true;
end $$;

-- The private-text marker written into every private field by the W12 privacy test.
create or replace function test_helpers.notification_marker()
returns text language sql immutable security invoker as $$ select 'ZQXW12PRIVATE'::text $$;

grant execute on all functions in schema test_helpers to anon, authenticated;
-- ROLLBACK (local test stack only)
-- drop function if exists test_helpers.notification_marker();
-- drop function if exists test_helpers.release_second_session();
-- drop function if exists test_helpers.hold_lock_in_second_session(bigint);
-- drop function if exists test_helpers.backdate_test_worker_contract(uuid, integer);
-- delete from public.notification_categories where category in ('test.notice', 'test.dup', 'test.text');
