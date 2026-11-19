-- SEC-2 (audit finding F1): customers cannot recover a washer's base location or private range through booking times,
-- and booking still works. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('sec2-c1@local.test')),
  ('c2', test_helpers.create_customer('sec2-c2@local.test')),
  ('w1', test_helpers.create_worker('sec2-w1@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50,
  max_location_checks_per_day = 20;
-- One verified washer in Makati with a 5 km range, working every day 06:00-22:00. Nobody else works.
delete from public.independent_worker_hours;
update public.independent_workers set verification_status = 'pending' where verification_status = 'verified';
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  values (pg_temp.id('w1'), 'verified', 14.5547, 121.0244, 5, true, now());
insert into public.independent_worker_services values (pg_temp.id('w1'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('w1'), d, 360, 1320 from generate_series(0, 6) d;

create function pg_temp.slots(p_customer text, p_lat double precision, p_lng double precision, p_days integer default 2) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform test_helpers.act_as(pg_temp.id(p_customer));
  select count(*) into n from public.service_booking_available_slots((now() at time zone 'Asia/Manila')::date + p_days, pg_temp.id('svc'), 'sedan', '{}', p_lat, p_lng);
  perform test_helpers.act_as_service();
  return n;
end;
$$;
create function pg_temp.km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
  returns double precision language sql immutable as $$ select public.service_distance_km(a_lat, a_lng, b_lat, b_lng) $$;

-- ---------- nothing about the centre or the checks is readable ----------
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select * from public.independent_worker_service_areas $$, '42501', null, 'customer_cannot_read_service_centres');
select throws_ok($$ select * from public.service_location_checks $$, '42501', null, 'customer_cannot_read_location_checks');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select * from public.independent_worker_service_areas $$, '42501', null, 'washer_cannot_read_service_centres');
select test_helpers.act_as_service();
select ok(not has_function_privilege('authenticated', 'public.independent_worker_covers(uuid, double precision, double precision)', 'execute')
      and not has_function_privilege('authenticated', 'public.service_location_check(double precision, double precision)', 'execute')
      and not has_function_privilege('anon', 'public.independent_worker_covers(uuid, double precision, double precision)', 'execute'),
  'coverage_and_check_functions_not_callable_by_clients');

-- ---------- the centre is never the base, and survives a base move ----------
select ok((select pg_temp.km(w.base_latitude, w.base_longitude, a.center_latitude, a.center_longitude) between 0.79 and 1.51
           from public.independent_workers w join public.independent_worker_service_areas a on a.worker_id = w.profile_id
           where w.profile_id = pg_temp.id('w1')), 'service_centre_is_0_8_to_1_5_km_from_base');
select ok(not exists (select 1 from public.independent_workers w left join public.independent_worker_service_areas a on a.worker_id = w.profile_id
                      where w.base_latitude is not null and a.worker_id is null), 'every_washer_with_a_base_has_a_centre');
create temporary table before_move on commit drop as select bearing_radians, offset_km from public.independent_worker_service_areas where worker_id = pg_temp.id('w1');
update public.independent_workers set base_latitude = 14.5600, base_longitude = 121.0300 where profile_id = pg_temp.id('w1');
select ok((select a.bearing_radians = b.bearing_radians and a.offset_km = b.offset_km
             and abs(pg_temp.km(14.5600, 121.0300, a.center_latitude, a.center_longitude) - a.offset_km) < 0.01
           from public.independent_worker_service_areas a, before_move b where a.worker_id = pg_temp.id('w1')),
  'base_move_keeps_the_secret_offset');
update public.independent_workers set base_latitude = 14.5547, base_longitude = 121.0244 where profile_id = pg_temp.id('w1');
-- From here the secret vector is pinned (smallest allowed offset), so the attack below is deterministic and worst-case.
update public.independent_worker_service_areas set bearing_radians = 0.7, offset_km = 0.8, range_margin_km = 0 where worker_id = pg_temp.id('w1');
select public.independent_worker_service_area_place(pg_temp.id('w1'));

-- ---------- an attacker with UNLIMITED lookups finds the fuzzed centre, not the base ----------
-- Binary search of the covered edge in four directions, the same attack that found the base to 0 m before SEC-2.
create function pg_temp.edge(p_dlat double precision, p_dlng double precision, p_lat double precision, p_lng double precision)
returns double precision language plpgsql as $$
declare inside double precision := 0; outside double precision := 1; mid double precision;
begin
  while outside - inside > 0.00005 loop
    mid := (inside + outside) / 2;
    if public.independent_worker_covers(pg_temp.id('w1'), p_lat + p_dlat * mid, p_lng + p_dlng * mid) then inside := mid; else outside := mid; end if;
  end loop;
  return inside;
end;
$$;
create temporary table attack on commit drop as
  with s as (select 14.5547 + 0.01 as lat, 121.0244 - 0.01 as lng)
  select s.lat + (pg_temp.edge(1, 0, s.lat, s.lng) - pg_temp.edge(-1, 0, s.lat, s.lng)) / 2 as est_lat,
         s.lng + (pg_temp.edge(0, 1, s.lat, s.lng) - pg_temp.edge(0, -1, s.lat, s.lng)) / 2 as est_lng,
         pg_temp.edge(1, 0, s.lat, s.lng) as north from s;
select ok((select pg_temp.km(est_lat, est_lng, 14.5547, 121.0244) >= 0.5 from attack), 'unlimited_triangulation_misses_the_base_by_over_500_m');
-- The edge it finds is the configured 5 km plus the secret offset and margin (0.8-2.5 km), minus at most the grid's 0.78 km.
select ok((select pg_temp.km(est_lat, est_lng, 14.5547 + 0.01 + north, 121.0244 - 0.01) > 5 from attack)
      and (select offset_km + range_margin_km between 0.8 and 2.5 from public.independent_worker_service_areas where worker_id = pg_temp.id('w1')),
  'unlimited_triangulation_does_not_return_the_configured_range');

-- ---------- legitimate booking still works ----------
select ok(pg_temp.slots('c1', 14.5547, 121.0244) > 0, 'customer_at_the_washers_base_sees_times');
select ok(pg_temp.slots('c1', 14.5700, 121.0350) > 0, 'customer_2_km_away_sees_times');
select is(pg_temp.slots('c1', 14.8547, 121.0244), 0::bigint, 'customer_33_km_away_sees_no_times');
select test_helpers.act_as(pg_temp.id('c1'));
create temporary table made on commit drop as
  select r.booking_id from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5600, 121.0300, '', '', false,
    ((now() at time zone 'Asia/Manila')::date + 2 + interval '10 hours') at time zone 'Asia/Manila', 'key-sec2-1') r;
select test_helpers.act_as_service();
select is((select count(*) from made), 1::bigint, 'customer_books_a_covered_time');
select ok(exists (select 1 from public.dispatch_requests d join made m on m.booking_id = d.booking_id where d.worker_id = pg_temp.id('w1')),
  'covered_booking_is_offered_to_the_washer');

-- ---------- the location cap ----------
-- The same address for 28 calendar days is one check.
create function pg_temp.many_days(p_customer text) returns boolean language plpgsql as $$
begin
  for d in 1..28 loop perform pg_temp.slots(p_customer, 14.5547, 121.0244, d); end loop;
  return true;
end;
$$;
select ok(pg_temp.many_days('c2'), 'same_address_checked_for_28_days_is_allowed');
select is((select count(*) from public.service_location_checks where customer_id = pg_temp.id('c2')), 1::bigint, 'same_address_counts_once');
-- 19 more distinct cells reach the cap of 20; the 21st distinct cell is refused.
create function pg_temp.walk(p_customer text, p_cells integer) returns boolean language plpgsql as $$
begin
  for i in 1..p_cells loop perform pg_temp.slots(p_customer, 14.5547 + i * 0.01, 121.0244); end loop;
  return true;
end;
$$;
select ok(pg_temp.walk('c2', 19), 'twenty_distinct_places_are_allowed');
select throws_ok($$ select pg_temp.slots('c2', 14.0, 121.5) $$, '23514',
  'You have checked too many different places today. Use an address you already checked, or try again tomorrow.',
  'twenty_first_distinct_place_is_refused');
update public.service_location_checks set checked_at = now() - interval '25 hours' where customer_id = pg_temp.id('c2');
select ok(pg_temp.slots('c2', 14.0, 121.5) = 0, 'checks_older_than_24_hours_free_up');

select * from finish();
rollback;
