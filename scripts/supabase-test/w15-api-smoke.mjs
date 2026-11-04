#!/usr/bin/env node
// W15 local-only API smoke test: the required-training booking gate survives ending the roster link (owner unlink and
// worker self-unlink, D-79), lifts on withdraw, leaves non-trainee rows alone, and the private roster_link_history table
// and both W15 functions stay out of reach of every client role (anon, owner, worker, service_role).
//
//   node scripts/supabase-test/w15-api-smoke.mjs      (after run-db-tests.mjs left the stack running; run-api-smokes.mjs runs it before w13)
//
// Same safety rules as w2..w14: ONLY the local stack of the staged `.local-supabase-test` workdir; keys come from `supabase status` in
// memory, never printed or written; refuses any non-loopback URL; reads no .env; synthetic smoke15-*@local.test users deleted at the end
// (asserted). TEST-ONLY via `docker exec supabase_db_<project_id> psql` (uuid values only, the w6 smoke path): the training program,
// its sessions, the accepted enrollments and the booking are created with the seeded test_helpers, and the history row count is read.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const { createClient } = createRequire(path.join(repoRoot, 'frontend', 'package.json'))('@supabase/supabase-js')
const projectId = assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')
const dbContainer = `supabase_db_${projectId}`
const FORBIDDEN_ARGUMENTS = ['--db-url', '--linked', '--project-ref']
const FORBIDDEN_ENVIRONMENT = ['SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID', 'SUPABASE_DB_PASSWORD']

function abortIfRemoteRequested() {
  const argument = process.argv.slice(2).find((value) => FORBIDDEN_ARGUMENTS.some((flag) => value.startsWith(flag)))
  const variable = FORBIDDEN_ENVIRONMENT.find((name) => process.env[name])
  if (argument || variable) {
    console.error(`w15-api-smoke: refusing ${argument ? `remote target argument ${argument}` : `to run while ${variable} is set`}`)
    process.exit(2)
  }
}

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('w15-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w15-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w15-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function trustedFixture(sql, ...values) {
  if (!values.every((value) => UUID.test(value))) throw new Error('trusted fixture: unsafe value')
  const text = values.reduce((acc, value, index) => acc.replaceAll(`$${index + 1}`, `'${value}'`), sql)
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', text], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted fixture failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim().split(/\r?\n/).pop()
}

abortIfRemoteRequested()
const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const admin = newClient(serviceKey)
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
let programId = null
let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`ok     ${name}`)
  } else {
    failed += 1
    console.log(`NOT OK ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

async function signUp(label, role) {
  const email = `smoke15-${label}-${runId}@local.test`
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { role, full_name: 'Smoke Test' } }),
  })
  const body = await response.json()
  const id = body.user?.id ?? body.id
  if (!id) throw new Error(`signup failed for ${label}: status ${response.status}`)
  createdUserIds.push(id)
  const client = newClient(anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${label}: ${error.message}`)
  if (role === 'worker') {
    const profile = await client.from('worker_profiles').insert({ profile_id: id, headline: 'Smoke washer', availability_status: 'flexible' })
    if (profile.error) throw new Error(`worker profile failed for ${label}: ${profile.error.message}`)
  }
  return { id, client }
}

async function deleteUserChecked(label, id) {
  const { error } = await admin.auth.admin.deleteUser(id)
  check(`delete_user_${label}`, !error, error?.message)
  if (!error && createdUserIds.includes(id)) createdUserIds.splice(createdUserIds.indexOf(id), 1)
  return !error
}

async function linkToRoster(owner, worker, name) {
  const row = await owner.client.from('workers').insert({ owner_id: owner.id, name }).select('id').single()
  const code = (await owner.client.rpc('create_roster_link_code', { p_worker_row_id: row.data?.id })).data?.[0]?.link_code
  const accepted = await worker.client.rpc('accept_roster_link_code', { p_code: code })
  if (accepted.data?.[0]?.result !== 'linked') throw new Error(`roster link failed for ${name}`)
  return row.data.id
}

const gated = (error) => error?.code === '23514' && /required training/.test(error?.message ?? '')
const denied = (error) => error?.code === '42501'

async function main() {
  const owner = await signUp('owner', 'owner')
  const customer = await signUp('customer', 'customer')
  const reviewer = await signUp('reviewer', 'customer')
  const trainee = await signUp('trainee', 'worker')
  const leaver = await signUp('leaver', 'worker')
  const washer = await signUp('washer', 'worker')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: 'Smoke W15 Wash', address: '15 Test Street' }).select('id').single()
  const shopId = shop.data?.id
  const approve = await reviewer.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId).select('id').single()
  if (promote.error || shop.error || approve.error) throw new Error('verified shop fixture failed')

  programId = trustedFixture('select test_helpers.create_training_program($1)', shopId)
  trustedFixture('select count(test_helpers.add_training_session($1, test_helpers.manila_today() + n)) from generate_series(1, 3) n', programId)
  trustedFixture('select test_helpers.open_training_program($1)', programId)
  const traineeRow = await linkToRoster(owner, trainee, 'Smoke trainee')
  const leaverRow = await linkToRoster(owner, leaver, 'Smoke leaver')
  const washerRow = await linkToRoster(owner, washer, 'Smoke washer')
  trustedFixture('select test_helpers.create_accepted_enrollment($1, $2)', programId, trainee.id)
  const leaverEnrollment = trustedFixture('select test_helpers.create_accepted_enrollment($1, $2)', programId, leaver.id)
  const bookingId = trustedFixture('select test_helpers.create_booking_fixture($1, $2)', customer.id, shopId)
  const assign = (rowId) => owner.client.from('bookings').update({ assigned_worker_id: rowId }).eq('id', bookingId).select('assigned_worker_id')

  // P1: the verifier probe through the API.
  const linkedAssign = await assign(traineeRow)
  const unlink = await owner.client.from('workers').update({ user_id: null }).eq('id', traineeRow).select('user_id').single()
  check('w15_owner_unlink_of_trainee_row_succeeds', gated(linkedAssign.error) && !unlink.error && unlink.data?.user_id === null,
    unlink.error?.message ?? linkedAssign.error?.message ?? 'linked assign not refused')
  const afterUnlink = await assign(traineeRow)
  check('w15_owner_assign_after_unlink_refused_23514', gated(afterUnlink.error), afterUnlink.error?.message ?? 'no error')
  const booking = await owner.client.from('bookings').select('assigned_worker_id').eq('id', bookingId).single()
  check('w15_booking_still_unassigned', !booking.error && booking.data?.assigned_worker_id === null, booking.error?.message ?? JSON.stringify(booking.data))

  // P2: the worker leaves the row; the owner still cannot assign it.
  const selfUnlink = await leaver.client.rpc('unlink_my_roster_entry', { p_worker_row_id: leaverRow })
  check('w15_worker_self_unlink_succeeds', !selfUnlink.error, selfUnlink.error?.message)
  const afterSelfUnlink = await assign(leaverRow)
  check('w15_assign_after_worker_unlink_refused_23514', gated(afterSelfUnlink.error), afterSelfUnlink.error?.message ?? 'no error')

  // The gate lifts when the training ends; other rows are unaffected.
  const withdraw = await leaver.client.rpc('withdraw_from_training', { p_enrollment_id: leaverEnrollment }).single()
  const afterWithdraw = await assign(leaverRow)
  check('w15_withdraw_then_assign_succeeds', withdraw.data?.status === 'withdrawn' && !afterWithdraw.error
    && afterWithdraw.data?.[0]?.assigned_worker_id === leaverRow, withdraw.error?.message ?? afterWithdraw.error?.message)
  const washerAssign = await assign(washerRow)
  check('w15_non_trainee_row_assign_succeeds', !washerAssign.error && washerAssign.data?.[0]?.assigned_worker_id === washerRow, washerAssign.error?.message)

  // The history table and both functions are out of reach of every client role.
  const outcomes = []
  for (const [label, client] of [['anon', newClient(anonKey)], ['owner', owner.client], ['worker', trainee.client], ['service_role', admin]]) {
    const read = await client.from('roster_link_history').select('*')
    const insert = await client.from('roster_link_history').insert({ worker_row_id: washerRow, user_id: trainee.id, source: 'link' })
    const update = await client.from('roster_link_history').update({ source: 'link' }).eq('worker_row_id', traineeRow)
    const remove = await client.from('roster_link_history').delete().eq('worker_row_id', traineeRow)
    outcomes.push([label, [read, insert, update, remove].map((r) => (denied(r.error) ? 'denied' : `${r.error?.code ?? 'allowed'}`))])
  }
  check('w15_link_history_not_readable_or_writable_by_clients', outcomes.every(([, codes]) => codes.every((c) => c === 'denied')), JSON.stringify(outcomes))
  const calls = []
  for (const client of [newClient(anonKey), owner.client, trainee.client, admin]) {
    calls.push(await client.rpc('roster_worker_in_required_training', { p_worker_row_id: traineeRow, p_shop_id: shopId }))
    calls.push(await client.rpc('record_roster_link_history'))
    calls.push(await client.rpc('backfill_roster_link_history'))
  }
  check('w15_gate_functions_not_callable', calls.every((c) => c.error && c.data === null), JSON.stringify(calls.map((c) => c.error?.code ?? 'called')))

  // Deleting the account removes its history rows (cascade through profiles).
  const before = trustedFixture('select count(*) from public.roster_link_history where user_id = $1', trainee.id)
  if (await deleteUserChecked('trainee_with_history_through_gotrue', trainee.id)) {
    const after = trustedFixture('select count(*) from public.roster_link_history where user_id = $1', trainee.id)
    check('w15_delete_user_removes_link_history', before === '1' && after === '0', `${before} -> ${after}`)
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  if (programId && UUID.test(programId)) {
    trustedFixture('delete from public.training_programs p where p.id = $1 and not exists (select 1 from public.training_enrollments e where e.program_id = p.id)', programId)
    const left = trustedFixture('select count(*) from public.training_programs where id = $1', programId)
    check('cleanup_training_program_removed', left === '0', left)
  }
}
console.log(`w15-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
