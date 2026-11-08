-- B2C-6: caps and validated shapes on what clients can write (D-100), and legacy rows normalised before validating (D-101).
-- Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('b2c6-lim-c1@local.test')),
  ('c2', test_helpers.create_customer('b2c6-lim-c2@local.test')),
  ('c3', test_helpers.create_customer('b2c6-lim-c3@local.test')),
  ('w1', test_helpers.create_worker('b2c6-lim-w1@local.test')),
  ('svc', (select id from public.services where key = 'full_wash'));
update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  values (pg_temp.id('w1'), 'verified', 14.5995, 120.9842, 20, true, now());
insert into public.independent_worker_services values (pg_temp.id('w1'), pg_temp.id('svc'));

create function pg_temp.report(p_booking uuid) returns void language sql as $$
  select public.report_service_booking_problem(p_booking, 'The gate was locked on arrival') $$;
create function pg_temp.add_address(p_customer uuid) returns void language sql as $$
  insert into public.customer_addresses (customer_id, label, address, latitude, longitude) values (p_customer, 'Home', '12 Ayala Avenue, Makati', 14.5, 121) $$;
create function pg_temp.add_vehicle(p_customer uuid) returns void language sql as $$
  insert into public.customer_vehicles (customer_id, category, make, model) values (p_customer, 'sedan', 'Toyota', 'Vios') $$;
create function pg_temp.token(n integer) returns text language sql immutable as $$ select 'ExponentPushToken[abcdefghij' || n || ']' $$;
create function pg_temp.book(p_key text, p_year integer) returns uuid language sql as $$
  select r.booking_id from public.create_service_booking(pg_temp.id('svc'), 'sedan', 'Toyota', 'Vios', p_year, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', true, null, 'key-b2c6-' || p_key) r $$;

-- ---------- reports ----------
select test_helpers.act_as(pg_temp.id('c1'));
create temporary table made on commit drop as select pg_temp.book('lim-1', 2020) as booking;
grant select on made to public;
select test_helpers.act_as(pg_temp.id('w1'));
select * from public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.booking_id = (select booking from made)));
select test_helpers.act_as(pg_temp.id('c1'));
select count(pg_temp.report((select booking from made))) as reports from generate_series(1, 5);
select throws_ok($$ select pg_temp.report((select booking from made)) $$, '23514', 'You have reached the limit of 5 problem reports for this booking.', 'sixth_report_refused');
select test_helpers.act_as(pg_temp.id('w1'));
select lives_ok($$ select pg_temp.report((select booking from made)) $$, 'other_party_report_still_allowed');

-- ---------- saved details: the count is per customer, and direct inserts run through the trigger ----------
select test_helpers.act_as(pg_temp.id('c1'));
select count(pg_temp.add_address(pg_temp.id('c1'))) as addresses, count(pg_temp.add_vehicle(pg_temp.id('c1'))) as vehicles from generate_series(1, 20);
select throws_ok($$ select pg_temp.add_address(pg_temp.id('c1')) $$, '23514', 'You can save up to 20 addresses. Delete one to add another.', 'twenty_first_address_refused');
select throws_ok($$ select pg_temp.add_vehicle(pg_temp.id('c1')) $$, '23514', 'You can save up to 20 vehicles. Delete one to add another.', 'twenty_first_vehicle_refused');
select test_helpers.act_as(pg_temp.id('c3'));
select throws_ok($$ select pg_temp.add_address(pg_temp.id('c1')) $$, '42501', null, 'cap_count_not_revealed_to_other_customer');
select lives_ok($$ select pg_temp.add_address(pg_temp.id('c3')); select pg_temp.add_vehicle(pg_temp.id('c3')) $$, 'other_user_rows_not_counted');

-- A customer already over the cap keeps their rows and can delete them.
select test_helpers.act_as_service();
alter table public.customer_addresses disable trigger customer_addresses_enforce_cap;
select count(pg_temp.add_address(pg_temp.id('c2'))) as addresses from generate_series(1, 22);
alter table public.customer_addresses enable trigger customer_addresses_enforce_cap;
select test_helpers.act_as(pg_temp.id('c2'));
select lives_ok($$ delete from public.customer_addresses where id = (select a.id from public.customer_addresses a limit 1) $$, 'over_cap_customer_can_delete');

-- ---------- shapes ----------
select test_helpers.act_as(pg_temp.id('w1'));
select throws_ok($$ select public.save_independent_worker_profile('', array[repeat('x', 41)], 14.5995, 120.9842, 20) $$, '23514',
                 'Each skill must be 1 to 40 characters.', 'long_skill_refused');
select test_helpers.act_as(pg_temp.id('c3'));
select throws_ok($$ select pg_temp.book('lim-year', 1800) $$, '23514',
                 'new row for relation "service_bookings" violates check constraint "service_bookings_vehicle_year_check"', 'bad_vehicle_year_refused');
select throws_ok($$ select public.register_device_push_token('not-a-push-token', 'android') $$, '22023',
                 'This device could not be registered for notifications.', 'bad_token_refused');
select public.register_device_push_token(pg_temp.token(1), 'android');
select test_helpers.act_as_service();
select is((select profile_id from public.device_push_tokens where token = pg_temp.token(1)), pg_temp.id('c3'), 'valid_expo_token_saved');

-- ---------- ten tokens, oldest evicted ----------
select test_helpers.act_as(pg_temp.id('c3'));
select count(public.register_device_push_token(pg_temp.token(n), 'android')) as tokens from generate_series(2, 10) n;
select test_helpers.act_as_service();
update public.device_push_tokens set last_seen_at = now() - interval '1 day' where token = pg_temp.token(4);
select test_helpers.act_as(pg_temp.id('c3'));
select public.register_device_push_token(pg_temp.token(11), 'android');
select test_helpers.act_as_service();
select is((select count(*)::text || ',' || count(*) filter (where token = pg_temp.token(4))::text || ',' || count(*) filter (where token = pg_temp.token(11))::text
           from public.device_push_tokens where profile_id = pg_temp.id('c3')), '10,0,1', 'eleventh_token_evicts_oldest');

select is((select count(*)::int from pg_constraint where convalidated and conname in
            ('independent_workers_skills_valid', 'service_bookings_vehicle_year_check', 'device_push_tokens_token_format')), 3, 'constraints_are_validated');

-- Runs the statements recorded for the real migration on rows shaped like legacy data.
alter table public.independent_workers drop constraint independent_workers_skills_valid;
alter table public.service_bookings drop constraint service_bookings_vehicle_year_check;
alter table public.device_push_tokens drop constraint device_push_tokens_token_format;
update public.independent_workers set skills = array['  Foam wash  ', '   ', repeat('x', 45)] where profile_id = pg_temp.id('w1');
update public.service_bookings set vehicle_year = 1800 where id = (select booking from made);
insert into public.device_push_tokens (profile_id, token, platform) values (pg_temp.id('c2'), 'legacy-malformed-token', 'android');
do $$
declare
  statement text;
begin
  for statement in select st from supabase_migrations.schema_migrations m, unnest(m.statements) st
                   where m.name = 'b2cj_write_limits' and st !~* 'create or replace function'
                     and st ~* '(update public\.independent_workers w|update public\.service_bookings set vehicle_year = null|delete from public\.device_push_tokens where token)' loop
    execute statement;
  end loop;
end $$;
select results_eq($$ select (select skills from public.independent_workers where profile_id = pg_temp.id('w1')),
                            (select vehicle_year from public.service_bookings where id = (select booking from made)),
                            (select count(*)::int from public.device_push_tokens where token = 'legacy-malformed-token') $$,
                  $$ values (array['Foam wash', repeat('x', 40)], null::integer, 0) $$, 'legacy_rows_normalised_by_the_migration');

select * from finish();
rollback;
