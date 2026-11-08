#!/usr/bin/env node
// W16 local-only API smoke test: the required-training booking gate holds after the owner deletes the training shop and
// after a recorded fail, lifts when the worker leaves or the owner cancels (D-83, D-84), and a super_admin publish cannot
// change core safeguard text while an unchanged publish still works (D-87).
//
//   node scripts/supabase-test/w16-api-smoke.mjs      (after run-db-tests.mjs left the stack running; run-api-smokes.mjs runs it before w13)
//
// Same safety rules as w2..w15: ONLY the local stack of the staged `.local-supabase-test` workdir; keys come from `supabase status` in
// memory, never printed or written; refuses any non-loopback URL; reads no .env; synthetic smoke16-*@local.test users deleted at the end
// (asserted). TEST-ONLY via `docker exec supabase_db_<project_id> psql` (uuid values only, the w6 smoke path): the training programs,
// their sessions, the accepted enrollments and the booking are created with the seeded test_helpers.
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
    console.error(`w16-api-smoke: refusing ${argument ? `remote target argument ${argument}` : `to run while ${variable} is set`}`)
    process.exit(2)
  }
}

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('w16-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w16-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w16-api-smoke: refusing non-loopback API URL')
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
const programIds = []
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
  const email = `smoke16-${label}-${runId}@local.test`
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

function openProgram(shopId, dayExpression) {
  const programId = trustedFixture('select test_helpers.create_training_program($1)', shopId)
  programIds.push(programId)
  trustedFixture(`select count(test_helpers.add_training_session($1, test_helpers.manila_today() ${dayExpression} n)) from generate_series(1, 3) n`, programId)
  trustedFixture('select test_helpers.open_training_program($1)', programId)
  return programId
}

const gated = (error) => error?.code === '23514' && /required training/.test(error?.message ?? '')

async function main() {
  const owner = await signUp('owner', 'owner')
  const customer = await signUp('customer', 'customer')
  const reviewer = await signUp('reviewer', 'customer')
  const trainee = await signUp('trainee', 'worker')
  const failer = await signUp('failer', 'worker')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  const shops = await owner.client.from('shops').insert([{ owner_id: owner.id, name: 'Smoke W16 Training Wash', address: '16 Test Street' },
    { owner_id: owner.id, name: 'Smoke W16 Main Wash', address: '16 Main Street' }]).select('id, name')
  const trainingShopId = shops.data?.find((shop) => shop.name.includes('Training'))?.id
  const mainShopId = shops.data?.find((shop) => shop.name.includes('Main'))?.id
  const approve = await reviewer.client.from('shops').update({ verification_status: 'approved' }).in('id', [trainingShopId, mainShopId]).select('id')
  if (promote.error || shops.error || approve.error || approve.data?.length !== 2) throw new Error('verified shop fixture failed')

  const trainingProgram = openProgram(trainingShopId, '+')
  const failProgram = openProgram(mainShopId, '-')
  const traineeRow = await linkToRoster(owner, trainee, 'Smoke trainee')
  const failerRow = await linkToRoster(owner, failer, 'Smoke failer')
  const traineeEnrollment = trustedFixture('select test_helpers.create_accepted_enrollment($1, $2)', trainingProgram, trainee.id)
  const failerEnrollment = trustedFixture('select test_helpers.create_accepted_enrollment($1, $2)', failProgram, failer.id)
  const bookingId = trustedFixture('select test_helpers.create_booking_fixture($1, $2)', customer.id, mainShopId)
  const assign = (rowId) => owner.client.from('bookings').update({ assigned_worker_id: rowId }).eq('id', bookingId).select('assigned_worker_id')

  // SEC-5, shop path: the verifier probe through the API.
  const before = await assign(traineeRow)
  const removal = await owner.client.from('shops').delete().eq('id', trainingShopId).select('id')
  check('w16_owner_shop_delete_succeeds', gated(before.error) && !removal.error && removal.data?.length === 1, removal.error?.message ?? before.error?.message ?? 'first assign not refused')
  const afterDelete = await assign(traineeRow)
  check('w16_assign_after_shop_delete_refused_23514', gated(afterDelete.error), afterDelete.error?.message ?? 'no error')
  const withdraw = await trainee.client.rpc('withdraw_from_training', { p_enrollment_id: traineeEnrollment }).single()
  check('w16_worker_withdraw_after_shop_delete_succeeds', withdraw.data?.status === 'withdrawn', withdraw.error?.message)
  const afterWithdraw = await assign(traineeRow)
  check('w16_assign_after_withdraw_succeeds', !afterWithdraw.error && afterWithdraw.data?.[0]?.assigned_worker_id === traineeRow, afterWithdraw.error?.message)

  // SEC-5, fail path: three attended past days, then a recorded fail through the owner's RPCs.
  const sessions = await owner.client.from('training_sessions').select('id').eq('program_id', failProgram)
  for (const session of sessions.data ?? []) {
    const attended = await owner.client.rpc('record_training_attendance', { p_enrollment_id: failerEnrollment, p_session_id: session.id, p_attendance_status: 'present' })
    if (attended.error) throw new Error(`attendance failed: ${attended.error.message}`)
  }
  const program = await owner.client.from('training_programs').select('assessment_checklist').eq('id', failProgram).single()
  const assessment = await owner.client.rpc('record_training_assessment', { p_enrollment_id: failerEnrollment,
    p_items_met: (program.data?.assessment_checklist ?? []).map(() => false), p_result: 'failed', p_failure_reason: 'Did not meet the checklist yet' })
  if (assessment.error) throw new Error(`assessment failed: ${assessment.error.message}`)
  const afterFail = await assign(failerRow)
  check('w16_assign_after_failed_refused_23514', gated(afterFail.error), afterFail.error?.message ?? 'no error')
  const cancel = await owner.client.rpc('cancel_training_enrollment', { p_enrollment_id: failerEnrollment, p_reason: 'Ending this after the recorded result' }).single()
  check('w16_owner_cancel_failed_succeeds', cancel.data?.status === 'cancelled', cancel.error?.message)
  const afterCancel = await assign(failerRow)
  check('w16_assign_after_cancel_succeeds', !afterCancel.error && afterCancel.data?.[0]?.assigned_worker_id === failerRow, afterCancel.error?.message)

  // D-87: the deferred pin answers at commit, through PostgREST.
  const platform = (await reviewer.client.rpc('platform_contract_template_current')).data?.[0]
  const clauses = (await reviewer.client.rpc('contract_template_version_clauses', { p_version_id: platform?.version_id })).data ?? []
  const input = (changedKey) => clauses.map((clause) => ({ section_number: clause.section_number, clause_key: clause.clause_key, kind: clause.kind, heading: clause.heading,
    requires_owner_input: clause.requires_owner_input, body: clause.clause_key === changedKey ? `${clause.body} Changed by an administrator.` : clause.body }))
  const publish = (changedKey) => reviewer.client.rpc('publish_platform_contract_template_version',
    { p_expected_version_number: platform?.version_number, p_clauses: input(changedKey) }).single()
  const changed = await publish('customer_data_minimum')
  const after = (await reviewer.client.rpc('platform_contract_template_current')).data?.[0]
  check('w16_core_text_publish_refused_23514', changed.error?.code === '23514' && /human-run migration: customer_data_minimum\./.test(changed.error?.message ?? '') && after?.version_number === platform?.version_number, changed.error?.message ?? 'no error')
  const unchanged = await publish(null)
  check('w16_unchanged_core_publish_succeeds', !unchanged.error && unchanged.data?.version_number === platform?.version_number + 1, unchanged.error?.message)

  const calls = []
  for (const client of [newClient(anonKey), owner.client, reviewer.client, admin]) calls.push(await client.rpc('contract_template_core_text_pin'))
  check('w16_pin_function_not_callable', calls.every((call) => call.error && call.data === null), JSON.stringify(calls.map((call) => call.error?.code ?? 'called')))
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  for (const programId of programIds) {
    trustedFixture('delete from public.training_programs p where p.id = $1 and not exists (select 1 from public.training_enrollments e where e.program_id = p.id)', programId)
    const left = trustedFixture('select count(*) from public.training_programs where id = $1', programId)
    check('cleanup_training_program_removed', left === '0', left)
  }
}
console.log(`w16-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
