-- J14 (W10): several contracts, shops or amendments with ONE owner count once (P57); exactly one relationship row per
-- (worker, owner), reused after a termination; a trusted session cannot insert a duplicate. Contracts, amendments and
-- acceptances go through the real W9 RPCs. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j14r-a1@local.test')::text, true);
create temporary table j14r_ids (label text primary key, id uuid) on commit drop;
grant all on j14r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j14r_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
create function pg_temp.count_of(p_worker text) returns integer language sql stable
as $$ select public.worker_distinct_qualifying_owner_count(pg_temp.id(p_worker), null) $$;
create function pg_temp.rel_id(p_worker text, p_owner text) returns uuid language sql stable
as $$ select id from public.worker_owner_relationships where worker_id = pg_temp.id(p_worker) and owner_id = pg_temp.id(p_owner) $$;
create function pg_temp.rel_rev(p_worker text, p_owner text) returns integer language sql stable
as $$ select revision from public.worker_owner_relationships where worker_id = pg_temp.id(p_worker) and owner_id = pg_temp.id(p_owner) $$;
insert into j14r_ids select 'o' || n, test_helpers.create_owner('j14r-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j14r_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j14r-w' || n || '@local.test')) from generate_series(1, 2) n;
insert into j14r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1'))),
  ('s1b', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.fx('a1'))), ('s2', test_helpers.create_verified_shop(pg_temp.id('o2'), pg_temp.fx('a1')));
insert into j14r_ids values ('c1', test_helpers.create_active_test_contract('j14r-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j14r-w1@local.test')),
  ('c1b', test_helpers.create_active_test_contract('j14r-o1@local.test', pg_temp.id('s1b'), pg_temp.id('w1'), 'j14r-w1@local.test'));

-- ---------- two shops of one owner ----------
select is(pg_temp.count_of('w1'), 1, 'j14_two_shops_same_owner_two_active_contracts_count_once');
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), 'active,contract_active,2',
          'j14_two_shops_same_owner_two_active_contracts_count_once');
select is((select count(*)::int from public.worker_owner_relationships where worker_id = pg_temp.id('w1')), 1,
          'j14_relationship_row_unique_per_worker_and_owner');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.worker_owner_relationships'::regclass and conname = 'wor_worker_owner_unique'
                  and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (worker_id, owner_id)'), 'j14_relationship_row_unique_per_worker_and_owner');
insert into j14r_ids values ('rel1', pg_temp.rel_id('w1', 'o1'));
select set_config('fx.rel1_rev', pg_temp.rel_rev('w1', 'o1')::text, true);

-- ---------- a pending amendment changes nothing ----------
select test_helpers.act_as_owner('j14r-o1@local.test');
select public.create_worker_contract_amendment(pg_temp.id('c1'), pg_temp.rev('c1'));
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c1'), 'j14r-o1@local.test', '{"schedule": "Weekends only for the season."}');
select test_helpers.send_test_contract(pg_temp.id('c1'), 'j14r-o1@local.test');
select is(pg_temp.count_of('w1') || ',' || test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')) || ',' || pg_temp.rel_rev('w1', 'o1'),
          '1,active,contract_active,2,' || current_setting('fx.rel1_rev'), 'j14_pending_amendment_does_not_change_count');

-- ---------- an accepted amendment keeps the count and the single row ----------
select test_helpers.accept_test_contract(pg_temp.id('c1'), 'j14r-w1@local.test');
select is((select count(*)::int from public.contract_versions where contract_id = pg_temp.id('c1') and state = 'accepted'), 1,
          'j14_accepted_amendment_keeps_count_and_single_row');
select is(array[pg_temp.count_of('w1')::text, test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')),
                (pg_temp.rel_id('w1', 'o1') = pg_temp.id('rel1'))::text,
                (select count(*)::text from public.worker_owner_relationships where worker_id = pg_temp.id('w1'))],
          array['1', 'active,contract_active,2', 'true', '1'], 'j14_accepted_amendment_keeps_count_and_single_row');

-- ---------- one verified shop of the owner is enough ----------
select test_helpers.act_as_admin('j14r-a1@local.test');
update public.shops set verification_status = 'changes_requested' where id = pg_temp.id('s1b');
select test_helpers.act_as_service();
select is(pg_temp.count_of('w1') || ',' || test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')), '1,active,contract_active,1',
          'j14_one_verified_shop_of_owner_suffices_when_other_unverified');
select is(test_helpers.relationship_live(pg_temp.id('w1'), pg_temp.id('o1')), test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o1')),
          'j14_one_verified_shop_of_owner_suffices_when_other_unverified');

-- ---------- a new contract after a termination reuses the same row ----------
insert into j14r_ids values ('c2', test_helpers.create_active_test_contract('j14r-o2@local.test', pg_temp.id('s2'), pg_temp.id('w2'), 'j14r-w2@local.test'));
insert into j14r_ids values ('rel2', pg_temp.rel_id('w2', 'o2'));
select test_helpers.act_as_worker('j14r-w2@local.test');
select public.terminate_worker_contract(pg_temp.id('c2'), pg_temp.rev('c2'), 'Moving to another city for family.');
select test_helpers.act_as_service();
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o2')), 'ended,contract_terminated,0',
          'j14_new_contract_after_termination_reuses_same_relationship_row');
insert into j14r_ids values ('c2b', test_helpers.create_accepted_test_contract('j14r-o2@local.test', pg_temp.id('s2'), pg_temp.id('w2'), 'j14r-w2@local.test'));
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o2')) || ',' || (pg_temp.rel_id('w2', 'o2') = pg_temp.id('rel2')),
          'pending_start,contract_accepted_not_started,0,true', 'j14_new_contract_after_termination_reuses_same_relationship_row');
select test_helpers.act_as_owner('j14r-o2@local.test');
select public.activate_worker_contract(pg_temp.id('c2b'), pg_temp.rev('c2b'));
select test_helpers.act_as_service();
select is(test_helpers.relationship_row(pg_temp.id('w2'), pg_temp.id('o2')) || ',' || (pg_temp.rel_id('w2', 'o2') = pg_temp.id('rel2'))
          || ',' || (select count(*) from public.worker_owner_relationships where worker_id = pg_temp.id('w2')),
          'active,contract_active,1,true,1', 'j14_new_contract_after_termination_reuses_same_relationship_row');

-- ---------- a trusted session cannot insert a (duplicate) relationship ----------
create function pg_temp.insert_copy() returns text language sql as $$
  select test_helpers.attempt(format($i$ insert into public.worker_owner_relationships (worker_id, owner_id, owner_name_snapshot,
    worker_name_snapshot, status, status_reason, qualifying_contract_count, first_accepted_at)
    values (%L, %L, 'Copy', 'Copy', 'active', 'contract_active', 1, now()) $i$, pg_temp.id('w1'), pg_temp.id('o1'))) $$;
select is(pg_temp.insert_copy(), '42501', 'j14_trusted_duplicate_relationship_insert_refused');
select set_config('washlink.owner_relationship_write', pg_temp.id('w1')::text || ':' || pg_temp.id('o1')::text, true);
select is(pg_temp.insert_copy(), '23505', 'j14_trusted_duplicate_relationship_insert_refused');
select set_config('washlink.owner_relationship_write', '', true);
select is((select count(*)::int from public.worker_owner_relationships where worker_id = pg_temp.id('w1')), 1,
          'j14_trusted_duplicate_relationship_insert_refused');

select * from finish();
rollback;
