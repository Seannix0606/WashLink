-- J17: authorization harness. The baseline reproduces E1, E2, E3, E5, S1, S2 and S9 on
-- purpose; the W1 todo wrappers around those assertions were removed in W2 (the W2
-- migrations close them). Assertions are unchanged and check the outcome only, so a fix
-- may either raise or silently filter (test_helpers.attempt). More W2 J17 tests live in
-- j17_w2_shop_booking_guards.test.sql and j17_w2_worker_data_guards.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_customer('j17-c1@local.test')::text, true);
select set_config('fx.c2', test_helpers.create_customer('j17-c2@local.test')::text, true);
select set_config('fx.c_e2', test_helpers.create_customer('j17-e2@local.test')::text, true);
select set_config('fx.c_e5', test_helpers.create_customer('j17-e5@local.test')::text, true);
select set_config('fx.c_s1', test_helpers.create_customer('j17-s1@local.test')::text, true);
select set_config('fx.o1', test_helpers.create_owner('j17-o1@local.test')::text, true);
select set_config('fx.o2', test_helpers.create_owner('j17-o2@local.test')::text, true);

select set_config('fx.s1', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.s2', test_helpers.create_shop(current_setting('fx.o2')::uuid)::text, true);
select set_config('fx.s_pending', test_helpers.create_shop(current_setting('fx.o1')::uuid, 'pending')::text, true);
select set_config('fx.b1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.b_e5', test_helpers.create_booking_fixture(current_setting('fx.c_e5')::uuid, current_setting('fx.s1')::uuid)::text, true);
select set_config('fx.w_o1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.w_o2', test_helpers.create_roster_worker(current_setting('fx.o2')::uuid)::text, true);
update public.profiles set phone_number = '+63 900 000 0001' where id = current_setting('fx.c1')::uuid;
select set_config('fx.c_e2b', test_helpers.create_customer('j17-e2b@local.test')::text, true);
select set_config('fx.u_w_e5', test_helpers.create_worker('j17-w-e5@local.test')::text, true);
select set_config('fx.w_e5', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.u_w_e5')::uuid)::text, true);
select set_config('fx.b_e5w', test_helpers.create_booking_fixture(current_setting('fx.c_e5')::uuid, current_setting('fx.s1')::uuid, 'accepted')::text, true);
update public.bookings set assigned_worker_id = current_setting('fx.w_e5')::uuid where id = current_setting('fx.b_e5w')::uuid;
select set_config('fx.u_w_s9', test_helpers.create_worker('j17-w-s9@local.test')::text, true);
select set_config('fx.w_s9', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.u_w_s9')::uuid)::text, true);

-- ---------- regular tests ----------
select test_helpers.act_as_anon();
select is((select count(*)::int from public.bookings), 0, 'j17_anon_cannot_read_bookings');

select test_helpers.act_as_customer('j17-c2@local.test');
select is((select count(*)::int from public.bookings where id = current_setting('fx.b1')::uuid),
          0, 'j17_customer_cannot_read_other_customer_bookings');
select test_helpers.act_as_customer('j17-c1@local.test');
select is((select count(*)::int from public.bookings where id = current_setting('fx.b1')::uuid),
          1, 'j17_customer_cannot_read_other_customer_bookings');

select test_helpers.act_as_owner('j17-o2@local.test');
select is((select count(*)::int from public.bookings where id = current_setting('fx.b1')::uuid),
          0, 'j17_owner_cannot_read_other_shop_bookings');
select test_helpers.act_as_owner('j17-o1@local.test');
select is((select count(*)::int from public.bookings where id = current_setting('fx.b1')::uuid),
          1, 'j17_owner_cannot_read_other_shop_bookings');

select test_helpers.act_as_owner('j17-o2@local.test');
select lives_ok($$
  update public.shops set name = 'J17 hijacked' where id = current_setting('fx.s1')::uuid
$$, 'j17_owner_cannot_update_other_owner_shop');
select test_helpers.act_as_service();
select isnt((select name from public.shops where id = current_setting('fx.s1')::uuid),
            'J17 hijacked', 'j17_owner_cannot_update_other_owner_shop');

select test_helpers.act_as_owner('j17-o1@local.test');
select throws_ok($$
  update public.shops set verification_status = 'approved' where id = current_setting('fx.s_pending')::uuid
$$, 'P0001', 'Only super admins can change verification status or notes.',
   'j17_non_admin_cannot_change_verification_status');
select test_helpers.act_as_customer('j17-c1@local.test');
select lives_ok($$
  update public.shops set verification_status = 'approved' where id = current_setting('fx.s_pending')::uuid
$$, 'j17_non_admin_cannot_change_verification_status');
select test_helpers.act_as_service();
select is((select verification_status from public.shops where id = current_setting('fx.s_pending')::uuid),
          'pending', 'j17_non_admin_cannot_change_verification_status');

-- S4: passes against the baseline profiles policy only (production unknown, D-10).
select test_helpers.act_as_customer('j17-c2@local.test');
select is((select count(*)::int from public.profiles where id = current_setting('fx.c1')::uuid),
          0, 'j17_user_cannot_read_other_profiles_contact');
select is((select count(*)::int from public.profiles where id = auth.uid()),
          1, 'j17_user_cannot_read_other_profiles_contact');
-- W2 S4: booking and roster counterparties cannot read each other's profile (phone_number).
-- o1 owns the shop of c1's booking b1; w-e5 is assigned to c_e5's booking and on o1's roster.
select test_helpers.act_as_owner('j17-o1@local.test');
select is((select count(*)::int from public.profiles where id <> auth.uid()),
          0, 'j17_user_cannot_read_other_profiles_contact');
select test_helpers.act_as_worker('j17-w-e5@local.test');
select is((select count(*)::int from public.profiles
           where id in (current_setting('fx.c_e5')::uuid, current_setting('fx.o1')::uuid)),
          0, 'j17_user_cannot_read_other_profiles_contact');
select test_helpers.act_as_anon();
select is((select count(*)::int from public.profiles), 0, 'j17_user_cannot_read_other_profiles_contact');

-- S5: a metadata rewrite on auth.users (what a client can do via auth.updateUser) never
-- changes the profile role; the role is read from profiles only.
select test_helpers.act_as_service();
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role": "super_admin"}'::jsonb
where id = current_setting('fx.c2')::uuid;
select is((select role::text from public.profiles where id = current_setting('fx.c2')::uuid),
          'customer', 'j17_metadata_update_cannot_change_profile_role');

-- S9 parts that already hold today (regular tests, NOT todo): the availability toggle the
-- worker jobs page needs keeps working, and WITH CHECK (user_id = auth.uid()) already blocks
-- a worker from re-pointing user_id. W2 must keep both passing when it fixes S9 below.
select test_helpers.act_as_worker('j17-w-s9@local.test');
select lives_ok($$
  update public.workers set is_available = false where id = current_setting('fx.w_s9')::uuid
$$, 'j17_worker_can_toggle_own_availability');
select test_helpers.act_as_service();
select is((select is_available from public.workers where id = current_setting('fx.w_s9')::uuid),
          false, 'j17_worker_can_toggle_own_availability');
select test_helpers.act_as_worker('j17-w-s9@local.test');
select test_helpers.attempt($$
  update public.workers set user_id = current_setting('fx.c1')::uuid where id = current_setting('fx.w_s9')::uuid
$$);
select test_helpers.act_as_service();
select is((select user_id from public.workers where id = current_setting('fx.w_s9')::uuid),
          current_setting('fx.u_w_s9')::uuid, 'j17_worker_cannot_rewrite_roster_row');

-- ---------- former W1 placeholders (fixed by the W2 migrations; no todo wrappers) ----------
-- Each forbidden write is attempted SEPARATELY and asserted per column, so a partial W2 fix
-- (e.g. one that only protects quoted_price) leaves the other assertions failing.
select test_helpers.act_as_service();
select test_helpers.attempt($$ select test_helpers.create_user('j17-e1@local.test', 'super_admin') $$);
select is((select count(*)::int from public.profiles p join auth.users u on u.id = p.id
           where u.email = 'j17-e1@local.test' and p.role = 'super_admin'),
          0, 'j17_signup_cannot_self_assign_super_admin');

select test_helpers.act_as_customer('j17-e2@local.test');
select test_helpers.attempt($$ update public.profiles set role = 'super_admin' where id = auth.uid() $$);
select test_helpers.act_as_service();
select is((select role from public.profiles where id = current_setting('fx.c_e2')::uuid),
          'customer', 'j17_profile_owner_cannot_change_role');
-- customer -> owner is allowed by the role CHECK, so a fix that only blocks super_admin fails here.
select test_helpers.act_as_customer('j17-e2b@local.test');
select test_helpers.attempt($$ update public.profiles set role = 'owner' where id = auth.uid() $$);
select test_helpers.act_as_service();
select is((select role from public.profiles where id = current_setting('fx.c_e2b')::uuid),
          'customer', 'j17_profile_owner_cannot_change_role');

select test_helpers.act_as_owner('j17-o1@local.test');
select test_helpers.attempt($$
  insert into public.shops (owner_id, name, address, verification_status)
  values (auth.uid(), 'J17 E3 preapproved', 'J17 address', 'approved')
$$);
select test_helpers.act_as_service();
select is((select count(*)::int from public.shops
           where name = 'J17 E3 preapproved' and verification_status = 'approved'),
          0, 'j17_owner_cannot_insert_preapproved_shop');

-- E5 customer path: b_e5 is the customer's own PENDING booking at s1 (quote 250.00).
-- The rating attempt runs before the status attempt so the booking is still pending.
select test_helpers.act_as_customer('j17-e5@local.test');
select test_helpers.attempt($$
  update public.bookings set quoted_price = 1.00 where id = current_setting('fx.b_e5')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings set shop_id = current_setting('fx.s2')::uuid where id = current_setting('fx.b_e5')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings set assigned_worker_id = current_setting('fx.w_o1')::uuid where id = current_setting('fx.b_e5')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings
  set customer_rating_stars = 5, customer_rating_comment = 'J17 E5 early', customer_rated_at = now()
  where id = current_setting('fx.b_e5')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings set booking_status = 'completed' where id = current_setting('fx.b_e5')::uuid
$$);
select test_helpers.act_as_service();
select is((select quoted_price from public.bookings where id = current_setting('fx.b_e5')::uuid),
          250.00::numeric, 'j17_customer_cannot_change_quoted_price');
select is((select shop_id from public.bookings where id = current_setting('fx.b_e5')::uuid),
          current_setting('fx.s1')::uuid, 'j17_customer_cannot_change_quoted_price');
select is((select assigned_worker_id from public.bookings where id = current_setting('fx.b_e5')::uuid),
          null::uuid, 'j17_customer_cannot_change_quoted_price');
select is((select row(customer_rating_stars, customer_rating_comment, customer_rated_at)::text
           from public.bookings where id = current_setting('fx.b_e5')::uuid),
          row(null::smallint, null::text, null::timestamptz)::text,
          'j17_customer_cannot_change_quoted_price');
select is((select booking_status from public.bookings where id = current_setting('fx.b_e5')::uuid),
          'pending', 'j17_customer_cannot_change_quoted_price');

-- E5 assigned-worker path: b_e5w is ACCEPTED, assigned to w_e5 (o1 roster, linked to the worker).
select test_helpers.act_as_worker('j17-w-e5@local.test');
select test_helpers.attempt($$
  update public.bookings set quoted_price = 1.00 where id = current_setting('fx.b_e5w')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings set shop_id = current_setting('fx.s2')::uuid where id = current_setting('fx.b_e5w')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings set customer_id = current_setting('fx.c1')::uuid where id = current_setting('fx.b_e5w')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings
  set customer_rating_stars = 5, customer_rating_comment = 'J17 E5 worker', customer_rated_at = now()
  where id = current_setting('fx.b_e5w')::uuid
$$);
select test_helpers.attempt($$
  update public.bookings set booking_status = 'pending' where id = current_setting('fx.b_e5w')::uuid
$$);
select test_helpers.act_as_service();
select is((select quoted_price from public.bookings where id = current_setting('fx.b_e5w')::uuid),
          250.00::numeric, 'j17_assigned_worker_cannot_change_protected_booking_fields');
select is((select shop_id from public.bookings where id = current_setting('fx.b_e5w')::uuid),
          current_setting('fx.s1')::uuid, 'j17_assigned_worker_cannot_change_protected_booking_fields');
select is((select customer_id from public.bookings where id = current_setting('fx.b_e5w')::uuid),
          current_setting('fx.c_e5')::uuid, 'j17_assigned_worker_cannot_change_protected_booking_fields');
select is((select row(customer_rating_stars, customer_rating_comment, customer_rated_at)::text
           from public.bookings where id = current_setting('fx.b_e5w')::uuid),
          row(null::smallint, null::text, null::timestamptz)::text,
          'j17_assigned_worker_cannot_change_protected_booking_fields');
select is((select booking_status from public.bookings where id = current_setting('fx.b_e5w')::uuid),
          'accepted', 'j17_assigned_worker_cannot_change_protected_booking_fields');

-- Already holds today (regular test, NOT todo): the worker policy's WITH CHECK requires the new
-- assigned worker to be linked to auth.uid(), so a worker cannot hand the job to another roster
-- row. W2 must keep this passing.
select test_helpers.act_as_worker('j17-w-e5@local.test');
select test_helpers.attempt($$
  update public.bookings set assigned_worker_id = current_setting('fx.w_o2')::uuid where id = current_setting('fx.b_e5w')::uuid
$$);
select test_helpers.act_as_service();
select is((select assigned_worker_id from public.bookings where id = current_setting('fx.b_e5w')::uuid),
          current_setting('fx.w_e5')::uuid, 'j17_assigned_worker_cannot_change_protected_booking_fields');

-- S1: one forged field per insert, each tagged by its own customer_notes marker.
select test_helpers.act_as_customer('j17-s1@local.test');
select test_helpers.attempt($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time,
                               shop_id, booking_status, customer_notes)
  values ('J17 Forger', auth.uid(), 'Sedan', 'Basic Wash', 'J17 address', now() + interval '1 day',
          current_setting('fx.s1')::uuid, 'completed', 'J17 S1 forged status')
$$);
select test_helpers.attempt($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time,
                               shop_id, assigned_worker_id, customer_notes)
  values ('J17 Forger', auth.uid(), 'Sedan', 'Basic Wash', 'J17 address', now() + interval '1 day',
          current_setting('fx.s1')::uuid, current_setting('fx.w_o1')::uuid, 'J17 S1 forged worker')
$$);
select test_helpers.attempt($$
  insert into public.bookings (customer_name, customer_id, vehicle_type, service_type, address, time,
                               shop_id, customer_rating_stars, customer_rating_comment,
                               customer_rated_at, customer_notes)
  values ('J17 Forger', auth.uid(), 'Sedan', 'Basic Wash', 'J17 address', now() + interval '1 day',
          current_setting('fx.s1')::uuid, 5, 'J17 forged rating', now(), 'J17 S1 forged rating')
$$);
select test_helpers.act_as_service();
select is((select count(*)::int from public.bookings
           where customer_notes = 'J17 S1 forged status' and booking_status <> 'pending'),
          0, 'j17_customer_cannot_forge_booking_insert_fields');
select is((select count(*)::int from public.bookings
           where customer_notes = 'J17 S1 forged worker' and assigned_worker_id is not null),
          0, 'j17_customer_cannot_forge_booking_insert_fields');
select is((select count(*)::int from public.bookings
           where customer_notes = 'J17 S1 forged rating'
             and (customer_rating_stars is not null or customer_rating_comment is not null
                  or customer_rated_at is not null)),
          0, 'j17_customer_cannot_forge_booking_insert_fields');

select test_helpers.act_as_owner('j17-o1@local.test');
select test_helpers.attempt($$
  update public.bookings set assigned_worker_id = current_setting('fx.w_o2')::uuid
  where id = current_setting('fx.b1')::uuid
$$);
select test_helpers.act_as_service();
select is((select assigned_worker_id from public.bookings where id = current_setting('fx.b1')::uuid),
          null::uuid, 'j17_owner_cannot_assign_foreign_worker');

-- S9: workers_update_own_link has no column restriction, so the linked worker can move their
-- roster row to another owner or rename it. W2 limits the worker to is_available.
select test_helpers.act_as_worker('j17-w-s9@local.test');
select test_helpers.attempt($$
  update public.workers set name = 'J17 S9 renamed', phone_number = '+63 900 000 0009'
  where id = current_setting('fx.w_s9')::uuid
$$);
select test_helpers.attempt($$
  update public.workers set owner_id = current_setting('fx.o2')::uuid where id = current_setting('fx.w_s9')::uuid
$$);
select test_helpers.act_as_service();
select is((select row(name, phone_number)::text from public.workers where id = current_setting('fx.w_s9')::uuid),
          row('Local Test Roster Worker'::text, null::text)::text, 'j17_worker_cannot_rewrite_roster_row');
select is((select owner_id from public.workers where id = current_setting('fx.w_s9')::uuid),
          current_setting('fx.o1')::uuid, 'j17_worker_cannot_rewrite_roster_row');

select * from finish();
rollback;
