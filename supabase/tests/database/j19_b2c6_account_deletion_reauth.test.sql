-- B2C-6: account deletion needs a recent password sign-in, carried by the JWT amr claim (D-90), and refuses anyone on the shop booking
-- table (D-91). It also clears request distance and vehicle year, and writes one audit event. Local Docker stack only; synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table ids (k text primary key, id uuid) on commit drop;
grant select on ids to public;
create function pg_temp.id(p text) returns uuid language sql stable as $$ select id from ids where k = p $$;
insert into ids values
  ('c1', test_helpers.create_customer('b2c6-del-c1@local.test')),
  ('c2', test_helpers.create_customer('b2c6-del-c2@local.test')),
  ('c3', test_helpers.create_customer('b2c6-del-c3@local.test')),
  ('w1', test_helpers.create_worker('b2c6-del-w1@local.test')),
  ('o1', test_helpers.create_owner('b2c6-del-o1@local.test'));
insert into ids values ('s1', test_helpers.create_shop(pg_temp.id('o1')));
insert into ids values ('b2b_open', test_helpers.create_booking_fixture(pg_temp.id('c2'), pg_temp.id('s1'))),
                       ('b2b_cancelled', test_helpers.create_booking_fixture(pg_temp.id('c3'), pg_temp.id('s1'), 'cancelled'));

update public.services set price_is_draft = false;
update public.service_addons set price_is_draft = false;
update public.platform_settings set bookings_open = true;
insert into public.independent_workers (profile_id, verification_status, base_latitude, base_longitude, service_radius_km, is_online, last_seen_at)
  values (pg_temp.id('w1'), 'verified', 14.5995, 120.9842, 20, true, now());
insert into public.independent_worker_services select pg_temp.id('w1'), id from public.services;

-- c1 has an ended booking whose request carries a distance band.
select test_helpers.act_as(pg_temp.id('c1'));
create temporary table made on commit drop as
  select * from public.create_service_booking((select id from public.services where key = 'full_wash'), 'sedan', 'Toyota', 'Vios', 2020, '{}',
    '12 Sample Street, Makati City', 14.5995, 120.9842, '', '', true, null, 'key-b2c6-del-1');
grant select on made to public;
select public.cancel_service_booking((select booking_id from made)) is not null as cancelled;

create function pg_temp.refused_shapes() returns integer language plpgsql as $$
declare
  shape jsonb;
  refused integer := 0;
begin
  foreach shape in array array['"password"'::jsonb, '{"method": "password"}', '["password"]', '[{"method": "password"}]',
      '[{"method": "password", "timestamp": "soon"}]', '[{"method": "password", "timestamp": null}]', '[null]'] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id('c1'), 'role', 'authenticated', 'amr', shape)::text, true);
    begin
      perform public.delete_my_account();
    exception when insufficient_privilege then
      if sqlerrm = 'Enter your password again to delete this account.' then
        refused := refused + 1;
      end if;
    end;
  end loop;
  return refused;
end;
$$;

select test_helpers.act_as(pg_temp.id('c1'));
select throws_ok('select public.delete_my_account()', '42501', 'Enter your password again to delete this account.', 'delete_refused_without_amr');
select test_helpers.act_as_with_amr(pg_temp.id('c1'), 0, 'otp');
select throws_ok('select public.delete_my_account()', '42501', 'Enter your password again to delete this account.', 'delete_refused_with_otp_amr');
select test_helpers.act_as_with_amr(pg_temp.id('c1'), 301);
select throws_ok('select public.delete_my_account()', '42501', 'Enter your password again to delete this account.', 'delete_refused_with_stale_password');
select test_helpers.act_as_with_amr(pg_temp.id('c1'), -120);
select throws_ok('select public.delete_my_account()', '42501', 'Enter your password again to delete this account.', 'delete_refused_with_future_timestamp');
select test_helpers.act_as(pg_temp.id('c1'));
select is(pg_temp.refused_shapes(), 7, 'delete_refused_with_malformed_amr');

select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events where action = 'account.self_deleted' and subject_id = pg_temp.id('c1')), 0,
          'delete_refused_leaves_no_audit_event');

-- Shop booking history refuses for any status, with a recent password, so the refusal is the shop booking rule.
select test_helpers.act_as_with_amr(pg_temp.id('c2'));
select throws_ok('select public.delete_my_account()', '42501', 'This account can''t be deleted here. Only WashLink can close it.', 'delete_refused_with_b2b_booking');
select test_helpers.act_as_with_amr(pg_temp.id('c3'));
select throws_ok('select public.delete_my_account()', '42501', 'This account can''t be deleted here. Only WashLink can close it.', 'delete_refused_with_cancelled_b2b_booking');
select test_helpers.act_as_service();
select is((select count(*)::int from public.bookings b where b.id in (pg_temp.id('b2b_open'), pg_temp.id('b2b_cancelled'))
             and b.customer_id in (pg_temp.id('c2'), pg_temp.id('c3')) and b.address = 'Local test address'
             and b.customer_name = 'Local Test Customer')
          + (select count(*)::int from auth.users u where u.id in (pg_temp.id('c2'), pg_temp.id('c3'))), 4, 'b2b_booking_untouched_after_refusal');

select test_helpers.act_as_with_amr(pg_temp.id('c1'), 299);
select lives_ok('select public.delete_my_account()', 'delete_allowed_at_recent_password');

select test_helpers.act_as_service();
select is((select count(*)::int from public.workforce_audit_events where action = 'account.self_deleted' and subject_type = 'account'
             and subject_id = pg_temp.id('c1') and subject_profile_id = pg_temp.id('c1') and actor_id = pg_temp.id('c1')
             and payload = '{"role": "customer"}'::jsonb), 1, 'delete_writes_audit_event');
select is((select count(*)::text || ',' || count(*) filter (where d.distance_km is null)::text from public.dispatch_requests d
           where d.booking_id = (select booking_id from made)), '1,1', 'delete_nulls_request_distance');
select results_eq($$ select b.vehicle_year, b.address, b.customer_id from public.service_bookings b where b.id = (select booking_id from made) $$,
                  $$ values (null::integer, 'Removed at customer request'::text, null::uuid) $$, 'delete_nulls_vehicle_year');

select ok(not exists (select 1 from unnest(array['anon', 'authenticated', 'service_role', 'public']) r
                      where has_function_privilege(r, 'public.auth_recent_password_sign_in(integer)', 'execute')),
          'password_helper_not_callable_by_clients');

-- Runs the backfill statements recorded for the real migration on a booking deleted under the old function.
insert into ids select 'old', booking_id from made;
update public.service_bookings set vehicle_year = 2019 where id = pg_temp.id('old');
update public.dispatch_requests set distance_km = 5 where booking_id = pg_temp.id('old');
do $$
declare
  statement text;
begin
  for statement in select st from supabase_migrations.schema_migrations m, unnest(m.statements) st
                   where m.name = 'b2ck_account_deletion_hardening' and st !~* 'create or replace function'
                     and st ~* '(update public\.dispatch_requests d set distance_km = null|update public\.service_bookings set vehicle_year = null)' loop
    execute statement;
  end loop;
end $$;
select results_eq($$ select b.vehicle_year, d.distance_km from public.service_bookings b join public.dispatch_requests d on d.booking_id = b.id
                     where b.id = pg_temp.id('old') $$, $$ values (null::integer, null::numeric) $$, 'delete_backfill_clears_old_rows');

select * from finish();
rollback;
