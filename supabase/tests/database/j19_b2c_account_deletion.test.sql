-- Who may delete their own account. The full flow with bookings and retained records is in b2c-api-smoke.mjs.
-- The password check is covered in j19_b2c6_account_deletion_reauth. These paths carry a recent password sign-in, and the exact
-- refusal messages show the role check refused them, not the password check.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE'), 'delete_account_anon_cannot_execute');
select ok(not has_function_privilege('service_role', 'public.delete_my_account()', 'EXECUTE'), 'delete_account_service_role_cannot_execute');
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE'), 'delete_account_authenticated_can_execute');

create temporary table people (kind text primary key, id uuid) on commit drop;
grant all on people to authenticated;
insert into people values
  ('customer', test_helpers.create_customer('delete-customer@local.test')),
  ('other', test_helpers.create_customer('delete-other@local.test')),
  ('admin', test_helpers.create_super_admin('delete-admin@local.test')),
  ('b2b_worker', test_helpers.create_worker('delete-b2b-worker@local.test')),
  ('b2c_worker', test_helpers.create_worker('delete-b2c-worker@local.test'));
insert into public.worker_profiles (profile_id, availability_status) select id, 'flexible' from people where kind = 'b2b_worker' on conflict do nothing;
delete from public.worker_profiles where profile_id = (select id from people where kind = 'b2c_worker');
insert into public.customer_addresses (customer_id, label, address, latitude, longitude)
  select id, 'Home', '12 Ayala Avenue, Makati', 14.5, 121 from people where kind = 'customer';
insert into public.customer_addresses (customer_id, label, address, latitude, longitude)
  select id, 'Home', '14 Ayala Avenue, Makati', 14.5, 121 from people where kind = 'other';

select test_helpers.act_as_with_amr((select id from people where kind = 'admin'));
select throws_ok('select public.delete_my_account()', '42501', 'This account can''t be deleted here. Only WashLink can close it.', 'delete_account_refuses_super_admin');

select test_helpers.act_as_with_amr((select id from people where kind = 'b2b_worker'));
select throws_ok('select public.delete_my_account()', '42501', 'This account can''t be deleted here. Only WashLink can close it.', 'delete_account_refuses_worker_with_shop_records');

select test_helpers.act_as_with_amr((select id from people where kind = 'customer'));
select lives_ok('select public.delete_my_account()', 'delete_account_customer_succeeds');

select test_helpers.act_as_service();
select is((select count(*)::int from auth.users where id = (select id from people where kind = 'customer')), 0, 'delete_account_removes_sign_in');
select is((select count(*)::int from public.profiles where id = (select id from people where kind = 'customer')), 0, 'delete_account_removes_profile');
select is((select count(*)::int from public.customer_addresses where address like '12 Ayala%'), 0, 'delete_account_removes_saved_addresses');
select is((select count(*)::int from public.customer_addresses where address like '14 Ayala%'), 1, 'delete_account_leaves_other_people_alone');

select test_helpers.act_as_with_amr((select id from people where kind = 'b2c_worker'));
select lives_ok('select public.delete_my_account()', 'delete_account_b2c_worker_succeeds');

select * from finish();
rollback;
