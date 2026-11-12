-- NFA-1: a booking whose reference is all digits ('WL-81904306') still sends its status notifications.
-- Before the fix the title 'Booking WL-81904306' failed notification_text_is_safe (7+ digit run) and the notice was dropped.
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;

insert into ids values
  ('c1', test_helpers.create_customer('nfa-c1@local.test')),
  ('op', test_helpers.create_customer('nfa-operator@local.test')),
  ('svc', (select id from public.services where key = 'basic_exterior'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;

-- The only washer: an operator working every day, all day.
select public.make_platform_operator('nfa-operator@local.test') is not null as made;
update public.independent_workers set verification_status = 'suspended' where profile_id <> pg_temp.id('op');
update public.independent_workers set base_latitude = 14.5995, base_longitude = 120.9842, service_radius_km = 20
  where profile_id = pg_temp.id('op');
insert into public.independent_worker_services values (pg_temp.id('op'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('op'), d, 0, 1440 from generate_series(0, 6) d;

-- p_days from today, at p_minute minutes after midnight, Manila time.
create function pg_temp.at(p_days integer, p_minute integer) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + p_days + make_interval(mins => p_minute)) at time zone 'Asia/Manila' $$;
-- Books as the customer, then (trusted session) forces the reference.
create function pg_temp.book(p_key text, p_start timestamptz, p_reference text) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', false, p_start, 'key-nfa-' || p_key) r;
  perform test_helpers.act_as_service();
  -- TEST-ONLY: the guard keeps booking details fixed, so lift it for this one write (rolled back with the test).
  alter table public.service_bookings disable trigger service_bookings_guard_update;
  update public.service_bookings set reference = p_reference where id = made;
  alter table public.service_bookings enable trigger service_bookings_guard_update;
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.offer(p_key text) returns uuid language sql stable as $$
  select d.id from public.dispatch_requests d where d.booking_id = pg_temp.id(p_key) and d.worker_id = pg_temp.id('op') and d.status = 'offered' $$;
create function pg_temp.notice(p_recipient text, p_key text, p_body text) returns text language sql stable as $$
  select string_agg(n.title, ' | ' order by n.created_at) from public.notifications n
  where n.recipient_id = pg_temp.id(p_recipient) and n.subject_id = pg_temp.id(p_key)
    and n.category = 'service_booking.update' and n.body = p_body $$;

-- 0) The phone-number guard is unchanged: the old title is still refused.
select is(public.notification_text_is_safe('Booking WL-81904306'), false, 'nfa_digit_reference_title_still_unsafe');

-- 1) An all-digit reference: the customer hears about the acceptance, titled by the service instead.
select pg_temp.book('digits', pg_temp.at(3, 600), 'WL-81904306');
select is((select reference from public.service_bookings where id = pg_temp.id('digits')), 'WL-81904306', 'nfa_reference_forced_to_digits');
select isnt(pg_temp.offer('digits'), null, 'nfa_digit_booking_offered_to_operator');
select test_helpers.act_as(pg_temp.id('op'));
select lives_ok($$ select public.accept_dispatch_request(pg_temp.offer('digits')) $$, 'nfa_operator_accepts_digit_booking');
select test_helpers.act_as_service();
select is(pg_temp.notice('c1', 'digits', 'A washer accepted your booking.'),
          'Your ' || (select service_name from public.service_bookings where id = pg_temp.id('digits')) || ' booking',
          'nfa_customer_notified_of_acceptance_with_service_name');
select is((select count(*)::int from public.notifications n where n.subject_id = pg_temp.id('digits') and n.title ~ '[0-9]{7}'),
          0, 'nfa_no_notification_holds_the_digit_reference');

-- 2) The washer's notice also arrives when the customer cancels it.
select test_helpers.act_as(pg_temp.id('c1'));
select lives_ok($$ select public.cancel_service_booking(pg_temp.id('digits'), 'Change of plans') $$, 'nfa_customer_cancels_digit_booking');
select test_helpers.act_as_service();
select is(pg_temp.notice('op', 'digits', 'This booking is no longer assigned to you.'),
          'Your ' || (select service_name from public.service_bookings where id = pg_temp.id('digits')) || ' booking',
          'nfa_washer_notified_of_cancellation_with_service_name');

-- 3) A reference with letters keeps the reference in the title, as before.
select pg_temp.book('hex', pg_temp.at(4, 600), 'WL-8a19c4d0');
select test_helpers.act_as(pg_temp.id('op'));
select public.accept_dispatch_request(pg_temp.offer('hex'));
select test_helpers.act_as_service();
select is(pg_temp.notice('c1', 'hex', 'A washer accepted your booking.'), 'Booking WL-8a19c4d0', 'nfa_safe_reference_kept_in_title');

select * from finish();
rollback;
