-- J15 / J16 (W13): the trusted contract-end runbook (W13 PLAN section 2 "W9-S1 rest", section 6 test 6; ROLLBACK_GUIDE
-- "trusted repairs"). ACCEPTED limitation, pinned here: a raw trusted terminate (no-JWT SQL, w10b forward-only repair)
-- cannot touch pending_version_id, so it leaves an open amendment behind. Runbook, as the W12 expiry batch does it: set the
-- write flag for the contract, worker_contract_close_open_versions(id), clear the flag, then the trusted terminate. The
-- runbook end notifies nobody and every step is audited as trusted_session. A worker's decline and termination are never
-- affected (J16). Local Docker stack only; synthetic fixtures; operator SQL runs in the trusted session.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temporary table j15r_ids (label text primary key, id uuid) on commit drop;
grant all on j15r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j15r_ids where label = p_label $$;
create function pg_temp.email(p_label text) returns text language sql immutable as $$ select 'j15r-' || p_label || '@local.test' $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.contract(p_label text) returns text language sql stable security definer as $$
  select c.status || ',' || coalesce(c.ended_by, '-') || ',' || (c.ended_at is not null) || ',' || (c.pending_version_id is not null) || ','
         || coalesce((select string_agg(v.state, ' ' order by v.version_number) from public.contract_versions v
                      where v.contract_id = c.id and v.kind = 'amendment'), '-')
  from public.worker_contracts c where c.id = pg_temp.id(p_label) $$;
create function pg_temp.notices(p_label text) returns integer language sql stable security definer
as $$ select count(*)::int from public.notifications where subject_id = pg_temp.id(p_label) $$;
-- An active contract with a sent (open) amendment, through the real W9 RPCs.
create function pg_temp.active_with_open_amendment(p_label text, p_worker text) returns uuid language plpgsql as $$
declare
  k uuid := test_helpers.create_active_test_contract(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id(p_worker), pg_temp.email(p_worker));
begin
  insert into j15r_ids values (p_label, k);
  perform test_helpers.act_as_owner(pg_temp.email('o1'));
  perform public.create_worker_contract_amendment(k, pg_temp.rev(p_label));
  perform test_helpers.act_as_service();
  perform test_helpers.fill_test_contract_draft(k, pg_temp.email('o1'), '{"schedule": "Weekends only, as agreed with the worker."}');
  perform test_helpers.send_test_contract(k, pg_temp.email('o1'));
  return k;
end $$;
insert into j15r_ids values ('a1', test_helpers.create_super_admin(pg_temp.email('a1')));
insert into j15r_ids values ('o1', test_helpers.create_owner(pg_temp.email('o1')));
insert into j15r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker(pg_temp.email('w' || n))) from generate_series(1, 4) n;
insert into j15r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
select pg_temp.active_with_open_amendment('kA', 'w1') is not null as ka, pg_temp.active_with_open_amendment('kB', 'w2') is not null as kb,
       pg_temp.active_with_open_amendment('kC', 'w3') is not null as kc;
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w4')) is not null as w4_applied;
insert into j15r_ids values ('kD', test_helpers.create_test_contract_draft(pg_temp.email('o1'), pg_temp.id('s1'), pg_temp.id('w4')));
select test_helpers.fill_test_contract_draft(pg_temp.id('kD'), pg_temp.email('o1')) is not null as filled;
select test_helpers.send_test_contract(pg_temp.id('kD'), pg_temp.email('o1')) is not null as sent;

-- ---------- the accepted limitation: a raw trusted terminate leaves the amendment open ----------
select is(pg_temp.contract('kA'), 'active,-,false,true,sent_for_review', 'w13_raw_trusted_terminate_leaves_open_amendment');
select is(test_helpers.attempt(format('update public.worker_contracts set status = %L where id = %L', 'terminated', pg_temp.id('kA'))), 'succeeded',
          'w13_raw_trusted_terminate_leaves_open_amendment');
select is(pg_temp.contract('kA'), 'terminated,trusted_session,true,true,sent_for_review', 'w13_raw_trusted_terminate_leaves_open_amendment');
select isnt(test_helpers.attempt(format('update public.worker_contracts set pending_version_id = null where id = %L', pg_temp.id('kA'))), 'succeeded',
            'w13_raw_trusted_terminate_leaves_open_amendment');

-- ---------- the runbook: close the open amendment with the write flag, then the trusted terminate ----------
select set_config('fx.notices_before', pg_temp.notices('kB')::text, true);
select set_config('fx.events_before', (select coalesce(max(id), 0)::text from public.workforce_audit_events), true);
select set_config('washlink.worker_contract_write', pg_temp.id('kB')::text, true);
select public.worker_contract_close_open_versions(pg_temp.id('kB'));
select set_config('washlink.worker_contract_write', '', true);
update public.worker_contracts set status = 'terminated' where id = pg_temp.id('kB');
select is(pg_temp.contract('kB'), 'terminated,trusted_session,true,false,withdrawn', 'w13_runbook_closes_open_amendment_then_terminates');
select is((select count(*)::int from public.contract_versions where contract_id = pg_temp.id('kB') and state in ('draft', 'sent_for_review')), 0,
          'w13_runbook_closes_open_amendment_then_terminates');

select is(pg_temp.notices('kB'), current_setting('fx.notices_before')::int, 'w13_runbook_end_notifies_nobody_and_is_audited_as_trusted_session');
select is((select string_agg(action || ':' || coalesce(payload ->> 'changed_by', '-') || ':' || actor_kind, ',' order by id)
           from public.workforce_audit_events where subject_id = pg_temp.id('kB') and id > current_setting('fx.events_before')::bigint
             and action like 'worker_contract.%'),
          'worker_contract.withdrawn:trusted_session:trusted_session,worker_contract.terminated:trusted_session:trusted_session',
          'w13_runbook_end_notifies_nobody_and_is_audited_as_trusted_session');

-- ---------- J16: the worker's decline and termination are unaffected ----------
select test_helpers.act_as_worker(pg_temp.email('w3'));
select is((select status from public.decline_worker_contract_version(pg_temp.id('kC'),
             (select pending_version_id from public.my_worker_contracts() where contract_id = pg_temp.id('kC')))), 'active',
          'w13_worker_decline_and_terminate_unaffected_by_runbook');
select is((public.terminate_worker_contract(pg_temp.id('kC'), pg_temp.rev('kC'), 'Moving to another city next month.')).status, 'terminated',
          'w13_worker_decline_and_terminate_unaffected_by_runbook');
select test_helpers.act_as_worker(pg_temp.email('w4'));
select is((select status from public.decline_worker_contract_version(pg_temp.id('kD'),
             (select pending_version_id from public.my_worker_contracts() where contract_id = pg_temp.id('kD')))), 'declined',
          'w13_worker_decline_and_terminate_unaffected_by_runbook');
select test_helpers.act_as_service();
select is(pg_temp.contract('kC') || '|' || pg_temp.contract('kD'), 'terminated,worker,true,false,declined|declined,-,true,false,-',
          'w13_worker_decline_and_terminate_unaffected_by_runbook');

select * from finish();
rollback;
