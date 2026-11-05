-- B2C-6: closing bookings stops new offers and acceptance while accepted work continues (D-102), releases start the right round (D-104),
-- sweeps pick only rows needing action, soonest deadline first (D-105), and system transitions have a null actor (D-106).
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('b2c6-cls-c1@local.test')),
  ('bulk', test_helpers.create_customer('b2c6-cls-bulk@local.test')),
  ('w1', test_helpers.create_worker('b2c6-cls-w1@local.test')),
  ('w2', test_helpers.create_worker('b2c6-cls-w2@local.test')),
  ('w3', test_helpers.create_worker('b2c6-cls-w3@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  select id, 'verified', 14.5995, 120.9842, 20, false, now() from ids where k in ('w1', 'w2', 'w3');
insert into public.independent_worker_services select id, pg_temp.id('svc') from ids where k in ('w1', 'w2', 'w3');
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('w1'), d, 0, 1440 from generate_series(0, 6) d;

create function pg_temp.book(p_key text, p_at timestamptz default null) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', p_at is null, p_at, 'key-b2c6-' || p_key) r;
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;
create function pg_temp.accept(p_key text, p_worker text) returns void language plpgsql as $$
begin
  perform test_helpers.act_as(pg_temp.id(p_worker));
  perform public.accept_dispatch_request((select d.id from public.dispatch_requests d
    where d.booking_id = pg_temp.id(p_key) and d.worker_id = pg_temp.id(p_worker) and d.status = 'offered'));
  perform test_helpers.act_as_service();
end;
$$;
create function pg_temp.status(p_key text) returns text language sql stable as $$
  select status from public.service_bookings where id = pg_temp.id(p_key) $$;
create function pg_temp.offers(p_key text) returns integer language sql stable as $$
  select count(*)::int from public.dispatch_requests d where d.booking_id = pg_temp.id(p_key) and d.status = 'offered' $$;
-- Rows a sweep must process, written directly so a batch of them stays fast.
create function pg_temp.raw_bookings(p_prefix text, p_count integer, p_status text, p_immediate boolean, p_at timestamptz, p_deadline timestamptz)
returns void language sql as $$
  insert into public.service_bookings (reference, customer_id, service_id, service_name, vehicle_category, vehicle_make, vehicle_model,
      address, latitude, longitude, is_immediate, scheduled_at, duration_minutes, base_price_cents, vehicle_adjustment_cents, addons_total_cents,
      customer_total_cents, commission_bps, platform_fee_cents, worker_earnings_cents, status, submission_key, search_expires_at)
    select p_prefix || n, pg_temp.id('bulk'), pg_temp.id('svc'), 'Full wash', 'sedan', 'Toyota', 'Vios', '12 Sample Street, Makati City',
      14.5995, 120.9842, p_immediate, p_at, 60, 1000, 0, 0, 1000, 0, 0, 1000, p_status, 'key-' || p_prefix || n, p_deadline
    from generate_series(1, p_count) n $$;

-- ---------- closed: retry, accept, hidden offers, no new offers, searches still expire ----------
select pg_temp.book('retry');
update public.service_bookings set search_expires_at = now() - interval '1 second' where id = pg_temp.id('retry');
select public.service_dispatch_sweep(pg_temp.id('retry'));
update public.independent_workers set is_online = true where profile_id = pg_temp.id('w1');
select pg_temp.book('offer');
update public.platform_settings set bookings_open = false;

select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select public.retry_service_booking_search(pg_temp.id('retry')) $$, '23514',
                 'WashLink is not taking bookings right now. Try again later.', 'closed_retry_refused');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select * from public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.booking_id = pg_temp.id('offer'))) $$, '23514',
                 'WashLink is not taking bookings right now. Try again later.', 'closed_accept_refused');
select is((select count(*)::text from public.my_dispatch_requests()) || ',' || (select count(*)::text from public.dispatch_requests d where d.status = 'offered'),
          '0,1', 'closed_offers_hidden');
select test_helpers.act_as_service();

update public.independent_workers set is_online = true where profile_id = pg_temp.id('w2');
update public.dispatch_requests set expires_at = now() - interval '1 second' where booking_id = pg_temp.id('offer');
select public.service_dispatch_sweep(pg_temp.id('offer'));
select is(pg_temp.offers('offer') || ',' || pg_temp.status('offer'), '0,searching_for_worker', 'closed_sweep_makes_no_new_offer');
update public.service_bookings set search_expires_at = now() - interval '1 second' where id = pg_temp.id('offer');
select public.service_dispatch_sweep(pg_temp.id('offer'));
select is(pg_temp.status('offer'), 'no_worker_available', 'closed_search_still_expires');

-- ---------- closed: accepted work continues ----------
update public.platform_settings set bookings_open = true;
select pg_temp.book('work');
select pg_temp.accept('work', 'w1');
update public.platform_settings set bookings_open = false;
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.advance_service_booking(pg_temp.id('work'), 'accepted'), 'worker_on_the_way', 'closed_accepted_work_advances');
select public.release_service_booking(pg_temp.id('work'), 'My van broke down today');
select test_helpers.act_as_service();
select is(pg_temp.status('work') || ',' || pg_temp.offers('work'), 'searching_for_worker,0', 'closed_release_still_allowed');
update public.platform_settings set bookings_open = true;

-- ---------- release and time ----------
select pg_temp.book('past', ((now() at time zone 'Asia/Manila')::date + 2 + interval '10 hours') at time zone 'Asia/Manila');
select pg_temp.accept('past', 'w1');
update public.service_bookings set scheduled_at = now() - interval '1 hour' where id = pg_temp.id('past');
select test_helpers.act_as(pg_temp.id('w1'));
select public.release_service_booking(pg_temp.id('past'), 'My van broke down today');
select test_helpers.act_as_service();
select is(pg_temp.status('past'), 'expired', 'release_past_scheduled_expires');

select pg_temp.book('now');
select pg_temp.accept('now', 'w1');
update public.service_bookings set scheduled_at = now() - interval '1 hour' where id = pg_temp.id('now');
select test_helpers.act_as(pg_temp.id('w1'));
select public.release_service_booking(pg_temp.id('now'), 'My van broke down today');
select test_helpers.act_as_service();
select is((select scheduled_at from public.service_bookings where id = pg_temp.id('now')), now(), 'release_immediate_resets_time');

-- ---------- actors ----------
select pg_temp.book('actor');
update public.dispatch_requests set expires_at = now() - interval '1 second' where booking_id = pg_temp.id('actor');
update public.service_bookings set search_expires_at = now() - interval '1 second' where id = pg_temp.id('actor');
select test_helpers.act_as(pg_temp.id('c1'));
select count(*) as read_triggers_sweep from public.my_service_bookings();
select test_helpers.act_as_service();
select is((select count(*)::int from public.service_booking_status_events e where e.booking_id = pg_temp.id('actor')
             and e.to_status = 'no_worker_available' and e.actor_kind = 'system' and e.actor_id is null), 1, 'system_transition_actor_null');
select test_helpers.act_as(pg_temp.id('c1'));
select public.cancel_service_booking(pg_temp.id('actor')) is not null as cancelled;
select test_helpers.act_as_service();
select is((select e.actor_id from public.service_booking_status_events e where e.booking_id = pg_temp.id('actor') and e.to_status = 'cancelled'),
          pg_temp.id('c1'), 'customer_transition_actor_kept');

-- ---------- sweeps pick the rows needing action ----------
-- Immediate no_worker_available rows never leave, and they come first in the table, ahead of the booking that is due.
select pg_temp.raw_bookings('idle-', 205, 'no_worker_available', true, now(), now() - interval '2 days');
select pg_temp.raw_bookings('due-', 1, 'no_worker_available', false, now() - interval '1 hour', now() - interval '1 day');
select public.service_dispatch_sweep_all() as swept;
select is((select status from public.service_bookings where reference = 'due-1'), 'expired', 'sweep_reaches_due_booking_past_200_idle_rows');

-- The batch holds 200 of these 202 rows. The soonest deadline was written last, so a scan in table order would miss it.
select pg_temp.raw_bookings('later-', 201, 'searching_for_worker', true, now(), now() - interval '1 minute');
select pg_temp.raw_bookings('soonest-', 1, 'searching_for_worker', true, now(), now() - interval '1 hour');
select public.service_dispatch_sweep_all() as swept;
select is((select status from public.service_bookings where reference = 'soonest-1') || ','
          || (select count(*)::text from public.service_bookings where reference like 'later-%' and status = 'searching_for_worker'),
          'no_worker_available,2', 'sweep_soonest_deadline_first');

-- Going online reaches the booking with no live offer, past 55 others that already have one and an earlier deadline.
update public.service_bookings set status = 'cancelled' where reference like 'later-%' and status = 'searching_for_worker';
select pg_temp.raw_bookings('live-', 55, 'searching_for_worker', true, now(), now() + interval '5 minutes');
insert into public.dispatch_requests (booking_id, worker_id, expires_at)
  select id, pg_temp.id('w1'), now() + interval '1 hour' from public.service_bookings where reference like 'live-%';
select pg_temp.raw_bookings('needs-', 1, 'searching_for_worker', true, now(), now() + interval '20 minutes');
select test_helpers.act_as(pg_temp.id('w3'));
select public.set_independent_worker_online(true) is not null as online;
select test_helpers.act_as_service();
select is((select count(*)::int from public.dispatch_requests d join public.service_bookings b on b.id = d.booking_id
           where b.reference = 'needs-1' and d.worker_id = pg_temp.id('w3') and d.status = 'offered'), 1, 'online_sweep_reaches_booking_needing_offer');

select is((select coalesce(string_agg(f, ','), '-') from unnest(array[
    'public.service_dispatch_distance_band(numeric)', 'public.service_booking_reset_search(uuid)', 'public.service_booking_requeue(uuid,text,text)',
    'public.independent_worker_skills_are_valid(text[])', 'public.customer_saved_details_enforce_cap()', 'public.auth_recent_password_sign_in(integer)']) f
  where has_function_privilege('authenticated', f::regprocedure, 'execute')
     or has_function_privilege('anon', f::regprocedure, 'execute')
     or has_function_privilege('service_role', f::regprocedure, 'execute')
     or has_function_privilege('public', f::regprocedure, 'execute')), '-', 'new_internal_functions_not_callable_by_clients');

select * from finish();
rollback;
