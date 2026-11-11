#!/usr/bin/env node
// LOCAL STACK ONLY. Prepares the running local Supabase stack (scripts/supabase-test) for the docs screenshots:
// test accounts, the live catalog shape (Basic / Full / Premium), an operator washer, a customer's saved details and
// sample bookings in every status. Reads the local JWT secret from the running auth container, so it works without
// the Supabase CLI. Refuses anything that is not the local loopback stack. Never point it at a real project.
//
//   node scripts/site-docs/local-setup.mjs        (prints the local URL and anon key for capture.mjs)

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'

export const API_URL = 'http://127.0.0.1:54321'
export const LOCAL_PASSWORD = 'Local-Docs-Pw1!'
export const ACCOUNTS = {
  customer: { email: 'docs-customer@local.test', name: 'Bea Customer', role: 'customer' },
  washer: { email: 'docs-washer@local.test', name: 'Wes Washer', role: 'customer' },
  admin: { email: 'docs-admin@local.test', name: 'Ana Admin', role: 'customer' },
}
const AUTH_CONTAINER = 'supabase_auth_washlink-local-test'
const DB_CONTAINER = 'supabase_db_washlink-local-test'

function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(`docker ${args.slice(0, 3).join(' ')} failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function sign(secret, role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const head = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode({ iss: 'supabase-demo', role, exp: Math.floor(Date.now() / 1000) + 24 * 3600 })
  return `${head}.${body}.${crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

export function localKeys() {
  // The project id check from scripts/supabase-test: only the "-local-test" stack has these container names.
  const secret = docker(['exec', AUTH_CONTAINER, 'printenv', 'GOTRUE_JWT_SECRET']).trim()
  if (secret === '') throw new Error('local auth container has no JWT secret')
  return { anonKey: sign(secret, 'anon'), serviceKey: sign(secret, 'service_role') }
}

export function sql(statements) {
  return docker(['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA'], statements)
}

async function ensureUser(serviceKey, account) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
  const response = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: account.email, password: LOCAL_PASSWORD, email_confirm: true, user_metadata: { role: account.role, full_name: account.name } }),
  })
  if (!response.ok && response.status !== 422) {
    throw new Error(`creating ${account.email}: ${response.status} ${await response.text()}`)
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())
if (isMain) {
  if (new URL(API_URL).hostname !== '127.0.0.1') throw new Error('local stack only')
  const { anonKey, serviceKey } = localKeys()
  for (const account of Object.values(ACCOUNTS)) {
    await ensureUser(serviceKey, account)
  }
  const id = (key) => `(select id from auth.users where email = '${ACCOUNTS[key].email}')`
  const asUser = (key) => `select set_config('request.jwt.claims', json_build_object('sub', ${id(key)}, 'role', 'authenticated')::text, true); set local role authenticated;`
  const manila = (days, hour) => `(((now() at time zone 'Asia/Manila')::date + ${days} + interval '${hour} hours') at time zone 'Asia/Manila')`
  const book = (key, days, hour, service) => `
begin;
${asUser('customer')}
insert into pg_temp_docs_ids select '${key}', b.booking_id from public.create_service_booking(
  (select id from public.services where key = '${service}'), 'sedan', 'Toyota', 'Vios', 2021, '{}',
  'Unit 12B, 88 Ayala Avenue, Makati City', 14.5547, 121.0244, 'Blue gate beside the lobby', 'Call when outside', false,
  ${manila(days, hour)}, 'docs-${key}') b;
commit;`

  sql(`
-- Clean slate for the docs data (local only).
delete from public.service_bookings;
update public.profiles set role = 'super_admin' where id = ${id('admin')};
-- The live catalog: three washes, extras hidden, wax only in Premium.
update public.services set is_active = false;
update public.services set name = 'Basic Wash', description = 'Exterior only: rinse, foam wash, hand dry and windows.', category = 'exterior',
  base_price_cents = 25000, duration_minutes = 40, is_active = true, price_is_draft = false, sort_order = 10 where key = 'basic_exterior';
update public.services set name = 'Full Wash', description = 'Everything in the Basic Wash, plus interior vacuum and dashboard and door panel wipe-down.', category = 'full',
  base_price_cents = 45000, duration_minutes = 75, is_active = true, price_is_draft = false, sort_order = 20 where key = 'interior_exterior';
update public.services set name = 'Premium Wash', description = 'Everything in the Full Wash, finished with wax and a hand-wax polish.', category = 'full',
  base_price_cents = 65000, duration_minutes = 105, is_active = true, price_is_draft = false, sort_order = 30 where key = 'full_wash';
update public.service_addons set is_active = (key <> 'wax'), price_is_draft = false;
update public.platform_settings set bookings_open = true, washer_signup_open = false, commission_bps = 0,
  max_new_bookings_per_hour = 100, max_open_bookings_per_customer = 50;
-- The operator washer, with a service area in Makati, every wash, and hours every day.
select public.make_platform_operator('${ACCOUNTS.washer.email}');
update public.independent_workers set base_latitude = 14.5547, base_longitude = 121.0244, service_radius_km = 20,
  bio = 'WashLink''s own washer.', is_online = true, last_seen_at = now() where profile_id = ${id('washer')};
delete from public.independent_worker_services where worker_id = ${id('washer')};
insert into public.independent_worker_services select ${id('washer')}, id from public.services where is_active;
delete from public.independent_worker_hours where worker_id = ${id('washer')};
-- The real schedule: Friday 8 PM to midnight, Saturday and Sunday 10 AM to 10 PM (weekday 0 = Sunday).
insert into public.independent_worker_hours values (${id('washer')}, 5, 1200, 1440), (${id('washer')}, 6, 600, 1320), (${id('washer')}, 0, 600, 1320);
-- The customer's saved place and car.
delete from public.customer_addresses where customer_id = ${id('customer')};
insert into public.customer_addresses (customer_id, label, address, latitude, longitude, landmark, instructions)
  values (${id('customer')}, 'Office', 'Unit 12B, 88 Ayala Avenue, Makati City', 14.5547, 121.0244, 'Blue gate beside the lobby', 'Call when outside');
delete from public.customer_vehicles where customer_id = ${id('customer')};
insert into public.customer_vehicles (customer_id, category, make, model, year) values (${id('customer')}, 'sedan', 'Toyota', 'Vios', 2021);
`)

  // Bookings: one per status the screens show. Created through the real booking function, then moved along the machine.
  const keys = [['completed', 1, 9, 'interior_exterior'], ['cancelled', 2, 9, 'basic_exterior'], ['in_progress', 3, 9, 'full_wash'],
    ['on_the_way', 4, 9, 'interior_exterior'], ['accepted', 5, 9, 'basic_exterior'], ['offered', 6, 9, 'interior_exterior'],
    ['no_washer', 7, 9, 'basic_exterior']]
  sql(`create table if not exists public.docs_ids (k text primary key, id uuid);
truncate public.docs_ids;`)
  for (const [key, days, hour, service] of keys) {
    sql(book(key, days, hour, service).replaceAll('pg_temp_docs_ids', 'public.docs_ids'))
  }
  const booking = (key) => `(select id from public.docs_ids where k = '${key}')`
  const accept = (key) => `
begin;
${asUser('washer')}
select public.accept_dispatch_request((select d.id from public.dispatch_requests d where d.booking_id = ${booking(key)} and d.status = 'offered'));
commit;`
  for (const key of ['completed', 'cancelled', 'in_progress', 'on_the_way', 'accepted']) {
    sql(accept(key))
  }
  sql(`
select public.service_booking_record_transition(${booking('on_the_way')}, 'worker_on_the_way', 'worker');
select public.service_booking_record_transition(${booking('in_progress')}, 'worker_on_the_way', 'worker');
select public.service_booking_record_transition(${booking('in_progress')}, 'arrived', 'worker');
select public.service_booking_record_transition(${booking('in_progress')}, 'in_progress', 'worker');
select public.service_booking_record_transition(${booking('completed')}, 'worker_on_the_way', 'worker');
select public.service_booking_record_transition(${booking('completed')}, 'arrived', 'worker');
select public.service_booking_record_transition(${booking('completed')}, 'in_progress', 'worker');
select public.service_booking_record_transition(${booking('completed')}, 'completed', 'worker');
update public.service_bookings set scheduled_at = now() - interval '2 days' where id = ${booking('completed')};
select public.service_booking_record_transition(${booking('cancelled')}, 'cancelled', 'customer', 'Plans changed');
select public.service_dispatch_close_offers(${booking('no_washer')}, 'superseded');
select public.service_booking_record_transition(${booking('no_washer')}, 'no_worker_available', 'system');
`)
  sql(`
begin;
${asUser('customer')}
select public.review_service_booking(${booking('completed')}, 5, 'Spotless, and right on time.');
commit;
drop table public.docs_ids;
select status, count(*) from public.service_bookings group by 1 order by 1;`)
  console.log(sql(`select string_agg(status || '=' || n, ', ') from (select status, count(*) n from public.service_bookings group by 1 order by 1) s;`).trim())
  console.log(JSON.stringify({ apiUrl: API_URL, anonKey }))
}
