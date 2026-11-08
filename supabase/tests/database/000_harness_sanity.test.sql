-- W1 harness sanity: signup trigger and identity switching helpers (AC4, AC5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select set_config('fx.owner', test_helpers.create_user('harness-owner@local.test', 'owner', 'Harness Owner')::text, true);
select set_config('fx.customer', test_helpers.create_customer('harness-customer@local.test')::text, true);

select results_eq(
  $$ select role, full_name from public.profiles where id = current_setting('fx.owner')::uuid $$,
  $$ values ('owner'::text, 'Harness Owner'::text) $$,
  'harness_signup_trigger_creates_profile_with_metadata'
);

select test_helpers.act_as(current_setting('fx.customer')::uuid);
select is(auth.uid(), current_setting('fx.customer')::uuid, 'harness_act_as_sets_auth_uid');
select is(current_user::text, 'authenticated', 'harness_act_as_sets_auth_uid');

select test_helpers.act_as_customer('harness-customer@local.test');
select throws_ok(
  $$ select test_helpers.act_as_owner('harness-customer@local.test') $$,
  'P0001',
  'test_helpers: harness-customer@local.test has role customer, expected owner',
  'harness_act_as_role_wrapper_rejects_wrong_role'
);
-- The failed switch was rolled back with its subtransaction: still the customer.
select is(auth.uid(), current_setting('fx.customer')::uuid, 'harness_act_as_role_wrapper_rejects_wrong_role');

select test_helpers.act_as_anon();
select is(auth.uid(), null::uuid, 'harness_act_as_anon_has_no_uid');
select is(current_user::text, 'anon', 'harness_act_as_anon_has_no_uid');

select test_helpers.act_as_service();
select is(current_user::text, session_user::text, 'harness_act_as_service_returns_to_superuser');
select is(auth.uid(), null::uuid, 'harness_act_as_service_returns_to_superuser');

select * from finish();
rollback;
