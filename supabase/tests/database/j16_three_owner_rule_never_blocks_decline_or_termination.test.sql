-- J16 (W10): the three-distinct-owner goal is informational only (D-3, P59, spec F). Declining an offer or an
-- amendment and ending a contract (worker or owner) always succeed, whatever the count, the minimum (also raised to
-- 10) or the relationship state (pending_start, active, suspended, owner_removed). enforcement is fixed by CHECK; only
-- the W10 reads and the setter read workforce_policies; the W9 RPCs are unchanged; the sync path has no RAISE.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j16r-a1@local.test')::text, true);
create temporary table j16r_ids (label text primary key, id uuid) on commit drop;
grant all on j16r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j16r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.cnt(p_worker text) returns integer language sql stable security definer
as $$ select public.worker_distinct_qualifying_owner_count(pg_temp.id(p_worker), null) $$;
create function pg_temp.active(p_label text, p_owner text, p_worker text) returns uuid language plpgsql as $$
declare
  contract_id uuid := test_helpers.create_active_test_contract('j16r-' || p_owner || '@local.test', pg_temp.id('s' || substr(p_owner, 2)),
                                                               pg_temp.id(p_worker), 'j16r-' || p_worker || '@local.test');
begin
  insert into j16r_ids values (p_label, contract_id);
  return contract_id;
end $$;
-- As the worker (or owner), ends the contract; returns the resulting status or the SQLSTATE.
create function pg_temp.end_as(p_actor text, p_label text) returns text language plpgsql as $$
declare
  result text;
begin
  if p_actor like 'w%' then
    perform test_helpers.act_as_worker('j16r-' || p_actor || '@local.test');
  else
    perform test_helpers.act_as_owner('j16r-' || p_actor || '@local.test');
  end if;
  result := test_helpers.attempt(format($t$ select public.terminate_worker_contract(%L, %s, 'Ending this contract for a local test.') $t$,
                                        pg_temp.id(p_label), pg_temp.rev(p_label)));
  perform test_helpers.act_as_service();
  return result || ':' || (select status from public.worker_contracts where id = pg_temp.id(p_label));
end $$;
insert into j16r_ids select 'o' || n, test_helpers.create_owner('j16r-o' || n || '@local.test') from generate_series(1, 5) n;
insert into j16r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j16r-w' || n || '@local.test')) from generate_series(1, 7) n;
insert into j16r_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 5) n;

-- ---------- decline with zero relationships ----------
select test_helpers.create_accepted_application(pg_temp.id('s1'), pg_temp.id('w1'));
insert into j16r_ids values ('c1', test_helpers.create_test_contract_draft('j16r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1')));
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j16r-o1@local.test');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j16r-o1@local.test');
select test_helpers.act_as_worker('j16r-w1@local.test');
select is((public.decline_worker_contract_version(pg_temp.id('c1'), (select pending_version_id from public.my_worker_contracts()))).status,
          'declined', 'j16_worker_declines_offer_with_zero_relationships');
select test_helpers.act_as_service();
select is(pg_temp.cnt('w1') || ',' || test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), '0,none',
          'j16_worker_declines_offer_with_zero_relationships');

-- ---------- terminate the only one, at the minimum, with the minimum raised to 10 ----------
select pg_temp.active('c2', 'o1', 'w2');
select is(pg_temp.end_as('w2', 'c2'), 'succeeded:terminated', 'j16_worker_terminates_only_qualifying_relationship');
select is(pg_temp.cnt('w2'), 0, 'j16_worker_terminates_only_qualifying_relationship');
select pg_temp.active('c3a', 'o1', 'w3'), pg_temp.active('c3b', 'o2', 'w3'), pg_temp.active('c3c', 'o3', 'w3');
select is(pg_temp.cnt('w3'), 3, 'j16_worker_terminates_at_exact_minimum');
select is(pg_temp.end_as('w3', 'c3a'), 'succeeded:terminated', 'j16_worker_terminates_at_exact_minimum');
select is(pg_temp.cnt('w3'), 2, 'j16_worker_terminates_at_exact_minimum');
select test_helpers.act_as_admin('j16r-a1@local.test');
select public.set_workforce_policy_value('minimum_distinct_owners', 10,
  (select revision from public.workforce_policies where policy_key = 'minimum_distinct_owners'), 'Raised to the maximum for a local test.');
select test_helpers.act_as_service();
select is(pg_temp.end_as('w3', 'c3b'), 'succeeded:terminated', 'j16_worker_terminates_with_minimum_raised_to_ten');
select is(pg_temp.cnt('w3'), 1, 'j16_worker_terminates_with_minimum_raised_to_ten');

-- ---------- decline an amendment below the minimum; the owner ends regardless ----------
select test_helpers.act_as_owner('j16r-o3@local.test');
select public.create_worker_contract_amendment(pg_temp.id('c3c'), pg_temp.rev('c3c'));
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c3c'), 'j16r-o3@local.test', '{"schedule": "Weekends only for the season."}');
select test_helpers.send_test_contract(pg_temp.id('c3c'), 'j16r-o3@local.test');
select test_helpers.act_as_worker('j16r-w3@local.test');
select is((select row(c.status, c.pending_version_id is null)::text
           from public.decline_worker_contract_version(pg_temp.id('c3c'), (select pending_version_id from public.my_worker_contracts()
                                                                            where contract_id = pg_temp.id('c3c'))) c),
          '(active,t)', 'j16_worker_declines_amendment_below_minimum');
select test_helpers.act_as_service();
select is(pg_temp.cnt('w3'), 1, 'j16_worker_declines_amendment_below_minimum');
select is(pg_temp.end_as('o3', 'c3c'), 'succeeded:terminated', 'j16_owner_terminates_regardless_of_worker_count');
select is(pg_temp.cnt('w3'), 0, 'j16_owner_terminates_regardless_of_worker_count');

-- ---------- every relationship state ----------
insert into j16r_ids values ('c4', test_helpers.create_accepted_test_contract('j16r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w4'), 'j16r-w4@local.test'));
select pg_temp.active('c5', 'o2', 'w5'), pg_temp.active('c6', 'o4', 'w6'), pg_temp.active('c7', 'o5', 'w7');
select test_helpers.act_as_admin('j16r-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s4');
select test_helpers.act_as_service();
delete from auth.users where id = pg_temp.id('o5');
select is(array[split_part(test_helpers.relationship_row(pg_temp.id('w4'), pg_temp.id('o1')), ',', 1),
                split_part(test_helpers.relationship_row(pg_temp.id('w5'), pg_temp.id('o2')), ',', 1),
                split_part(test_helpers.relationship_row(pg_temp.id('w6'), pg_temp.id('o4')), ',', 1),
                (select status from public.worker_owner_relationships where worker_id = pg_temp.id('w7'))],
          array['pending_start', 'active', 'suspended', 'owner_removed'], 'j16_terminate_succeeds_in_every_relationship_state');
select is(array[pg_temp.end_as('w4', 'c4'), pg_temp.end_as('w5', 'c5'), pg_temp.end_as('w6', 'c6'), pg_temp.end_as('w7', 'c7')],
          array_fill('succeeded:terminated'::text, array[4]), 'j16_terminate_succeeds_in_every_relationship_state');

-- ---------- static checks ----------
select ok((select pg_get_constraintdef(oid) = 'CHECK ((enforcement = ''informational''::text))' from pg_constraint
           where conrelid = 'public.workforce_policies'::regclass and conname = 'wp_enforcement_check')
          and test_helpers.attempt('update public.workforce_policies set enforcement = ''blocking''') = '42501',
          'j16_policy_enforcement_check_refuses_anything_but_informational');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.prosrc ~* '(from|join|update|into)\s+(public\.)?workforce_policies'),
          array['my_owner_relationship_progress', 'set_workforce_policy_value'], 'j16_only_w10_reads_and_setter_reference_workforce_policies');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') like 'W9:%'
           and pg_get_functiondef(p.oid) ~* '(workforce_polic|worker_owner_relationship)'), 0, 'j16_w9_decline_terminate_rpcs_unchanged_by_w10');
select is((select count(*)::int from pg_proc p where p.oid in ('public.worker_contracts_sync_owner_relationship()'::regprocedure,
             'public.refresh_worker_owner_relationship(uuid, uuid, date)'::regprocedure, 'public.worker_owner_relationship_derive(uuid, uuid, date)'::regprocedure,
             'public.worker_contract_qualifies(uuid, date)'::regprocedure, 'public.shops_sync_owner_relationships()'::regprocedure,
             'public.profiles_sync_owner_relationships()'::regprocedure, 'public.worker_owner_relationships_audit()'::regprocedure)
           and p.prosrc !~* '\mraise\M')
          + (select count(*)::int from pg_trigger t where not t.tgisinternal and t.tgfoid in ('public.worker_contracts_sync_owner_relationship()'::regprocedure,
             'public.shops_sync_owner_relationships()'::regprocedure, 'public.profiles_sync_owner_relationships()'::regprocedure,
             'public.worker_owner_relationships_audit()'::regprocedure) and (t.tgtype & 2) = 0),
          11, 'j16_no_trigger_on_contracts_raises_for_relationship_state');

select * from finish();
rollback;
