-- BG-1: a 45-minute travel gap around every booking, and a request offered to a washer holds its time until answered.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;

insert into ids values
  ('c1', test_helpers.create_customer('bg1-c1@local.test')),
  ('c2', test_helpers.create_customer('bg1-c2@local.test')),
  ('op', test_helpers.create_customer('bg1-operator@local.test')),
  ('svc', (select id from public.services where key = 'basic_exterior'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;

-- The only washer: an operator working every day, all day.
select public.make_platform_operator('bg1-operator@local.test') is not null as made;
-- Other washers left by earlier tests would also take offers; this test needs the operator alone.
update public.independent_workers set verification_status = 'suspended' where profile_id <> pg_temp.id('op');
update public.independent_workers set base_latitude = 14.5995, base_longitude = 120.9842, service_radius_km = 20
  where profile_id = pg_temp.id('op');
insert into public.independent_worker_services values (pg_temp.id('op'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('op'), d, 0, 1440 from generate_series(0, 6) d;

create function pg_temp.minutes() returns integer language sql stable as $$
  select duration_minutes from public.services where id = pg_temp.id('svc') $$;
-- p_days from today, at p_minute minutes after midnight, Manila time.
create function pg_temp.at(p_days integer, p_minute integer) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + p_days + make_interval(mins => p_minute)) at time zone 'Asia/Manila' $$;
create function pg_temp.book(p_key text, p_customer text, p_start timestamptz) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id(p_customer));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', false, p_start, 'key-bg1-' || p_key) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.offer(p_key text) returns uuid language sql stable as $$
  select d.id from public.dispatch_requests d where d.booking_id = pg_temp.id(p_key) and d.worker_id = pg_temp.id('op') and d.status = 'offered' $$;
create function pg_temp.busy(p_start timestamptz) returns boolean language sql stable as $$
  select public.independent_worker_has_conflict(pg_temp.id('op'), p_start, pg_temp.minutes()) $$;

-- 1) The gap is 45 minutes.
select is((select travel_buffer_minutes from public.platform_settings), 45, 'bg1_travel_gap_is_45_minutes');

-- 2) A 10:00 request offered to the washer, not yet answered, holds 9:15 to the end of the wash plus 45 minutes.
select pg_temp.book('held', 'c1', pg_temp.at(3, 600));
select isnt(pg_temp.offer('held'), null, 'bg1_request_offered_to_operator');
select is(pg_temp.busy(pg_temp.at(3, 600 + pg_temp.minutes() + 30)), true, 'bg1_unanswered_request_holds_time_with_gap');
select is(pg_temp.busy(pg_temp.at(3, 600 + pg_temp.minutes() + 45)), false, 'bg1_time_after_the_gap_is_free');
select is(pg_temp.busy(pg_temp.at(3, 600 - 45 - pg_temp.minutes())), false, 'bg1_time_ending_before_the_gap_is_free');
select is(pg_temp.busy(pg_temp.at(3, 600 - 30 - pg_temp.minutes())), true, 'bg1_gap_before_the_booking_is_held');

-- 3) Customers see the held time as taken, and can't book it.
select test_helpers.act_as(pg_temp.id('c2'));
select is((select s.is_available from public.service_booking_available_slots((pg_temp.at(3, 0) at time zone 'Asia/Manila')::date,
             pg_temp.id('svc'), 'sedan') s where s.slot_start = pg_temp.at(3, 600 + 30)), false, 'bg1_held_time_shown_unavailable');
select throws_ok($$ select public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Honda', 'City', 2021, '{}',
                     '34 Other Street, Makati City', 14.5995, 120.9842, '', '', false, pg_temp.at(3, 630), 'key-bg1-clash') $$,
                 '23514', 'That time is no longer available. Choose another.', 'bg1_second_customer_cannot_book_held_time');
select test_helpers.act_as_service();

-- 4) The held request doesn't block its own acceptance.
select test_helpers.act_as(pg_temp.id('op'));
select lives_ok($$ select public.accept_dispatch_request(pg_temp.offer('held')) $$, 'bg1_operator_accepts_held_request');
select test_helpers.act_as_service();
select is(pg_temp.busy(pg_temp.at(3, 630)), true, 'bg1_accepted_booking_still_holds_time');

-- 5) Declining or letting the offer expire frees the time.
select pg_temp.book('declined', 'c1', pg_temp.at(4, 600));
select is(pg_temp.busy(pg_temp.at(4, 630)), true, 'bg1_second_request_holds_its_time');
select test_helpers.act_as(pg_temp.id('op'));
select public.decline_dispatch_request(pg_temp.offer('declined'));
select test_helpers.act_as_service();
select is(pg_temp.busy(pg_temp.at(4, 630)), false, 'bg1_declined_request_frees_time');

select pg_temp.book('expired', 'c2', pg_temp.at(5, 600));
select is(pg_temp.busy(pg_temp.at(5, 630)), true, 'bg1_third_request_holds_its_time');
update public.dispatch_requests set expires_at = now() - interval '1 second' where id = pg_temp.offer('expired');
select is(pg_temp.busy(pg_temp.at(5, 630)), false, 'bg1_expired_offer_frees_time');

select * from finish();
rollback;
