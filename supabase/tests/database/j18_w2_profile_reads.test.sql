-- J18 (W2, risk R2): every frontend read that involves profiles or counterparty names keeps
-- working after W2a scoped profiles SELECT to self + super_admin, and profiles.phone_number
-- stays private to its owner (and super admins) per S4. Frontend audit (frontend/src):
--   SupabaseAuthRepository.fetchAuthenticatedUserProfile  profiles: own row only
--   SupabaseProfileRepository.updateProfile               profiles: own row update + returning
--   booking lists (customer / owner / worker)             bookings.customer_name (no profiles join)
--   owner roster list                                     workers.name / phone_number
--   shop lists / admin verification queue                 shops.* incl. owner_id (no profiles join)
-- No frontend path reads another user's profiles row, so no counterparty policy or RPC is added.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------- fixtures (session superuser) ----------
select set_config('fx.c1', test_helpers.create_user('j18p-c1@local.test', 'customer', 'J18p Customer')::text, true);
select set_config('fx.o1', test_helpers.create_user('j18p-o1@local.test', 'owner', 'J18p Owner')::text, true);
select set_config('fx.uw', test_helpers.create_user('j18p-w1@local.test', 'worker', 'J18p Worker')::text, true);
select set_config('fx.admin', test_helpers.create_super_admin('j18p-admin@local.test')::text, true);
update public.profiles set phone_number = '+63 900 000 04' || right(id::text, 2)
where id in (current_setting('fx.c1')::uuid, current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid);
select set_config('fx.s1', test_helpers.create_shop(current_setting('fx.o1')::uuid)::text, true);
select set_config('fx.w1', test_helpers.create_roster_worker(current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)::text, true);
select set_config('fx.b1', test_helpers.create_booking_fixture(current_setting('fx.c1')::uuid, current_setting('fx.s1')::uuid, 'accepted')::text, true);
update public.bookings set assigned_worker_id = current_setting('fx.w1')::uuid where id = current_setting('fx.b1')::uuid;

-- ---------- own profile (session bootstrap, every role) ----------
select test_helpers.act_as_customer('j18p-c1@local.test');
select results_eq($$ select role::text, full_name, phone_number is not null from public.profiles where id = auth.uid() $$,
                  $$ values ('customer'::text, 'J18p Customer'::text, true) $$, 'j18_user_can_read_own_profile_for_session');
select test_helpers.act_as_owner('j18p-o1@local.test');
select results_eq($$ select role::text, full_name from public.profiles where id = auth.uid() $$,
                  $$ values ('owner'::text, 'J18p Owner'::text) $$, 'j18_user_can_read_own_profile_for_session');
select test_helpers.act_as_worker('j18p-w1@local.test');
select results_eq($$ select role::text, full_name from public.profiles where id = auth.uid() $$,
                  $$ values ('worker'::text, 'J18p Worker'::text) $$, 'j18_user_can_read_own_profile_for_session');
select test_helpers.act_as_admin('j18p-admin@local.test');
select results_eq($$ select role::text from public.profiles where id = auth.uid() $$,
                  $$ values ('super_admin'::text) $$, 'j18_user_can_read_own_profile_for_session');

-- ---------- own profile edit (ProfileEditorCard) ----------
select test_helpers.act_as_customer('j18p-c1@local.test');
select results_eq($$
  update public.profiles set full_name = 'J18p Customer Renamed', phone_number = '+63 900 000 0499'
  where id = auth.uid() returning full_name, phone_number
$$, $$ values ('J18p Customer Renamed'::text, '+63 900 000 0499'::text) $$,
   'j18_user_can_update_own_profile_name_and_phone');
-- A payload that repeats the unchanged role (some clients send the whole row) still passes.
select lives_ok($$ update public.profiles set role = 'customer', full_name = 'J18p Customer' where id = auth.uid() $$,
                'j18_user_can_update_own_profile_name_and_phone');

-- ---------- counterparty names come from bookings / workers / shops ----------
select test_helpers.act_as_owner('j18p-o1@local.test');
select results_eq($$ select customer_name from public.bookings where id = current_setting('fx.b1')::uuid $$,
                  $$ values ('Local Test Customer'::text) $$, 'j18_owner_booking_list_shows_customer_name');
select results_eq($$ select name from public.workers where id = current_setting('fx.w1')::uuid $$,
                  $$ values ('Local Test Roster Worker'::text) $$, 'j18_owner_roster_list_shows_worker_names');
select is((select count(*)::int from public.profiles
           where id in (current_setting('fx.c1')::uuid, current_setting('fx.uw')::uuid)),
          0, 'j18_counterparty_phone_number_stays_private');

select test_helpers.act_as_worker('j18p-w1@local.test');
select results_eq($$ select customer_name, address from public.bookings where id = current_setting('fx.b1')::uuid $$,
                  $$ values ('Local Test Customer'::text, 'Local test address'::text) $$,
                  'j18_assigned_worker_booking_list_shows_customer_name');
select results_eq($$ select worker_row_id, roster_display_name from public.list_my_roster_links() $$,
                  $$ values (current_setting('fx.w1')::uuid, 'Local Test Roster Worker'::text) $$,
                  'j18_assigned_worker_booking_list_shows_customer_name');
select is((select count(*)::int from public.profiles
           where id in (current_setting('fx.c1')::uuid, current_setting('fx.o1')::uuid)),
          0, 'j18_counterparty_phone_number_stays_private');

select test_helpers.act_as_customer('j18p-c1@local.test');
select results_eq($$ select b.id, s.name like 'Local Test Shop %' from public.bookings b
                     join public.shops s on s.id = b.shop_id where b.id = current_setting('fx.b1')::uuid $$,
                  $$ values (current_setting('fx.b1')::uuid, true) $$, 'j18_customer_booking_list_shows_shop_name');
select is((select count(*)::int from public.profiles where id <> auth.uid()), 0,
          'j18_counterparty_phone_number_stays_private');
select is((select count(*)::int from public.profiles where phone_number is not null), 1,
          'j18_counterparty_phone_number_stays_private');

-- ---------- super admin (authorized party) ----------
select test_helpers.act_as_admin('j18p-admin@local.test');
select is((select count(*)::int from public.profiles
           where id in (current_setting('fx.c1')::uuid, current_setting('fx.o1')::uuid, current_setting('fx.uw')::uuid)),
          3, 'j18_super_admin_can_read_profiles');
select results_eq($$ select s.owner_id from public.shops s where s.id = current_setting('fx.s1')::uuid $$,
                  $$ values (current_setting('fx.o1')::uuid) $$, 'j18_super_admin_can_read_profiles');
-- Admin still cannot change a role from the app (D-8); only a trusted session can.
select throws_ok($$ update public.profiles set role = 'owner' where id = auth.uid() $$,
                 '42501', 'Your role and verification fields cannot be changed from the app.',
                 'j18_super_admin_can_read_profiles');

select test_helpers.act_as_anon();
select is((select count(*)::int from public.profiles), 0, 'j18_counterparty_phone_number_stays_private');

select * from finish();
rollback;
