-- OP-1: WashLink operates the washes itself. Washer sign-up is closed unless switched on, an operator washer is verified without
-- documents, only a trusted session makes one, and an operator can cancel a booking assigned to them. Local Docker stack only;
-- synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
create function pg_temp.role_of(p text) returns text language sql stable as $$ select role::text from public.profiles where id = pg_temp.id(p) $$;

-- A sign-up from the apps carries a JWT, so the session is not trusted. Tests otherwise run as a trusted session.
create function pg_temp.app_sign_up(p_key text, p_email text, p_role text) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  made := test_helpers.create_user(p_email, p_role, 'App Sign Up');
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;

-- 1) Washer sign-up switch.
select is((select washer_signup_open from public.platform_settings), false, 'op1_washer_signup_closed_by_default');
select pg_temp.app_sign_up('app_worker', 'op1-app-worker@local.test', 'worker');
select is(pg_temp.role_of('app_worker'), 'customer', 'op1_app_washer_sign_up_becomes_customer');
select pg_temp.app_sign_up('app_customer', 'op1-app-customer@local.test', 'customer');
select is(pg_temp.role_of('app_customer'), 'customer', 'op1_app_customer_sign_up_unchanged');
insert into ids values ('trusted_worker', test_helpers.create_worker('op1-trusted-w@local.test'));
select is(pg_temp.role_of('trusted_worker'), 'worker', 'op1_trusted_session_still_creates_washers');
update public.platform_settings set washer_signup_open = true;
select pg_temp.app_sign_up('app_worker_open', 'op1-app-worker-open@local.test', 'worker');
select is(pg_temp.role_of('app_worker_open'), 'worker', 'op1_open_switch_allows_washer_sign_up');
update public.platform_settings set washer_signup_open = false;

-- Fixtures.
insert into ids values
  ('admin', test_helpers.create_super_admin('op1-admin@local.test')),
  ('owner', test_helpers.create_owner('op1-owner@local.test')),
  ('c1', test_helpers.create_customer('op1-c1@local.test')),
  ('busy', test_helpers.create_customer('op1-busy@local.test')),
  ('op', test_helpers.create_customer('op1-operator@local.test')),
  ('wb', test_helpers.create_worker('op1-wb@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;

create function pg_temp.manila(p_days integer) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + p_days + interval '10 hours') at time zone 'Asia/Manila' $$;
create function pg_temp.book(p_key text, p_customer text, p_days integer) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id(p_customer));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, 'Blue gate', 'Ring twice', false, pg_temp.manila(p_days), 'key-op1-' || p_key) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.status(p_key text) returns text language sql stable as $$
  select status from public.service_bookings where id = pg_temp.id(p_key) $$;

-- 2) Making an operator: never from the apps, only for customer or washer accounts without open customer bookings.
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok($$ select public.make_platform_operator('op1-operator@local.test') $$, '42501', null, 'op1_admin_jwt_cannot_make_operator');
select test_helpers.act_as(pg_temp.id('op'));
select throws_ok($$ select public.make_platform_operator('op1-operator@local.test') $$, '42501', null, 'op1_user_cannot_make_self_operator');
select test_helpers.act_as_service();
select throws_ok($$ select public.make_platform_operator('op1-owner@local.test') $$, '23514',
                 'Only a customer or washer account can become an operator account.', 'op1_owner_cannot_become_operator');
select throws_ok($$ select public.make_platform_operator('op1-admin@local.test') $$, '23514',
                 'Only a customer or washer account can become an operator account.', 'op1_admin_cannot_become_operator');
select throws_ok($$ select public.make_platform_operator('nobody@local.test') $$, '22023', 'No account uses that email.', 'op1_unknown_email');

select is(public.make_platform_operator(' OP1-Operator@local.test '), pg_temp.id('op'), 'op1_make_operator_returns_account');
select is(pg_temp.role_of('op'), 'worker', 'op1_operator_is_a_washer');
select results_eq($$ select verification_status, is_platform_operator from public.independent_workers where profile_id = pg_temp.id('op') $$,
                  $$ values ('verified'::text, true) $$, 'op1_operator_verified_without_documents');
select is((select count(*)::int from public.workforce_audit_events where action = 'independent_worker.operator_granted'
             and subject_id = pg_temp.id('op')), 1, 'op1_operator_grant_audited');

-- 3) The admin panel lists operators. Admin review: an operator needs no documents, everyone else still does.
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select public.admin_platform_operator_ids() $$, '42501', null, 'op1_customer_cannot_list_operators');
select test_helpers.act_as(pg_temp.id('admin'));
select results_eq($$ select public.admin_platform_operator_ids() $$, array[pg_temp.id('op')], 'op1_admin_lists_operators');
select public.admin_review_independent_worker(pg_temp.id('op'), 'suspended', 'Checking the operator account') is not null as suspended;
select is((public.admin_review_independent_worker(pg_temp.id('op'), 'verified')).verification_status, 'verified',
          'op1_admin_reverifies_operator_without_documents');
select test_helpers.act_as_service();
insert into public.independent_workers (profile_id) values (pg_temp.id('wb'));
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok($$ select public.admin_review_independent_worker(pg_temp.id('wb'), 'verified') $$, '23514',
                 'Approve every required document before verifying this washer.', 'op1_other_washers_still_need_documents');
select test_helpers.act_as_service();
select is(public.independent_workers_reset_unevidenced(), 0, 'op1_reset_skips_operator');

-- 4) The operator gets the booking offer, accepts it and can cancel it with a reason.
update public.independent_workers set base_latitude = 14.5995, base_longitude = 120.9842, service_radius_km = 20
  where profile_id = pg_temp.id('op');
insert into public.independent_worker_services values (pg_temp.id('op'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('op'), d, 0, 1440 from generate_series(0, 6) d;
select pg_temp.book('busy_booking', 'busy', 2);
select throws_ok($$ select public.make_platform_operator('op1-busy@local.test') $$, '23514',
                 'This account has open bookings as a customer. Finish or cancel them first.', 'op1_customer_with_open_booking_refused');
select pg_temp.book('job', 'c1', 3);
select test_helpers.act_as(pg_temp.id('op'));
select lives_ok($$ select public.accept_dispatch_request((select d.id from public.dispatch_requests d
                     where d.booking_id = pg_temp.id('job') and d.worker_id = pg_temp.id('op') and d.status = 'offered')) $$,
                'op1_operator_accepts_offer');
select throws_ok($$ select public.operator_cancel_service_booking(pg_temp.id('job'), 'short') $$, '23514',
                 'Give a reason of 10 to 500 characters.', 'op1_cancel_needs_reason');
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select public.operator_cancel_service_booking(pg_temp.id('job'), 'Customer asked to cancel') $$, '42501',
                 'Booking not found.', 'op1_customer_cannot_use_operator_cancel');
select test_helpers.act_as(pg_temp.id('op'));
select is((public.operator_cancel_service_booking(pg_temp.id('job'), 'Rain all afternoon, rebooking tomorrow')).actor_kind, 'worker',
          'op1_operator_cancels_assigned_booking');
select test_helpers.act_as_service();
select is(pg_temp.status('job'), 'cancelled', 'op1_cancelled_booking_status');

-- An ordinary washer still can't cancel, only hand the job back.
select pg_temp.book('wb_job', 'c1', 4);
update public.dispatch_requests set status = 'superseded' where booking_id = pg_temp.id('wb_job') and status = 'offered';
update public.service_bookings set worker_id = pg_temp.id('wb'), status = 'accepted' where id = pg_temp.id('wb_job');
select test_helpers.act_as(pg_temp.id('wb'));
select throws_ok($$ select public.operator_cancel_service_booking(pg_temp.id('wb_job'), 'I would like to cancel this') $$, '42501',
                 'Only a WashLink operator account can cancel a booking. Hand it back instead.', 'op1_ordinary_washer_cannot_cancel');

-- 5) Removing operator status puts the account under review.
select test_helpers.act_as_service();
select public.remove_platform_operator('op1-operator@local.test') is not null as removed;
select results_eq($$ select verification_status, is_platform_operator from public.independent_workers where profile_id = pg_temp.id('op') $$,
                  $$ values ('pending'::text, false) $$, 'op1_removed_operator_back_under_review');

select * from finish();
rollback;
