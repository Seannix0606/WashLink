-- B2C-6: a washer who is not verified loses customer data and job control, unstarted jobs return to search and started jobs stay
-- for the admin, who cancels them with a reason (D-92, D-93). Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('admin', test_helpers.create_super_admin('b2c6-sus-admin@local.test')),
  ('c1', test_helpers.create_customer('b2c6-sus-c1@local.test')),
  ('c2', test_helpers.create_customer('b2c6-sus-c2@local.test')),
  ('wa', test_helpers.create_worker('b2c6-sus-wa@local.test')),
  ('wb', test_helpers.create_worker('b2c6-sus-wb@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true, max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  select id, 'verified', 14.5995, 120.9842, 20, true, now() from ids where k in ('wa', 'wb');
insert into public.independent_worker_services select id, pg_temp.id('svc') from ids where k in ('wa', 'wb');
insert into public.independent_worker_hours (worker_id, weekday, start_minute, end_minute)
  select i.id, d, 0, 1440 from ids i cross join generate_series(0, 6) d where i.k in ('wa', 'wb');

-- A fixed clock hour on a later Manila day, so the wash always fits inside one local day.
create function pg_temp.manila(p_days integer) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + p_days + interval '10 hours') at time zone 'Asia/Manila' $$;
create function pg_temp.book(p_key text, p_customer text, p_days integer) returns void language plpgsql as $$
declare
  made uuid;
begin
  perform test_helpers.act_as(pg_temp.id(p_customer));
  select r.booking_id into made from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, 'Blue gate', 'Ring twice', false, pg_temp.manila(p_days), 'key-b2c6-' || p_key) r;
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

select pg_temp.book('arrived', 'c1', 2);
select pg_temp.book('started', 'c2', 3);
select pg_temp.book('accepted', 'c1', 4);
select pg_temp.book('on_way', 'c2', 5);
select pg_temp.book('offer', 'c1', 6);
select pg_temp.book('past', 'c2', 7);
select pg_temp.accept(k, 'wa') from (values ('arrived'), ('started'), ('accepted'), ('on_way'), ('past')) v(k);
update public.service_bookings set status = 'worker_on_the_way' where id in (pg_temp.id('arrived'), pg_temp.id('started'), pg_temp.id('on_way'));
update public.service_bookings set status = 'arrived' where id in (pg_temp.id('arrived'), pg_temp.id('started'));
update public.service_bookings set status = 'in_progress' where id = pg_temp.id('started');
update public.service_bookings set scheduled_at = now() - interval '1 hour' where id = pg_temp.id('past');

select test_helpers.act_as(pg_temp.id('admin'));
select public.admin_review_independent_worker(pg_temp.id('wa'), 'suspended', 'Paused while we check this') is not null as suspended;

select test_helpers.act_as(pg_temp.id('wa'));
select is((select count(*)::int from public.my_assigned_service_bookings() a where a.booking_id = pg_temp.id('arrived')
             and a.address is null and a.latitude is null and a.longitude is null and a.landmark is null and a.instructions is null),
          1, 'suspended_worker_address_hidden');
select is((select count(*)::int from public.my_assigned_service_bookings() a where a.booking_id = pg_temp.id('arrived')
             and a.customer_name is null and a.customer_phone is null), 1, 'suspended_worker_contact_hidden');
select throws_ok($$ select public.advance_service_booking(pg_temp.id('arrived'), 'arrived') $$, '23514',
                 'WashLink has paused your account. Contact WashLink about this booking.', 'suspended_worker_cannot_advance');

select test_helpers.act_as_service();
select is(pg_temp.status('accepted'), 'searching_for_worker', 'suspend_returns_accepted_to_search');
select is(pg_temp.status('on_way'), 'searching_for_worker', 'suspend_returns_on_the_way_to_search');
select is((select count(*)::int from public.service_bookings where id in (pg_temp.id('accepted'), pg_temp.id('on_way')) and worker_id is null), 2,
          'suspend_clears_worker_on_booking');
select is((select count(*) filter (where status = 'offered')::text || ',' || count(*) filter (where status = 'declined' and booking_id = pg_temp.id('offer'))::text
           from public.dispatch_requests where worker_id = pg_temp.id('wa')), '0,1', 'suspend_closes_open_offers');
select results_eq($$ select status, worker_id from public.service_bookings where id in (pg_temp.id('arrived'), pg_temp.id('started')) order by status $$,
                  $$ values ('arrived'::text, pg_temp.id('wa')), ('in_progress'::text, pg_temp.id('wa')) $$, 'suspend_leaves_arrived_for_admin');
select is(pg_temp.status('past') || ',' || (select count(*)::text from public.service_booking_status_events e
            where e.booking_id = pg_temp.id('past') and e.to_status = 'expired' and e.actor_id is null and e.actor_kind = 'system'),
          'expired,1', 'past_scheduled_booking_expires_on_suspend');
select is((select payload from public.workforce_audit_events where action = 'independent_worker.reviewed' and subject_id = pg_temp.id('wa')
           and payload ->> 'verification_status' = 'suspended' order by id limit 1),
          '{"verification_status": "suspended", "offers_closed": 1, "bookings_returned_to_search": 3, "started_jobs_left": 2}'::jsonb,
          'suspend_audit_has_counts');

-- The old accepted row was cleared, so dispatch_requests_one_accepted does not refuse the next washer.
select lives_ok($$ select pg_temp.accept('accepted', 'wb') $$, 'next_worker_can_accept_after_suspend');
select test_helpers.act_as_service();

-- The other non-verified statuses.
select test_helpers.act_as(pg_temp.id('admin'));
select public.admin_review_independent_worker(pg_temp.id('wa'), 'rejected', 'Rejected while we check this') is not null as rejected;
select test_helpers.act_as(pg_temp.id('wa'));
select throws_ok($$ select public.advance_service_booking(pg_temp.id('arrived'), 'arrived') $$, '23514',
                 'WashLink has paused your account. Contact WashLink about this booking.', 'rejected_worker_cannot_advance');
select test_helpers.act_as(pg_temp.id('admin'));
select public.admin_review_independent_worker(pg_temp.id('wa'), 'pending', null) is not null as pending;
select test_helpers.act_as(pg_temp.id('wa'));
select throws_ok($$ select public.advance_service_booking(pg_temp.id('arrived'), 'arrived') $$, '23514',
                 'WashLink has paused your account. Contact WashLink about this booking.', 'pending_worker_cannot_advance');

-- Verified again, online again, and the washer's earlier jobs are not offered back (D-92).
select test_helpers.act_as_service();
select test_helpers.give_worker_approved_documents(pg_temp.id('wa'));
select test_helpers.act_as(pg_temp.id('admin'));
select public.admin_review_independent_worker(pg_temp.id('wa'), 'verified', null) is not null as verified;
select test_helpers.act_as_service();
update public.dispatch_requests set expires_at = now() - interval '1 second' where booking_id = pg_temp.id('on_way') and status = 'offered';
select test_helpers.act_as(pg_temp.id('wa'));
select public.set_independent_worker_online(true) is not null as online;
select test_helpers.act_as_service();
select public.service_dispatch_sweep(pg_temp.id('on_way'));
select is((select count(*)::int from public.dispatch_requests d where d.booking_id = pg_temp.id('on_way') and d.worker_id = pg_temp.id('wa') and d.status = 'offered'), 0,
          'suspended_worker_not_reoffered_after_reverify');

-- Admin cancel of started jobs. No new RPC, and the reason is required.
select test_helpers.act_as(pg_temp.id('wb'));
select throws_ok($$ select public.cancel_service_booking(pg_temp.id('arrived'), 'Not my booking at all') $$, '42501', 'Booking not found.', 'non_admin_cannot_use_admin_cancel');
select test_helpers.act_as(pg_temp.id('admin'));
select throws_ok($$ select public.cancel_service_booking(pg_temp.id('arrived'), 'too short') $$, '23514', 'Give a reason of at least 10 characters.', 'admin_cancel_needs_reason');
select is((select e.reason from public.cancel_service_booking(pg_temp.id('arrived'), 'Washer was suspended on this job') e), 'Washer was suspended on this job',
          'admin_cancels_arrived_with_reason');
select is((select e.to_status from public.cancel_service_booking(pg_temp.id('started'), 'Washer was suspended on this job') e), 'cancelled',
          'admin_cancels_in_progress_with_reason');
select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events where action = 'service_booking.status_changed' and actor_id = pg_temp.id('admin')
             and subject_id in (pg_temp.id('arrived'), pg_temp.id('started'))
             and payload ->> 'to_status' = 'cancelled' and payload ->> 'changed_by' = 'super_admin'), 2, 'admin_cancel_is_audited');

select * from finish();
rollback;
