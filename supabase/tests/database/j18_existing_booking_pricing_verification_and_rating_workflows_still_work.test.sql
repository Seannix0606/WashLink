-- J18 roll-up (W13 PLAN section 6 test 2, section 8): the existing booking, pricing, shop verification and rating
-- workflows still work after all 97 migrations, with workforce data present: a roster-linked worker who holds an active
-- contract and a shop-issued certificate at the shop, and a trainee in required training at the same shop. Every step uses
-- the same writes the frontend sends (the j18_existing_flows payloads); per-increment detail stays in j18_existing_flows
-- and the j18_w<n>_* files. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create temporary table j18r_ids (label text primary key, id uuid) on commit drop;
grant all on j18r_ids to public;
create function pg_temp.id(p_label text) returns uuid language sql stable as $$ select id from j18r_ids where label = p_label $$;
create function pg_temp.booking(p_label text) returns text language sql stable security definer as $$
  select b.booking_status || ',' || coalesce(b.quoted_price::text, '-') || ',' || coalesce(b.assigned_worker_id::text, '-') || ','
         || coalesce(b.customer_rating_stars::text, '-') from public.bookings b where b.id = pg_temp.id(p_label) $$;
insert into j18r_ids values ('a1', test_helpers.create_super_admin('j18r-a1@local.test')), ('c1', test_helpers.create_customer('j18r-c1@local.test')),
                            ('c2', test_helpers.create_customer('j18r-c2@local.test'));
insert into j18r_ids select 'o' || n, test_helpers.create_owner('j18r-o' || n || '@local.test') from generate_series(1, 2) n;
insert into j18r_ids values ('wk', test_helpers.create_worker_profile(test_helpers.create_worker('j18r-wk@local.test'))),
                            ('wt', test_helpers.create_worker_profile(test_helpers.create_worker('j18r-wt@local.test')));
insert into j18r_ids values ('s1', test_helpers.create_verified_shop(pg_temp.id('o1'), pg_temp.id('a1')));
insert into j18r_ids values ('s2', test_helpers.create_shop(pg_temp.id('o2'), 'changes_requested'));
select test_helpers.set_shop_price(pg_temp.id('s1'), 'Sedan', 'Basic Wash', 250.00);
-- Workforce data at s1: wk is roster-linked, certified (completed training + issue) and under an active contract;
-- wt is roster-linked and mid-way through required training (accepted enrollment, not completed).
insert into j18r_ids values ('rk', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('wk'))),
                            ('rt', test_helpers.create_roster_worker(pg_temp.id('o1'), pg_temp.id('wt')));
insert into j18r_ids values ('cert', test_helpers.issue_test_certification(pg_temp.id('s1'), pg_temp.id('wk'), 'j18r-o1@local.test'));
insert into j18r_ids values ('k1', test_helpers.create_active_test_contract('j18r-o1@local.test', pg_temp.id('s1'), pg_temp.id('wk'), 'j18r-wk@local.test'));
insert into j18r_ids values ('p1', test_helpers.create_training_program(pg_temp.id('s1')));
select count(test_helpers.add_training_session(pg_temp.id('p1'), test_helpers.manila_today() + n)) as sessions from generate_series(1, 3) n;
select test_helpers.open_training_program(pg_temp.id('p1')) is not null as opened;
insert into j18r_ids values ('et', test_helpers.create_accepted_enrollment(pg_temp.id('p1'), pg_temp.id('wt')));
insert into j18r_ids values ('b1', gen_random_uuid()), ('b2', test_helpers.create_booking_fixture(pg_temp.id('c1'), pg_temp.id('s1')));
select ok((select count(*) from supabase_migrations.schema_migrations) = 97
          and (select status from public.worker_contracts where id = pg_temp.id('k1')) = 'active'
          and (select status from public.certifications where id = pg_temp.id('cert')) = 'active'
          and (select status from public.training_enrollments where id = pg_temp.id('et')) = 'accepted',
          'j18_customer_books_with_server_quote');

-- ---------- the customer books; the server sets the quote ----------
select test_helpers.act_as_customer('j18r-c1@local.test');
select lives_ok($$
  insert into public.bookings (id, customer_name, vehicle_type, service_type, address, time, booking_status, customer_id, shop_id,
                               latitude, longitude, customer_notes, quoted_price)
  values (pg_temp.id('b1'), 'J18 Roll-up Customer', 'Sedan', 'Basic Wash', 'J18 roll-up address', now() + interval '1 day', 'pending',
          auth.uid(), pg_temp.id('s1'), 14.5995, 120.9842, 'Gate code at the guard house', 1.00)
$$, 'j18_customer_books_with_server_quote');
select is(pg_temp.booking('b1'), 'pending,250.00,-,-', 'j18_customer_books_with_server_quote');

-- ---------- the owner accepts and assigns the contracted, certified roster worker ----------
select test_helpers.act_as_owner('j18r-o1@local.test');
select lives_ok($$ update public.bookings set booking_status = 'accepted' where id = pg_temp.id('b1') $$,
                'j18_owner_accepts_booking_and_assigns_contracted_roster_worker');
select lives_ok($$ update public.bookings set assigned_worker_id = pg_temp.id('rk') where id = pg_temp.id('b1') $$,
                'j18_owner_accepts_booking_and_assigns_contracted_roster_worker');
select is(pg_temp.booking('b1'), 'accepted,250.00,' || pg_temp.id('rk') || ',-', 'j18_owner_accepts_booking_and_assigns_contracted_roster_worker');

-- ---------- the assigned worker completes it ----------
select test_helpers.act_as_worker('j18r-wk@local.test');
select lives_ok($$ update public.bookings set booking_status = 'in_progress' where id = pg_temp.id('b1') and assigned_worker_id = pg_temp.id('rk') $$,
                'j18_assigned_worker_completes_booking');
select lives_ok($$ update public.bookings set booking_status = 'completed' where id = pg_temp.id('b1') and assigned_worker_id = pg_temp.id('rk') $$,
                'j18_assigned_worker_completes_booking');
select is(pg_temp.booking('b1'), 'completed,250.00,' || pg_temp.id('rk') || ',-', 'j18_assigned_worker_completes_booking');

-- ---------- the customer rates once ----------
select test_helpers.act_as_customer('j18r-c1@local.test');
select lives_ok($$
  update public.bookings set customer_rating_stars = 5, customer_rating_comment = 'Great', customer_rated_at = now()
  where id = pg_temp.id('b1') and customer_id = auth.uid() and booking_status = 'completed' and customer_rating_stars is null
$$, 'j18_customer_rates_completed_booking_once');
select is(test_helpers.attempt(format('update public.bookings set customer_rating_stars = 1 where id = %L', pg_temp.id('b1'))), '42501',
          'j18_customer_rates_completed_booking_once');
select test_helpers.act_as_customer('j18r-c2@local.test');
select test_helpers.attempt(format('update public.bookings set customer_rating_stars = 2 where id = %L', pg_temp.id('b1'))) is not null as foreign_rate;
select test_helpers.act_as_service();
select is(pg_temp.booking('b1'), 'completed,250.00,' || pg_temp.id('rk') || ',5', 'j18_customer_rates_completed_booking_once');

-- ---------- pricing: own shop only ----------
select test_helpers.act_as_owner('j18r-o1@local.test');
select lives_ok($$ insert into public.shop_pricing (shop_id, vehicle_type, service_type, price) values (pg_temp.id('s1'), 'SUV', 'Basic Wash', 300.00) $$,
                'j18_owner_manages_own_pricing_only');
select test_helpers.act_as_owner('j18r-o2@local.test');
select throws_ok(format($$ insert into public.shop_pricing (shop_id, vehicle_type, service_type, price) values (%L, 'Pickup', 'Wax', 99.00) $$,
                        pg_temp.id('s1')), '42501', null, 'j18_owner_manages_own_pricing_only');
select test_helpers.attempt(format($$ update public.shop_pricing set price = 1.00 where shop_id = %L $$, pg_temp.id('s1'))) is not null as foreign_price;
select test_helpers.act_as_service();
select is((select string_agg(vehicle_type || ':' || price, ',' order by vehicle_type) from public.shop_pricing where shop_id = pg_temp.id('s1')),
          'Sedan:250.00,SUV:300.00', 'j18_owner_manages_own_pricing_only');

-- ---------- shop verification: submit, review, resubmit, approve ----------
select test_helpers.act_as_owner('j18r-o2@local.test');
select is((select verification_status from public.submit_shop_for_verification(pg_temp.id('s2'))), 'pending',
          'j18_shop_verification_submit_review_and_resubmit');
select throws_ok(format($$ update public.shops set verification_status = 'approved' where id = %L $$, pg_temp.id('s2')), 'P0001',
                 'Only super admins can change verification status or notes.', 'j18_shop_verification_submit_review_and_resubmit');
select test_helpers.act_as_admin('j18r-a1@local.test');
select lives_ok(format($$ update public.shops set verification_status = 'changes_requested', verification_notes = 'Upload a clearer permit.',
                          verification_reviewed_at = now(), verification_reviewed_by = auth.uid() where id = %L $$, pg_temp.id('s2')),
                'j18_shop_verification_submit_review_and_resubmit');
select test_helpers.act_as_owner('j18r-o2@local.test');
select is((select verification_status from public.submit_shop_for_verification(pg_temp.id('s2'))), 'pending',
          'j18_shop_verification_submit_review_and_resubmit');
select test_helpers.act_as_admin('j18r-a1@local.test');
select lives_ok(format($$ update public.shops set verification_status = 'approved', verification_notes = null, verification_reviewed_at = now(),
                          verification_reviewed_by = auth.uid() where id = %L $$, pg_temp.id('s2')),
                'j18_shop_verification_submit_review_and_resubmit');
select test_helpers.act_as_service();
select is((select verification_status || ',' || (verification_reviewed_by = pg_temp.id('a1')) || ',' || public.shop_has_recorded_verification(id)
           from public.shops where id = pg_temp.id('s2')), 'approved,true,true', 'j18_shop_verification_submit_review_and_resubmit');

-- ---------- the training gate still holds a trainee in required training ----------
select test_helpers.act_as_owner('j18r-o1@local.test');
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('rt'), pg_temp.id('b2'))), '23514',
          'j18_trainee_still_not_assignable_during_required_training');
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('rk'), pg_temp.id('b2'))), 'succeeded',
          'j18_trainee_still_not_assignable_during_required_training');

-- ---------- W15 (F-C2): ending the trainee's link does not re-open assignment (the verifier probe) ----------
select is(test_helpers.attempt(format('update public.bookings set assigned_worker_id = null where id = %L', pg_temp.id('b2'))) || ','
          || test_helpers.attempt(format('update public.workers set user_id = null where id = %L', pg_temp.id('rt'))) || ','
          || test_helpers.attempt(format('update public.bookings set assigned_worker_id = %L where id = %L', pg_temp.id('rt'), pg_temp.id('b2'))),
          'succeeded,succeeded,23514', 'j18_trainee_not_assignable_after_owner_unlink');
select is((select user_id is null from public.workers where id = pg_temp.id('rt')), true, 'j18_trainee_not_assignable_after_owner_unlink');

-- ---------- the booking tables gained no workforce columns ----------
select test_helpers.act_as_service();
select is((select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'bookings'),
          'id,customer_name,customer_id,vehicle_type,service_type,address,time,booking_status,created_at,assigned_worker_id,shop_id,latitude,longitude,'
          || 'quoted_price,customer_notes,customer_rating_stars,customer_rating_comment,customer_rated_at', 'j18_booking_tables_gain_no_workforce_columns');
select is((select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'shop_pricing')
          || '|' || (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'workers'),
          'id,shop_id,vehicle_type,service_type,price,created_at,updated_at|id,owner_id,user_id,name,phone_number,is_available,created_at,updated_at',
          'j18_booking_tables_gain_no_workforce_columns');

select * from finish();
rollback;
