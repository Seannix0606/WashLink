-- B2C booking engine: server pricing, draft-price lockout, idempotent booking, availability, atomic acceptance,
-- address privacy, the status machine, cancellation rights and reviews.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create temporary table ids on commit drop as
  select test_helpers.create_customer('b2c-customer@local.test') as customer,
         test_helpers.create_customer('b2c-other@local.test') as other,
         test_helpers.create_worker('b2c-w1@local.test') as w1,
         test_helpers.create_worker('b2c-w2@local.test') as w2,
         test_helpers.create_super_admin('b2c-admin@local.test') as admin,
         (select id from public.services where key = 'full_wash') as svc,
         (select id from public.service_addons where key = 'wax') as addon;
grant select on ids to authenticated;
select lives_ok($$ select 1 from ids where customer is not null and w1 is not null and svc is not null $$, 'fixtures_exist');

-- Trusted setup.
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  select w1, 'pending', 14.5995, 120.9842, 20, false, null from ids;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  select w2, 'verified', 14.5995, 120.9842, 20, true, now() from ids;
insert into public.independent_worker_services select w1, svc from ids;
insert into public.independent_worker_services select w2, svc from ids;
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select i.w2, d, 0, 1440 from ids i cross join generate_series(0, 6) d;

-- ---------- closed until an admin sets final prices ----------
select test_helpers.act_as((select customer from ids));
select throws_ok($$ select * from public.create_service_booking((select svc from ids), 'suv', 'Toyota', 'Fortuner', 2020, '{}',
  '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', true, null, 'key-closed-001') $$,
  '23514', 'WashLink is not taking bookings yet.', 'b2c_bookings_closed_by_default');
select test_helpers.act_as((select admin from ids));
select throws_ok($$ select public.admin_update_platform_rules(true, 2000, 180, 30, 30) $$, '23514',
  'Set final prices for every active service before opening bookings.', 'b2c_cannot_open_with_draft_prices');
select test_helpers.act_as((select customer from ids));
select throws_ok($$ select public.admin_update_platform_rules(true, 0, 180, 30, 30) $$, '42501', null, 'b2c_customer_cannot_change_settings');
select throws_ok($$ select public.admin_review_independent_worker((select w1 from ids), 'verified') $$, '42501', null, 'b2c_customer_cannot_verify_worker');

select test_helpers.act_as((select admin from ids));
select lives_ok($$ select public.admin_save_service(s.id, s.key, s.category, s.name, s.description, s.image_url, s.requirements,
    s.base_price_cents, s.duration_minutes, s.is_active, false, s.sort_order) from public.services s $$, 'b2c_admin_sets_final_service_prices');
select lives_ok($$ select public.admin_save_addon(a.id, a.key, a.name, a.description, a.price_cents, a.duration_minutes, a.is_active, false, a.sort_order)
    from public.service_addons a $$, 'b2c_admin_sets_final_addon_prices');
select lives_ok($$ select public.admin_update_platform_rules(true, 2000, 180, 30, 30) $$, 'b2c_admin_opens_bookings');

-- ---------- pricing is the server's ----------
select test_helpers.act_as((select customer from ids));
select results_eq($$ select customer_total_cents, worker_earnings_cents, platform_fee_cents
    from public.service_booking_quote((select svc from ids), 'suv', array[(select addon from ids)]) $$,
  $$ values (85000, 68000, 17000) $$, 'b2c_quote_adds_base_vehicle_and_addons_and_splits_commission');
select throws_ok($$ select * from public.service_booking_quote((select svc from ids), 'motorcycle') $$, '23514',
  'This service is not available for that vehicle type.', 'b2c_unsupported_vehicle_refused');

create temporary table made on commit drop as
  select * from public.create_service_booking((select svc from ids), 'suv', 'Toyota', 'Fortuner', 2020, array[(select addon from ids)],
    '12 Sample Street, Makati City', 14.5995, 120.9842, 'Blue gate', 'Ring twice', true, null, 'key-booking-001');
grant select on made to authenticated;
select is((select customer_total_cents from made), 85000, 'b2c_booking_total_is_server_calculated');
select is((select status from made), 'searching_for_worker', 'b2c_booking_starts_searching');
select matches((select reference from made), '^WL-[0-9A-F]{8}$', 'b2c_booking_has_unique_reference');
select is((select count(*)::int from public.create_service_booking((select svc from ids), 'suv', 'Toyota', 'Fortuner', 2020, array[(select addon from ids)],
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', true, null, 'key-booking-001') r where r.booking_id = (select booking_id from made)), 1,
  'b2c_repeat_submission_returns_the_same_booking');
select is((select count(*)::int from public.my_service_bookings()), 1, 'b2c_no_duplicate_booking_created');
select throws_ok($$ select * from public.create_service_booking((select svc from ids), 'suv', 'Toyota', 'Fortuner', 2020, '{}',
  '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', false, now() - interval '1 hour', 'key-past-0001') $$, '23514',
  'Choose a time in the future within the booking window.', 'b2c_past_time_refused');

-- ---------- direct writes are refused ----------
select throws_ok($$ update public.service_bookings set customer_total_cents = 1 $$, '42501', null, 'b2c_customer_cannot_update_booking_directly');
select throws_ok($$ insert into public.dispatch_requests (booking_id, worker_id, expires_at)
  select booking_id, (select w2 from ids), now() from made $$, '42501', null, 'b2c_customer_cannot_create_dispatch_requests');
select throws_ok($$ select public.advance_service_booking((select booking_id from made), 'accepted') $$, '42501', 'Booking not found.', 'b2c_customer_cannot_do_worker_status');
select test_helpers.act_as((select other from ids));
select is((select count(*)::int from public.service_bookings), 0, 'b2c_other_customer_reads_nothing');
select throws_ok($$ select public.cancel_service_booking((select booking_id from made)) $$, '42501', 'Booking not found.', 'b2c_other_customer_cannot_cancel');

-- ---------- requests hide the address; eligibility is enforced ----------
select test_helpers.act_as((select w1 from ids));
select is((select count(*)::int from public.my_dispatch_requests()), 0, 'b2c_unverified_worker_gets_no_request');
select throws_ok($$ select public.set_independent_worker_online(true) $$, '23514',
  'WashLink must verify your account before you can go online.', 'b2c_unverified_worker_cannot_go_online');
select test_helpers.act_as((select w2 from ids));
select is((select count(*)::int from public.my_dispatch_requests()), 1, 'b2c_eligible_worker_receives_request');
select is((select worker_earnings_cents from public.my_dispatch_requests()), 68000, 'b2c_request_shows_expected_earnings');
select is((select count(*)::int from information_schema.routines r
           join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_name = 'my_dispatch_requests' and p.parameter_name in ('address', 'latitude', 'longitude', 'customer_name', 'customer_phone')),
          0, 'b2c_request_has_no_address_or_customer_identity');
select is((select count(*)::int from public.service_bookings), 0, 'b2c_worker_cannot_read_booking_table');

-- ---------- atomic acceptance ----------
select test_helpers.act_as_service();
update public.independent_workers set verification_status = 'verified', is_online = true, last_seen_at = now() where profile_id = (select w1 from ids);
insert into public.dispatch_requests (booking_id, worker_id, expires_at) select booking_id, (select w1 from ids), now() + interval '5 minutes' from made;
select test_helpers.act_as((select w2 from ids));
select results_eq($$ select status from public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.worker_id = (select w2 from ids))) $$,
  $$ values ('accepted'::text) $$, 'b2c_first_worker_accepts');
select test_helpers.act_as((select w1 from ids));
select throws_ok($$ select * from public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.worker_id = (select w1 from ids))) $$, '55000',
  'Another washer already took this booking, or it was cancelled.', 'b2c_second_worker_loses_atomically');

select test_helpers.act_as((select w2 from ids));
select is((select address from public.my_assigned_service_bookings()), '12 Sample Street, Makati City', 'b2c_assigned_worker_sees_exact_address');
select throws_ok($$ select public.advance_service_booking((select booking_id from made), 'arrived') $$, '55000',
  'This booking changed. Refresh and try again.', 'b2c_stale_or_skipped_status_refused');
select is(public.advance_service_booking((select booking_id from made), 'accepted'), 'worker_on_the_way', 'b2c_worker_starts_travelling');
select is(public.advance_service_booking((select booking_id from made), 'worker_on_the_way'), 'arrived', 'b2c_worker_arrives');
select test_helpers.act_as((select customer from ids));
select throws_ok($$ select public.cancel_service_booking((select booking_id from made)) $$, '23514', 'This booking can no longer be cancelled here.', 'b2c_customer_cannot_cancel_after_arrival');
select test_helpers.act_as((select w2 from ids));
select is(public.advance_service_booking((select booking_id from made), 'arrived'), 'in_progress', 'b2c_worker_starts_wash');
select is(public.advance_service_booking((select booking_id from made), 'in_progress'), 'completed', 'b2c_worker_completes_wash');
select is((select address from public.my_assigned_service_bookings()), null, 'b2c_address_hidden_after_completion');

select test_helpers.act_as((select customer from ids));
select lives_ok($$ select public.review_service_booking((select booking_id from made), 5, 'Great') $$, 'b2c_customer_rates_completed_booking');

select * from finish();
rollback;
