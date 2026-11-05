-- B2C authorization pins: RLS on, exact grants per role, no service_role access, what anon may read, what Realtime
-- publishes, and which functions no client may call. Any new grant on a B2C table fails here.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table b2c_tables (name text primary key, anon_privs text, authenticated_privs text) on commit drop;
insert into b2c_tables values
  ('customer_addresses', '-', 'DELETE INSERT SELECT UPDATE'),
  ('customer_vehicles', '-', 'DELETE INSERT SELECT UPDATE'),
  ('device_push_tokens', '-', '-'),
  ('dispatch_requests', '-', 'SELECT'),
  ('independent_worker_hours', '-', 'DELETE INSERT SELECT UPDATE'),
  ('independent_worker_services', '-', 'DELETE INSERT SELECT UPDATE'),
  ('independent_workers', '-', 'SELECT'),
  ('platform_settings', '-', '-'),
  ('service_addons', 'SELECT', 'SELECT'),
  ('service_booking_reviews', '-', '-'),
  ('service_booking_status_events', '-', '-'),
  ('service_bookings', '-', 'SELECT'),
  ('service_vehicle_prices', 'SELECT', 'SELECT'),
  ('services', 'SELECT', 'SELECT');

create function pg_temp.privs(p_role text, p_table text) returns text language sql stable as $$
  select coalesce(string_agg(p, ' ' order by p), '-')
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  where has_table_privilege(p_role, 'public.' || p_table, p) $$;

select is((select coalesce(string_agg(t.name, ','), '-') from b2c_tables t join pg_class c on c.oid = ('public.' || t.name)::regclass
           where not c.relrowsecurity), '-', 'b2c_every_table_has_rls');
select is((select coalesce(string_agg(name, ','), '-') from b2c_tables where pg_temp.privs('anon', name) <> anon_privs), '-',
          'b2c_anon_reads_only_the_public_catalog');
select is((select coalesce(string_agg(name, ','), '-') from b2c_tables where pg_temp.privs('authenticated', name) <> authenticated_privs), '-',
          'b2c_authenticated_grants_are_exact');
select is((select coalesce(string_agg(name, ','), '-') from b2c_tables where pg_temp.privs('service_role', name) <> '-'), '-',
          'b2c_service_role_has_no_table_access');
select is((select coalesce(string_agg(name, ','), '-') from b2c_tables where pg_temp.privs('public', name) <> '-'), '-',
          'b2c_public_role_has_no_table_access');
select is((select string_agg(tablename, ',' order by tablename) from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public'
             and tablename in (select name from b2c_tables)), 'dispatch_requests,service_bookings',
          'b2c_realtime_publishes_only_bookings_and_requests');

select is((select coalesce(string_agg(f, ','), '-') from unnest(array[
    'public.service_booking_record_transition(uuid,text,text,text)', 'public.service_booking_dispatch(uuid)',
    'public.service_dispatch_sweep(uuid)', 'public.service_dispatch_sweep_all()', 'public.service_dispatch_close_offers(uuid,text,boolean)',
    'public.service_booking_price(uuid,text,uuid[],boolean)', 'public.b2c_require_super_admin()',
    'public.independent_worker_is_eligible(uuid,uuid,timestamptz,integer,double precision,double precision,boolean,uuid)',
    'public.independent_worker_has_conflict(uuid,timestamptz,integer,uuid)', 'public.service_bookings_guard_update()']) f
  where has_function_privilege('authenticated', f::regprocedure, 'execute')
     or has_function_privilege('anon', f::regprocedure, 'execute')
     or has_function_privilege('service_role', f::regprocedure, 'execute')), '-', 'b2c_internal_functions_not_callable_by_clients');

select is((select coalesce(string_agg(p.proname, ','), '-') from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosecdef
             and p.proname ~ '^(service_|independent_worker|my_service|my_dispatch|my_assigned|my_independent|accept_dispatch|decline_dispatch|advance_service|release_service|report_service|cancel_service|create_service|retry_service|review_service|admin_save|admin_set_service|admin_catalog|admin_update_platform|admin_independent|admin_review_independent|admin_service|admin_b2c|b2c_|register_device|remove_device|save_independent|set_independent)'
             and not coalesce(p.proconfig::text ~ 'search_path=public, pg_temp', false)), '-', 'b2c_definer_functions_pin_search_path');

-- A worker's request read carries no location or identity.
select is((select coalesce(string_agg(a, ','), '-') from pg_proc p, unnest(p.proargnames) a
           where p.proname = 'my_dispatch_requests' and a in ('address', 'latitude', 'longitude', 'landmark', 'instructions', 'customer_name', 'customer_phone')),
          '-', 'b2c_dispatch_request_read_has_no_location_or_identity');
select is((select coalesce(string_agg(column_name, ','), '-') from information_schema.columns
           where table_schema = 'public' and table_name = 'dispatch_requests'
             and column_name in ('address', 'latitude', 'longitude', 'landmark', 'instructions')),
          '-', 'b2c_dispatch_request_table_has_no_location');

select * from finish();
rollback;
