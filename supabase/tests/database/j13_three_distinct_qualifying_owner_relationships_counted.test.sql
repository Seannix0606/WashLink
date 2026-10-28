-- J13 (W10): the worker's progress toward the informational three-distinct-owner goal counts DISTINCT verified owners
-- with an active, qualifying contract (P56, P57; D-3), live from the contracts; count and remaining come from
-- workforce_policies (default 3); remaining is never negative. Contracts are created through the real W9 RPCs.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j13r-a1@local.test')::text, true);
create temporary table j13r_ids (label text primary key, id uuid) on commit drop;
grant all on j13r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j13r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.progress() returns text language sql stable as $$
  select coalesce((select row(minimum_distinct_owners, default_minimum, qualifying_owner_count, remaining_owner_count, goal_reached, enforcement)::text
                   from public.my_owner_relationship_progress()), 'no row') $$;
create function pg_temp.active(p_label text, p_owner text, p_shop text, p_worker text) returns uuid language plpgsql as $$
declare
  contract_id uuid := test_helpers.create_active_test_contract('j13r-' || p_owner || '@local.test', pg_temp.id(p_shop), pg_temp.id(p_worker),
                                                               'j13r-' || p_worker || '@local.test');
begin
  insert into j13r_ids values (p_label, contract_id);
  return contract_id;
end $$;
insert into j13r_ids select 'o' || n, test_helpers.create_owner('j13r-o' || n || '@local.test') from generate_series(1, 4) n;
insert into j13r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j13r-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j13r_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 4) n;
insert into j13r_ids values ('s1b', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1')));

-- ---------- counting ----------
select test_helpers.act_as_worker('j13r-w1@local.test');
select is(pg_temp.progress(), '(3,3,0,3,f,informational)', 'j13_no_relationships_count_zero_remaining_three');
select test_helpers.act_as_service();
select pg_temp.active('c1', 'o1', 's1', 'w1');
select test_helpers.act_as_worker('j13r-w1@local.test');
select is(pg_temp.progress(), '(3,3,1,2,f,informational)', 'j13_one_active_contract_counts_one_remaining_two');
select test_helpers.act_as_service();
select pg_temp.active('c2', 'o2', 's2', 'w1'), pg_temp.active('c3', 'o3', 's3', 'w1');
select test_helpers.act_as_worker('j13r-w1@local.test');
select is(pg_temp.progress(), '(3,3,3,0,t,informational)', 'j13_three_distinct_verified_owners_count_three_goal_reached');
select is((select array_agg(status || ':' || counts_toward_goal order by status) from public.my_owner_relationships()),
          array['active:true', 'active:true', 'active:true'], 'j13_three_distinct_verified_owners_count_three_goal_reached');
select test_helpers.act_as_service();
select pg_temp.active('c4', 'o4', 's4', 'w1');
select test_helpers.act_as_worker('j13r-w1@local.test');
select is(pg_temp.progress(), '(3,3,4,0,t,informational)', 'j13_fourth_owner_counts_four_remaining_zero_not_negative');

-- ---------- an owner whose shop verification is no longer recorded does not count ----------
select test_helpers.act_as_admin('j13r-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s4');
select test_helpers.act_as_worker('j13r-w1@local.test');
select is(pg_temp.progress(), '(3,3,3,0,t,informational)', 'j13_unverified_owner_shop_not_counted');
select test_helpers.act_as_service();
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o4')), 'suspended,owner_verification_not_current,0',
          'j13_unverified_owner_shop_not_counted');

-- ---------- distinct owner ids, not contracts, shops or rows ----------
select pg_temp.active('c5', 'o1', 's1b', 'w1');
select is(array[public.worker_distinct_qualifying_owner_count(pg_temp.id('w1'), null),
                (select count(*)::int from public.worker_contracts c where c.worker_id = pg_temp.id('w1')
                   and public.worker_contract_qualifies(c.id, null)),
                (select count(*)::int from public.worker_owner_relationships where worker_id = pg_temp.id('w1'))],
          array[3, 4, 4], 'j13_count_uses_distinct_owner_ids_not_rows');
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), 'active,contract_active,2', 'j13_count_uses_distinct_owner_ids_not_rows');

-- ---------- the minimum comes from workforce_policies ----------
select set_config('fx.policy', (select row(integer_value, default_value, revision)::text from public.workforce_policies
                                 where policy_key = 'minimum_distinct_owners'), true);
select test_helpers.act_as_worker('j13r-w2@local.test');
select is((select row(minimum_distinct_owners, default_minimum, policy_revision)::text from public.my_owner_relationship_progress()),
          current_setting('fx.policy'), 'j13_policy_minimum_read_from_workforce_policies_default_three');
select test_helpers.act_as_admin('j13r-a1@local.test');
select public.set_workforce_policy_value('minimum_distinct_owners', 5,
  (select revision from public.workforce_policies where policy_key = 'minimum_distinct_owners'), 'Raised for a local test run.');
select test_helpers.act_as_worker('j13r-w1@local.test');
select is(pg_temp.progress(), '(5,3,3,2,f,informational)', 'j13_policy_change_updates_remaining_not_count');

-- ---------- the read equals the live count function ----------
select test_helpers.act_as_worker('j13r-w1@local.test');
create temporary table j13r_read on commit drop as select qualifying_owner_count, counted_as_of from public.my_owner_relationship_progress();
select test_helpers.act_as_service();
select is((select qualifying_owner_count || ',' || counted_as_of from j13r_read),
          public.worker_distinct_qualifying_owner_count(pg_temp.id('w1'), null) || ',' || test_helpers.manila_today(),
          'j13_progress_read_matches_live_count_function');

select * from finish();
rollback;
