-- B2C-6: a scheduled job's steps open 2 hours before its time (D-98), and a customer can leave a job once it is 60 minutes past its
-- expected end (D-99). pgTAP's now() is fixed, so time-based cases move scheduled_at from a trusted session. Local Docker stack only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('b2c6-win-c1@local.test')),
  ('w1', test_helpers.create_worker('b2c6-win-w1@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  values (pg_temp.id('w1'), 'verified', 14.5995, 120.9842, 20, true, now());
insert into public.independent_worker_services values (pg_temp.id('w1'), pg_temp.id('svc'));
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select pg_temp.id('w1'), d, 0, 1440 from generate_series(0, 6) d;

create function pg_temp.book_and_accept(p_key text, p_days integer default null) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id('c1'));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', p_days is null,
    ((now() at time zone 'Asia/Manila')::date + p_days + interval '10 hours') at time zone 'Asia/Manila', 'key-b2c6-' || p_key) r;
  perform test_helpers.act_as(pg_temp.id('w1'));
  perform public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.booking_id = made and d.status = 'offered'));
  perform test_helpers.act_as_service();
  insert into ids values (p_key, made);
end;
$$;

select is((select worker_start_window_minutes || ',' || overdue_cancel_grace_minutes from public.platform_settings), '120,60', 'settings_defaults_are_120_and_60');
select is((select worker_arrival_window_minutes from public.platform_settings), 30, 'arrival_window_default_is_30');

-- ---------- the start window ----------
select pg_temp.book_and_accept('sch', 3);
update public.service_bookings set scheduled_at = now() + interval '121 minutes' where id = pg_temp.id('sch');
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select public.advance_service_booking(pg_temp.id('sch'), 'accepted') $$, '23514',
                 'This booking can''t start yet. You can begin up to 2 hours before its scheduled time.', 'scheduled_advance_refused_before_window');
select test_helpers.act_as_service();
update public.service_bookings set scheduled_at = now() + interval '119 minutes' where id = pg_temp.id('sch');
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.advance_service_booking(pg_temp.id('sch'), 'accepted'), 'worker_on_the_way', 'scheduled_advance_allowed_in_window');
select throws_ok($$ select public.advance_service_booking(pg_temp.id('sch'), 'worker_on_the_way') $$, '23514',
                 'It''s too early for this step. You can mark arrival up to 30 minutes before the scheduled time.', 'arrival_refused_before_arrival_window');
select test_helpers.act_as_service();
update public.service_bookings set scheduled_at = now() + interval '29 minutes' where id = pg_temp.id('sch');
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.advance_service_booking(pg_temp.id('sch'), 'worker_on_the_way'), 'arrived', 'arrival_allowed_in_arrival_window');
select test_helpers.act_as_service();
update public.service_bookings set status = 'cancelled' where id = pg_temp.id('sch');

-- Immediate bookings are not held by the window, even with a later time on the row.
select pg_temp.book_and_accept('imm');
update public.service_bookings set scheduled_at = now() + interval '5 hours' where id = pg_temp.id('imm');
select test_helpers.act_as(pg_temp.id('w1'));
select is(public.advance_service_booking(pg_temp.id('imm'), 'accepted'), 'worker_on_the_way', 'immediate_advance_not_delayed');
select test_helpers.act_as_service();
update public.service_bookings set status = 'cancelled' where id = pg_temp.id('imm');

-- ---------- overdue cancel: 60 minutes after scheduled_at + duration ----------
select pg_temp.book_and_accept('arr', 4);
update public.service_bookings set status = 'worker_on_the_way' where id = pg_temp.id('arr');
update public.service_bookings set status = 'arrived', scheduled_at = now() - make_interval(mins => duration_minutes + 59) where id = pg_temp.id('arr');
select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok($$ select public.cancel_service_booking(pg_temp.id('arr')) $$, '23514', 'This booking can no longer be cancelled here.',
                 'customer_cancel_arrived_refused_before_overdue');
select test_helpers.act_as_service();
update public.service_bookings set scheduled_at = now() - make_interval(mins => duration_minutes + 61) where id = pg_temp.id('arr');
select test_helpers.act_as(pg_temp.id('c1'));
select lives_ok($$ select public.cancel_service_booking(pg_temp.id('arr')) $$, 'customer_cancel_arrived_allowed_when_overdue');
select test_helpers.act_as_service();
select results_eq($$ select b.status, e.actor_kind, e.actor_id from public.service_bookings b
                     join public.service_booking_status_events e on e.booking_id = b.id and e.to_status = 'cancelled' where b.id = pg_temp.id('arr') $$,
                  $$ values ('cancelled'::text, 'customer'::text, pg_temp.id('c1')) $$, 'overdue_cancel_recorded_as_customer');

select pg_temp.book_and_accept('prog', 5);
update public.service_bookings set status = 'worker_on_the_way' where id = pg_temp.id('prog');
update public.service_bookings set status = 'arrived' where id = pg_temp.id('prog');
update public.service_bookings set status = 'in_progress', scheduled_at = now() - make_interval(mins => duration_minutes + 61) where id = pg_temp.id('prog');
select test_helpers.act_as(pg_temp.id('c1'));
select lives_ok($$ select public.cancel_service_booking(pg_temp.id('prog')) $$, 'customer_cancel_in_progress_allowed_when_overdue');

select * from finish();
rollback;
