-- J18 (W10): retention flows and unchanged existing flows with the W10 sync triggers on worker_contracts, shops and
-- profiles. Owner account deletion keeps the worker's relationship as owner_removed (name snapshot kept, not
-- counted); worker account deletion removes the worker's relationships (audited) and keeps accepted contracts for the
-- owner; the shop verification review, bookings / quotes / ratings and the W9 contract lifecycle are unchanged.
-- Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------- fixtures ----------
select set_config('fx.a1', test_helpers.create_super_admin('j18w-a1@local.test')::text, true);
select set_config('fx.cu', test_helpers.create_customer('j18w-cu@local.test')::text, true);
create temporary table j18w_ids (label text primary key, id uuid) on commit drop;
grant all on j18w_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18w_ids where label = p_label $$;
create function pg_temp.fx(p_name text) returns uuid language sql stable as $$ select current_setting('fx.' || p_name)::uuid $$;
create function pg_temp.rev(p_label text) returns integer language sql stable security definer
as $$ select revision from public.worker_contracts where id = pg_temp.id(p_label) $$;
insert into j18w_ids select 'o' || n, test_helpers.create_owner('j18w-o' || n || '@local.test') from generate_series(1, 4) n;
insert into j18w_ids select 'w' || n, test_helpers.create_worker_profile(test_helpers.create_worker('j18w-w' || n || '@local.test')) from generate_series(1, 3) n;
insert into j18w_ids select 's' || n, test_helpers.create_verified_shop(pg_temp.id('o' || n), pg_temp.fx('a1')) from generate_series(1, 3) n;
insert into j18w_ids values ('s4', test_helpers.create_shop(pg_temp.id('o4'), 'pending'));
insert into j18w_ids values ('c1', test_helpers.create_active_test_contract('j18w-o1@local.test', pg_temp.id('s1'), pg_temp.id('w1'), 'j18w-w1@local.test')),
  ('c2', test_helpers.create_active_test_contract('j18w-o2@local.test', pg_temp.id('s2'), pg_temp.id('w1'), 'j18w-w1@local.test')),
  ('c3', test_helpers.create_active_test_contract('j18w-o2@local.test', pg_temp.id('s2'), pg_temp.id('w2'), 'j18w-w2@local.test'));

-- ---------- owner account deletion ----------
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('o1')), 'j18_w10_owner_account_deletion_keeps_worker_relationship_as_owner_removed');
select test_helpers.act_as_worker('j18w-w1@local.test');
select is((select array_agg(owner_name || ':' || status || ':' || owner_removed || ':' || counts_toward_goal order by status)
           from public.my_owner_relationships()),
          array['Local Test Owner:active:false:true', 'Local Test Owner:owner_removed:true:false'],
          'j18_w10_owner_account_deletion_keeps_worker_relationship_as_owner_removed');
select is((select qualifying_owner_count || ',' || remaining_owner_count from public.my_owner_relationship_progress())
          || ',' || (select count(*) from public.my_worker_contracts()), '1,2,2',
          'j18_w10_owner_account_deletion_keeps_worker_relationship_as_owner_removed');
select test_helpers.act_as_service();

-- ---------- worker account deletion ----------
insert into j18w_ids values ('rel3', (select id from public.worker_owner_relationships where worker_id = pg_temp.id('w2')));
select lives_ok(format('delete from auth.users where id = %L', pg_temp.id('w2')), 'j18_w10_worker_account_deletion_removes_relationships_and_audits');
select is((select count(*)::int from public.worker_owner_relationships where id = pg_temp.id('rel3') or worker_id = pg_temp.id('w2')), 0,
          'j18_w10_worker_account_deletion_removes_relationships_and_audits');
select is((select payload - 'relationship_id' - 'worker_id' - 'owner_id' from public.workforce_audit_events
           where action = 'worker_owner_relationship.deleted' and subject_id = pg_temp.id('rel3')),
          '{"deleted_by": "worker_account_deleted", "from_status": "active"}'::jsonb, 'j18_w10_worker_account_deletion_removes_relationships_and_audits');
select is((select status || ',' || (worker_id is null) from public.worker_contracts where id = pg_temp.id('c3')), 'active,true',
          'j18_w10_worker_account_deletion_removes_relationships_and_audits');
select test_helpers.act_as_owner('j18w-o2@local.test');
select is((select string_agg(worker_name || ':' || status, ',') from public.owner_worker_relationships()), 'Local Test Worker:active',
          'j18_w10_worker_account_deletion_removes_relationships_and_audits');

-- ---------- shop verification review with the sync trigger ----------
select test_helpers.act_as_admin('j18w-a1@local.test');
select lives_ok(format('update public.shops set verification_status = %L where id = %L', 'approved', pg_temp.id('s4')),
                'j18_w10_shop_verification_review_flow_unchanged_with_sync_trigger');
select lives_ok(format('update public.shops set verification_status = %L, verification_notes = %L where id = %L', 'changes_requested',
                       'Please upload a clearer permit.', pg_temp.id('s2')), 'j18_w10_shop_verification_review_flow_unchanged_with_sync_trigger');
select test_helpers.act_as_service();
select is((select array_agg(row(verification_status, verification_reviewed_by = pg_temp.fx('a1'), public.shop_has_recorded_verification(id))::text order by name)
           from public.shops where id in (pg_temp.id('s2'), pg_temp.id('s4'))) @> array['(approved,t,t)', '(changes_requested,t,f)']
          and (select count(*) from public.workforce_audit_events where action = 'shop.verification_decided'
               and subject_id in (pg_temp.id('s2'), pg_temp.id('s4'))) = 2,
          true, 'j18_w10_shop_verification_review_flow_unchanged_with_sync_trigger');
select is(test_helpers.relationship_row(pg_temp.id('w1'), pg_temp.id('o2')), 'suspended,owner_verification_not_current,0',
          'j18_w10_shop_verification_review_flow_unchanged_with_sync_trigger');

-- ---------- bookings, quotes and ratings ----------
select test_helpers.set_shop_price(pg_temp.id('s3'), 'Sedan', 'Basic Wash', 250.00);
select test_helpers.act_as_customer('j18w-cu@local.test');
select lives_ok(format($$ insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time, shop_id)
                         values ('J18 W10', %L, 'Sedan', 'Basic Wash', 'Test address', now() + interval '2 days', %L) $$, pg_temp.fx('cu'), pg_temp.id('s3')),
                'j18_w10_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
update public.bookings set booking_status = 'completed' where customer_name = 'J18 W10';
select test_helpers.act_as_customer('j18w-cu@local.test');
select lives_ok($$ update public.bookings set customer_rating_stars = 5 where customer_name = 'J18 W10' $$,
                'j18_w10_booking_quote_rating_and_verification_unchanged');
select test_helpers.act_as_service();
select is((select quoted_price::text || ',' || customer_rating_stars from public.bookings where customer_name = 'J18 W10'), '250.00,5',
          'j18_w10_booking_quote_rating_and_verification_unchanged');

-- ---------- W9 lifecycle unchanged ----------
insert into j18w_ids values ('c4', test_helpers.create_active_test_contract('j18w-o3@local.test', pg_temp.id('s3'), pg_temp.id('w3'), 'j18w-w3@local.test'));
select test_helpers.act_as_owner('j18w-o3@local.test');
select public.create_worker_contract_amendment(pg_temp.id('c4'), pg_temp.rev('c4'));
select test_helpers.act_as_service();
select test_helpers.fill_test_contract_draft(pg_temp.id('c4'), 'j18w-o3@local.test', '{"schedule": "Weekends only for the season."}');
select test_helpers.send_test_contract(pg_temp.id('c4'), 'j18w-o3@local.test');
select test_helpers.accept_test_contract(pg_temp.id('c4'), 'j18w-w3@local.test');
select test_helpers.act_as_worker('j18w-w3@local.test');
select public.terminate_worker_contract(pg_temp.id('c4'), pg_temp.rev('c4'), 'Moving to another province soon.');
select test_helpers.act_as_service();
select is((select array_agg(replace(action, 'worker_contract.', '') order by id) from public.workforce_audit_events
           where subject_type = 'worker_contract' and subject_id = pg_temp.id('c4')),
          array['created', 'sent', 'accepted', 'activated', 'amendment_created', 'sent', 'accepted', 'terminated'], 'j18_w10_w9_contract_lifecycle_unchanged');
select is((select status || ',' || ended_by || ',' || (select count(*) from public.contract_versions v where v.contract_id = c.id)
           from public.worker_contracts c where c.id = pg_temp.id('c4')) || ',' || test_helpers.relationship_row(pg_temp.id('w3'), pg_temp.id('o3')),
          'terminated,worker,2,ended,contract_terminated,0', 'j18_w10_w9_contract_lifecycle_unchanged');

select * from finish();
rollback;
