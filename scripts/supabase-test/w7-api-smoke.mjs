#!/usr/bin/env node
// W7 local-only API smoke test: shop-issued certifications through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w7-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w6-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
// `.local-supabase-test` workdir. API URL and keys come from `npx supabase status -o env --workdir
// .local-supabase-test` and are held in memory: never printed, never written. Refuses any non-loopback API
// URL. Reads no .env. Users are synthetic (@local.test, random suffix) and deleted at the end (asserted).
// Time-shift fixture (TEST ONLY, W6 R3 / W7 R7): past training sessions and an earlier acceptance are created
// through `docker exec supabase_db_<staged project_id> psql` (a trusted local session calling the seeded
// test_helpers); only validated uuids and synthetic @local.test emails are interpolated. Attendance,
// assessments, certificates, status changes, reviews, re-assessments and renewals use the real RPCs.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { adminAuditRows } from './smoke-admin-audit-log.mjs'
import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const require = createRequire(path.join(repoRoot, 'frontend', 'package.json'))
const { createClient } = require('@supabase/supabase-js')

const projectId = assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')
const dbContainer = `supabase_db_${projectId}`

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('w7-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w7-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w7-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const SAFE_VALUE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}|smoke7-[a-z-]+-[a-z0-9]+@local\.test)$/
function trustedFixture(sql, ...values) {
  if (!values.every((value) => SAFE_VALUE.test(value))) throw new Error('trusted fixture: unsafe value')
  const text = values.reduce((acc, value, index) => acc.replaceAll(`$${index + 1}`, `'${value}'`), sql)
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', text], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted fixture failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim().split(/\r?\n/).pop()
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const admin = newClient(serviceKey)
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const retainedPrograms = []   // D-18 keeps programs with enrollments after the owner is deleted; removed in finally
const manilaDate = (offsetDays) => new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10)
const TABLES = ['shop_certification_policies', 'certifications', 'certification_status_events', 'certification_review_requests',
  'certification_reassessments']
const REASON = 'Smoke reason PANGOLIN for this status change'

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
  const email = `smoke7-${label}-${runId}@local.test`
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
  return { id, client, email }
}

async function deleteUserChecked(label, id) {
  const { error } = await admin.auth.admin.deleteUser(id)
  check(`delete_user_${label}`, !error, error?.message)
  if (!error && createdUserIds.includes(id)) createdUserIds.splice(createdUserIds.indexOf(id), 1)
  return !error
}

async function createWorker(label) {
  const worker = await signUp(label, 'worker')
  const profile = await worker.client.from('worker_profiles')
    .insert({ profile_id: worker.id, headline: 'Smoke washer', availability_status: 'flexible' }).select('profile_id').single()
  if (profile.error) throw new Error(`worker profile failed for ${label}: ${profile.error.message}`)
  return worker
}

const denied = (error) => error?.code === '42501'
const one = async (query) => (await query).data
const programOf = (enrollmentId) => trustedFixture('select program_id from public.training_enrollments where id = $1', enrollmentId)

async function createVerifiedShop(owner, reviewer, name) {
  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name, address: '7 Test Street' }).select('id').single()
  if (reviewer) await reviewer.client.from('shops').update({ verification_status: 'approved' }).eq('id', shop.data?.id)
  return shop.data?.id
}

async function publishOpening(owner, shopId, title, requirement) {
  const opening = await owner.client.from('job_openings').insert({ shop_id: shopId, title, description: 'Wash cars', work_location: 'Smoke W7',
    openings_count: 2, job_type: 'part_time', applicant_requirement: requirement }).select('id').single()
  await owner.client.rpc('transition_job_opening', { p_job_opening_id: opening.data?.id, p_from_status: 'draft', p_to_status: 'published' })
  return opening.data?.id
}

async function main() {
  const owner = await signUp('owner', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const reviewer = await signUp('reviewer', 'customer')
  const worker = await createWorker('worker')
  const second = await createWorker('second')
  const trainer = await createWorker('trainer')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  const shopId = await createVerifiedShop(owner, reviewer, 'Smoke W7 Wash')
  const unverifiedShopId = await createVerifiedShop(otherOwner, null, 'Smoke W7 Unverified')
  check('verified_and_unverified_shops_ready', !promote.error && Boolean(shopId) && Boolean(unverifiedShopId), promote.error?.message)

  const anon = newClient(anonKey)
  for (const table of TABLES) {
    const read = await anon.from(table).select('*')
    check(`anon_read_${table}_error_or_zero_rows`, Boolean(read.error) || read.data?.length === 0, `${read.data?.length} rows`)
  }
  const workerInsert = await worker.client.from('certifications').insert({ worker_id: worker.id }).select('id')
  const ownerInsert = await owner.client.from('certification_status_events').insert({ event: 'issued', to_status: 'active' }).select('id')
  const serviceInsert = await admin.from('certifications').insert({ worker_id: worker.id }).select('id')
  check('direct_inserts_denied_for_worker_owner_and_service_role', denied(workerInsert.error) && denied(ownerInsert.error) && denied(serviceInsert.error),
    [workerInsert.error?.code, ownerInsert.error?.code, serviceInsert.error?.code].join(','))

  // TEST-ONLY time shift: a program with three past supervised sessions and a backdated acceptance.
  const programId = trustedFixture('select test_helpers.create_training_program($1)', shopId)
  retainedPrograms.push(programId)
  const sessions = [-3, -2, -1].map((offset) => trustedFixture('select test_helpers.add_training_session($1, $2)', programId, manilaDate(offset)))
  trustedFixture('select test_helpers.open_training_program($1)', programId)
  const enrollmentId = trustedFixture('select test_helpers.create_accepted_enrollment($1, $2)', programId, worker.id)
  const issue = (client, enrollment, assessment, attestation = 'w7_issuer_v1') => client.rpc('issue_certification',
    { p_enrollment_id: enrollment, p_expected_assessment_id: assessment, p_issuer_attestation_version: attestation }).single()
  const early = await issue(owner.client, enrollmentId, null)
  check('issue_refused_before_training_completed', early.error?.code === '23514' && /not completed/.test(early.error?.message ?? ''), early.error?.message)
  for (const sessionId of sessions) {
    await owner.client.rpc('record_training_attendance', { p_enrollment_id: enrollmentId, p_session_id: sessionId, p_attendance_status: 'present' })
  }
  const assessment = await owner.client.rpc('record_training_assessment',
    { p_enrollment_id: enrollmentId, p_items_met: [true, true], p_result: 'passed' }).single()
  const progress = await one(owner.client.from('training_enrollment_progress').select('progress_status, current_assessment_id')
    .eq('enrollment_id', enrollmentId).single())
  check('training_completed_through_real_rpcs', progress?.progress_status === 'completed' && progress?.current_assessment_id === assessment.data?.id,
    JSON.stringify(progress))

  const otherEnrollment = trustedFixture('select test_helpers.complete_training($1, $2, $3)', unverifiedShopId, second.id, otherOwner.email)
  retainedPrograms.push(programOf(otherEnrollment))
  const unverified = await issue(otherOwner.client, otherEnrollment, trustedFixture('select public.current_training_assessment_id($1)', otherEnrollment))
  check('unverified_shop_cannot_issue', unverified.error?.message === 'Only a verified shop can issue certifications.', unverified.error?.message)
  const trainerRow = await owner.client.from('workers').insert({ owner_id: owner.id, name: 'Smoke trainer' }).select('id').single()
  const code = (await owner.client.rpc('create_roster_link_code', { p_worker_row_id: trainerRow.data?.id })).data?.[0]?.link_code
  await trainer.client.rpc('accept_roster_link_code', { p_code: code })
  const designation = await owner.client.rpc('designate_training_trainer', { p_program_id: programId, p_roster_worker_id: trainerRow.data?.id }).single()
  const byTrainer = await issue(trainer.client, enrollmentId, assessment.data?.id)
  check('designated_trainer_cannot_issue', !designation.error && denied(byTrainer.error), designation.error?.message ?? byTrainer.error?.code)
  const stale = await issue(owner.client, enrollmentId, '00000000-0000-4000-8000-000000000000')
  check('stale_assessment_returns_55000', stale.error?.code === '55000', stale.error?.code ?? 'no error')
  const noAttestation = await issue(owner.client, enrollmentId, assessment.data?.id, null)
  check('issue_refused_without_attestation', noAttestation.error?.message === 'Confirm the certification statement before issuing.', noAttestation.error?.message)
  const issued = await issue(owner.client, enrollmentId, assessment.data?.id)
  const certId = issued.data?.id
  const lifetimeDays = (Date.parse(issued.data?.expires_at) - Date.parse(issued.data?.issued_at)) / 86400e3
  check('owner_issues_shop_issued_certification', issued.data?.status === 'active' && issued.data?.issuer_kind === 'shop_issued'
    && issued.data?.approved_by === owner.id, issued.error?.message)
  check('issue_stamps_server_set_and_expiry_twelve_months', Math.abs(Date.parse(issued.data?.issued_at) - Date.now()) < 300e3
    && lifetimeDays >= 365 && lifetimeDays <= 366 && issued.data?.validity_months === 12, `${issued.data?.issued_at} ${lifetimeDays}`)
  const patch = await owner.client.from('certifications').update({ expires_at: '2099-01-01T00:00:00Z' }).eq('id', certId).select('id')
  const remove = await owner.client.from('certifications').delete().eq('id', certId).select('id')
  check('certification_patch_and_delete_denied', denied(patch.error) && denied(remove.error), `${patch.error?.code},${remove.error?.code}`)
  const foreignRead = await otherOwner.client.from('certifications').select('id')
  check('other_owner_reads_no_certification_rows', !foreignRead.error && foreignRead.data?.length === 0, foreignRead.error?.message)

  const requiredOpening = await publishOpening(owner, shopId, 'Smoke W7 detailer', 'certification_required')
  const laterOpening = await publishOpening(owner, shopId, 'Smoke W7 senior detailer', 'certification_required')
  const apply = (client, openingId) => client.rpc('create_job_application', { p_job_opening_id: openingId, p_submit: true, p_notice_version: 'w5_v1' }).single()
  const refused = await apply(second.client, requiredOpening)
  check('certification_required_apply_refused_without_current_certificate',
    refused.error?.message === 'This opening needs a current shop-issued certification recorded on WashLink.', refused.error?.message)
  const applied = await apply(worker.client, requiredOpening)
  check('certification_required_apply_allowed_with_current_certificate', applied.data?.status === 'submitted', applied.error?.message)
  const listed = await owner.client.rpc('applicant_verified_certifications', { p_application_id: applied.data?.id })
  check('applicant_rpc_lists_current_certificate', listed.data?.length === 1 && listed.data[0].certification_id === certId, listed.error?.message)

  const move = (from, to, reason, id = certId) => owner.client.rpc('transition_certification',
    { p_certification_id: id, p_from_status: from, p_to_status: to, p_reason: reason }).single()
  const noReason = await move('active', 'suspended', null)
  check('suspend_needs_reason', noReason.error?.code === '23514', noReason.error?.message)
  const suspended = await move('active', 'suspended', REASON)
  const refusedLater = await apply(worker.client, laterOpening)
  check('suspended_certificate_no_longer_allows_apply', suspended.data?.status === 'suspended' && refusedLater.error?.code === '23514',
    suspended.error?.message ?? refusedLater.error?.message)
  const review = await worker.client.rpc('request_certification_review',
    { p_certification_id: certId, p_statement: 'Smoke statement: please check the record again.' }).single()
  const decided = await owner.client.rpc('decide_certification_review',
    { p_request_id: review.data?.id, p_decision: 'reinstate', p_reason: 'Smoke decision: the record was checked again' }).single()
  // Review polish: workers read no raw certification rows; my_certifications() is their read.
  const reinstated = ((await one(worker.client.rpc('my_certifications'))) ?? []).find((row) => row.certification_id === certId)
  check('worker_review_request_and_owner_reinstate', review.data?.status === 'open' && decided.data?.status === 'reinstated'
    && reinstated?.status === 'active', review.error?.message ?? decided.error?.message)
  const revoked = await move('active', 'revoked', REASON)
  check('owner_revokes_with_reason', revoked.data?.status === 'revoked', revoked.error?.message)

  const validity = await owner.client.rpc('set_shop_certification_validity', { p_shop_id: shopId, p_validity_months: 1 }).single()
  const secondEnrollment = trustedFixture('select test_helpers.complete_training($1, $2, $3)', shopId, second.id, owner.email)
  retainedPrograms.push(programOf(secondEnrollment))
  await owner.client.rpc('designate_training_trainer', { p_program_id: retainedPrograms.at(-1), p_roster_worker_id: trainerRow.data?.id })
  const secondAssessment = await one(owner.client.from('training_enrollment_progress').select('current_assessment_id')
    .eq('enrollment_id', secondEnrollment).single())
  const secondCert = await issue(owner.client, secondEnrollment, secondAssessment?.current_assessment_id)
  const reassessment = await trainer.client.rpc('record_certification_reassessment',
    { p_certification_id: secondCert.data?.id, p_items_met: [true, true], p_result: 'passed' }).single()
  await owner.client.rpc('set_shop_certification_validity', { p_shop_id: shopId, p_validity_months: 12 })
  const renewed = await owner.client.rpc('renew_certification', { p_certification_id: secondCert.data?.id, p_reassessment_id: reassessment.data?.id,
    p_issuer_attestation_version: 'w7_issuer_v1' }).single()
  const oldRow = ((await one(second.client.rpc('my_certifications'))) ?? []).find((row) => row.certification_id === secondCert.data?.id)
  check('trainer_reassessment_and_owner_renewal_supersede', validity.data?.validity_months === 1 && secondCert.data?.validity_months === 1
    && reassessment.data?.assessor_role === 'trainer' && renewed.data?.renews_certification_id === secondCert.data?.id
    && renewed.data?.validity_months === 12 && oldRow?.status === 'superseded',
    secondCert.error?.message ?? reassessment.error?.message ?? renewed.error?.message)

  const notes = (await one(worker.client.from('notifications').select('category, title, body').like('category', 'certification%'))) ?? []
  check('worker_notified_on_issue_suspend_decision_revoke', ['certification.issued', 'certification.suspended', 'certification.review_decided',
    'certification.revoked'].every((c) => notes.some((n) => n.category === c)), JSON.stringify(notes.map((n) => n.category)))
  check('certification_notifications_have_no_reason_statement_or_name', notes.length > 0
    && notes.every((n) => !/PANGOLIN|Smoke statement|Smoke decision|Smoke Test|\d{4}-\d{2}-\d{2}/.test(`${n.title} ${n.body}`)), JSON.stringify(notes))
  const setConfig = await worker.client.rpc('set_config', { setting_name: 'washlink.certification_write', new_value: certId, is_local: false })
  check('rpc_set_config_not_exposed', Boolean(setConfig.error) && setConfig.data === null, setConfig.error?.code ?? 'no error')
  const expiry = await worker.client.rpc('enqueue_certification_expiry_notices', {})
  check('expiry_notice_function_not_client_callable', Boolean(expiry.error), expiry.error?.code ?? 'no error')

  if (await deleteUserChecked('owner_with_certificates_through_gotrue', owner.id)) {
    const kept = await one(second.client.rpc('my_certifications'))
    const current = kept?.find((row) => row.certification_id === renewed.data?.id)
    check('owner_account_delete_keeps_worker_certificate_d18', current?.status === 'active' && current?.issuing_shop_present === false,
      JSON.stringify(kept))
  }
  if (await deleteUserChecked('worker_with_certificate_through_gotrue', worker.id)) {
    const events = await one(adminAuditRows(reviewer.client, { subjectId: certId, action: 'certification.deleted' }))
    check('worker_account_delete_removes_certificate_and_keeps_audit', events?.length === 1
      && events[0].payload?.deleted_by === 'worker_profile_deleted', JSON.stringify(events))
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  for (const programId of retainedPrograms.filter((id) => SAFE_VALUE.test(id ?? ''))) {
    trustedFixture('delete from public.training_programs p where p.id = $1 and not exists (select 1 from public.training_enrollments e where e.program_id = p.id)', programId)
  }
  const left = retainedPrograms.length === 0 ? '0' : trustedFixture(`select count(*) from public.training_programs where id in (${
    retainedPrograms.filter((id) => SAFE_VALUE.test(id ?? '')).map((_, index) => `$${index + 1}`).join(', ') || 'null'})`,
  ...retainedPrograms.filter((id) => SAFE_VALUE.test(id ?? '')))
  check('cleanup_retained_programs_removed', left === '0', left)
}
console.log(`w7-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
