-- LOCAL TEST BASELINE ONLY - NEVER APPLY TO A REAL PROJECT
-- =============================================================
-- WashLink W1 pgTAP helpers. Loaded as the db.seed of the staged
-- .local-supabase-test/ workdir only (after every migration has replayed).
--
-- Schema test_helpers is not exposed through PostgREST. Every function is
-- SECURITY INVOKER: role switching is not allowed inside security definer.
-- Identity helpers switch with set_config(..., true), i.e. transaction-local;
-- each test file runs inside begin ... rollback.
--
-- W2 S11 WARNING: this file grants EXECUTE on every test_helpers function
-- to anon and authenticated, and contains act_as_service(), which drops
-- the JWT claims (a trusted session for public.is_trusted_db_session()).
-- That is acceptable ONLY on the local Docker stack staged under a
-- "*-local-test" project_id. Never load it into a real project; the repo
-- config keeps [db.seed] disabled and only the staged copy enables it.
-- =============================================================

create schema if not exists test_helpers;

-- -------------------------------------------------------------
-- Users (the baseline signup trigger creates the profile)
-- -------------------------------------------------------------
create or replace function test_helpers.create_user(
  p_email text,
  p_role text default 'customer',
  p_full_name text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(p_email),
    extensions.crypt('local-test-password', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('role', p_role, 'full_name', p_full_name),
    now(),
    now()
  );
  return new_user_id;
end;
$$;

create or replace function test_helpers.create_customer(p_email text)
returns uuid language sql security invoker
as $$ select test_helpers.create_user(p_email, 'customer', 'Local Test Customer') $$;

create or replace function test_helpers.create_owner(p_email text)
returns uuid language sql security invoker
as $$ select test_helpers.create_user(p_email, 'owner', 'Local Test Owner') $$;

create or replace function test_helpers.create_worker(p_email text)
returns uuid language sql security invoker
as $$ select test_helpers.create_user(p_email, 'worker', 'Local Test Worker') $$;

-- Mirrors D-8: super_admin is only granted by SQL run as a non-JWT session.
create or replace function test_helpers.create_super_admin(p_email text)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_user_id uuid;
begin
  new_user_id := test_helpers.create_user(p_email, 'customer', 'Local Test Admin');
  update public.profiles set role = 'super_admin' where id = new_user_id;
  return new_user_id;
end;
$$;

-- -------------------------------------------------------------
-- Identity switching
-- -------------------------------------------------------------
create or replace function test_helpers.act_as_service()
returns void
language plpgsql
security invoker
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function test_helpers.act_as(p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  user_email text;
begin
  perform test_helpers.act_as_service();
  select email into user_email from auth.users where id = p_user_id;
  if user_email is null then
    raise exception 'test_helpers.act_as: no auth user with id %', p_user_id;
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated', 'email', user_email)::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function test_helpers.act_as_role(p_email text, p_expected_role text)
returns void
language plpgsql
security invoker
as $$
declare
  found_user_id uuid;
  found_role text;
begin
  perform test_helpers.act_as_service();
  select u.id, p.role into found_user_id, found_role
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email = lower(p_email);
  if found_user_id is null then
    raise exception 'test_helpers: no auth user with email %', p_email;
  end if;
  if found_role is distinct from p_expected_role then
    raise exception 'test_helpers: % has role %, expected %', p_email, found_role, p_expected_role;
  end if;
  perform test_helpers.act_as(found_user_id);
end;
$$;

create or replace function test_helpers.act_as_customer(p_email text)
returns void language sql security invoker
as $$ select test_helpers.act_as_role(p_email, 'customer') $$;

create or replace function test_helpers.act_as_owner(p_email text)
returns void language sql security invoker
as $$ select test_helpers.act_as_role(p_email, 'owner') $$;

create or replace function test_helpers.act_as_worker(p_email text)
returns void language sql security invoker
as $$ select test_helpers.act_as_role(p_email, 'worker') $$;

create or replace function test_helpers.act_as_admin(p_email text)
returns void language sql security invoker
as $$ select test_helpers.act_as_role(p_email, 'super_admin') $$;

create or replace function test_helpers.act_as_anon()
returns void
language plpgsql
security invoker
as $$
begin
  perform test_helpers.act_as_service();
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Runs p_sql in a subtransaction; returns 'succeeded' or the SQLSTATE it raised.
-- (Never returns a bare 'ok': TAP would parse that output line as a test.)
-- Lets W2-placeholder assertions check the OUTCOME regardless of whether
-- the fix rejects with an error or silently filters the write.
create or replace function test_helpers.attempt(p_sql text)
returns text
language plpgsql
security invoker
as $$
begin
  execute p_sql;
  return 'succeeded';
exception when others then
  return sqlstate;
end;
$$;

-- -------------------------------------------------------------
-- Fixtures (must run as the session superuser; they bypass RLS)
-- -------------------------------------------------------------
create or replace function test_helpers.assert_service_session()
returns void
language plpgsql
security invoker
as $$
begin
  if current_user::text in ('authenticated', 'anon') then
    raise exception 'test_helpers fixtures must run as the session user; call test_helpers.act_as_service() first';
  end if;
end;
$$;

create or replace function test_helpers.create_shop(
  p_owner uuid,
  p_status text default 'approved',
  p_active boolean default true
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_shop_id uuid;
begin
  perform test_helpers.assert_service_session();
  insert into public.shops (owner_id, name, address, is_active, verification_status)
  values (p_owner, 'Local Test Shop ' || left(gen_random_uuid()::text, 8),
          'Local test address', p_active, p_status)
  returning id into new_shop_id;
  return new_shop_id;
end;
$$;

create or replace function test_helpers.set_shop_price(
  p_shop uuid,
  p_vehicle text,
  p_service text,
  p_price numeric
)
returns void
language plpgsql
security invoker
as $$
begin
  perform test_helpers.assert_service_session();
  insert into public.shop_pricing (shop_id, vehicle_type, service_type, price)
  values (p_shop, p_vehicle, p_service, p_price)
  on conflict (shop_id, vehicle_type, service_type) do update set price = excluded.price;
end;
$$;

create or replace function test_helpers.create_roster_worker(
  p_owner uuid,
  p_user uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_worker_id uuid;
begin
  perform test_helpers.assert_service_session();
  insert into public.workers (owner_id, user_id, name)
  values (p_owner, p_user, 'Local Test Roster Worker')
  returning id into new_worker_id;
  return new_worker_id;
end;
$$;

-- Uses Sedan / Basic Wash; adds a 250.00 price if the shop has none.
-- The quote trigger still applies, so the shop must be approved and active.
create or replace function test_helpers.create_booking_fixture(
  p_customer uuid,
  p_shop uuid,
  p_status text default 'pending'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_booking_id uuid;
begin
  perform test_helpers.assert_service_session();
  if not exists (
    select 1 from public.shop_pricing
    where shop_id = p_shop and vehicle_type = 'Sedan' and service_type = 'Basic Wash'
  ) then
    perform test_helpers.set_shop_price(p_shop, 'Sedan', 'Basic Wash', 250.00);
  end if;
  insert into public.bookings (
    customer_name, customer_id, vehicle_type, service_type, address, time, shop_id
  )
  values (
    'Local Test Customer', p_customer, 'Sedan', 'Basic Wash', 'Local test address',
    now() + interval '1 day', p_shop
  )
  returning id into new_booking_id;
  if p_status <> 'pending' then
    update public.bookings set booking_status = p_status where id = new_booking_id;
  end if;
  return new_booking_id;
end;
$$;

-- W4: a shop approved BY A RECORDED REVIEW (reviewed_by + reviewed_at), i.e. it passes
-- public.shop_has_recorded_verification(). Inserted as a trusted session (fixture only).
create or replace function test_helpers.create_verified_shop(p_owner uuid, p_reviewer uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_shop_id uuid;
begin
  perform test_helpers.assert_service_session();
  insert into public.shops (owner_id, name, address, is_active, verification_status,
                            verification_reviewed_by, verification_reviewed_at)
  values (p_owner, 'Local Test Verified Shop ' || left(gen_random_uuid()::text, 8),
          'Local test address', true, 'approved', p_reviewer, now())
  returning id into new_shop_id;
  return new_shop_id;
end;
$$;

-- W4: a complete draft job opening (every required-for-publish field set; no pay or terms).
create or replace function test_helpers.create_job_opening(p_shop uuid, p_title text)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_opening_id uuid;
begin
  perform test_helpers.assert_service_session();
  insert into public.job_openings (shop_id, owner_id, title, description, work_location,
                                   openings_count, job_type, applicant_requirement)
  select s.id, s.owner_id, p_title, 'Local test job opening description', 'Local test location',
         1, 'part_time', 'trainees_welcome'
  from public.shops s
  where s.id = p_shop
  returning id into strict new_opening_id;   -- no shop -> error
  return new_opening_id;
end;
$$;

grant usage on schema test_helpers to anon, authenticated;
grant execute on all functions in schema test_helpers to anon, authenticated;

-- Shop-owner booking policies are NOT created here: they are the staged
-- migration 20260417000002 (local_test_baseline_owner_policies.sql), so
-- W2 migrations can drop or replace them. This seed holds helpers only.

-- -------------------------------------------------------------
-- ROLLBACK (local test stack only)
-- -------------------------------------------------------------
-- drop schema if exists test_helpers cascade;
