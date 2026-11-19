-- SEC-3 (audit finding F4): "as soon as possible" bookings are refused unless turned on with SQL; scheduled bookings work.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('sec3-c1@local.test')),
  ('w1', test_helpers.create_worker('sec3-w1@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  values (pg_temp.id('w1'), 'verified', 14.5995, 120.9842, 20, true, now());
insert into public.independent_worker_services values (pg_temp.id('w1'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute) select pg_temp.id('w1'), d, 0, 1440 from generate_series(0, 6) d;

create function pg_temp.book(p_key text, p_immediate boolean) returns uuid language plpgsql as $$
declare made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', p_immediate,
    case when p_immediate then null else ((now() at time zone 'Asia/Manila')::date + 2 + interval '10 hours') at time zone 'Asia/Manila' end,
    'key-sec3-' || p_key) r;
  perform test_helpers.act_as_service();
  return made;
end;
$$;

select is((select immediate_bookings_open from public.platform_settings), false, 'immediate_bookings_are_off_by_default');
select throws_ok($$ select pg_temp.book('asap-off', true) $$, '23514', 'Booking as soon as possible is not available. Choose a day and time.',
  'immediate_booking_refused_when_off');
select test_helpers.act_as_service();
select isnt(pg_temp.book('scheduled', false), null, 'scheduled_booking_still_works');
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ update public.platform_settings set immediate_bookings_open = true $$, '42501', null, 'customer_cannot_turn_immediate_on');
select test_helpers.act_as_service();
update public.platform_settings set immediate_bookings_open = true;
select isnt(pg_temp.book('asap-on', true), null, 'immediate_booking_works_when_turned_on');
select is((select is_immediate from public.service_bookings where submission_key = 'key-sec3-asap-on'), true, 'immediate_booking_is_stored_as_immediate');

select * from finish();
rollback;
