-- B2C o: booking times are only listed from washers whose saved service range covers the customer's location.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('b2c8-range-c1@local.test')),
  ('w1', test_helpers.create_worker('b2c8-range-w1@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true;
-- The only verified washer is based in Manila with a 5 km range, working every day.
delete from public.independent_worker_hours;
update public.independent_workers set verification_status = 'pending' where verification_status = 'verified';
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  values (pg_temp.id('w1'), 'verified', 14.5995, 120.9842, 5, true, now());
insert into public.independent_worker_services values (pg_temp.id('w1'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('w1'), d, 480, 1020 from generate_series(0, 6) d;

create function pg_temp.slot_count(p_lat double precision, p_lng double precision) returns bigint language sql as $$
  select count(*) from public.service_booking_available_slots((now() at time zone 'Asia/Manila')::date + 2, pg_temp.id('svc'), 'sedan',
    '{}', p_lat, p_lng) $$;

select test_helpers.act_as(pg_temp.id('c1'));
select ok(pg_temp.slot_count(14.6010, 120.9850) > 0, 'customer_in_range_sees_times');
-- About 55 km away (Tagaytay area): outside the 5 km range.
select is(pg_temp.slot_count(14.1153, 120.9621), 0::bigint, 'customer_out_of_range_sees_no_times');
select is(pg_temp.slot_count(null, null), 0::bigint, 'no_location_sees_no_times');
select test_helpers.act_as_service();
update public.independent_workers set service_radius_km = 60 where profile_id = pg_temp.id('w1');
select test_helpers.act_as(pg_temp.id('c1'));
select ok(pg_temp.slot_count(14.1153, 120.9621) > 0, 'wider_saved_range_shows_times');

select * from finish();
rollback;
