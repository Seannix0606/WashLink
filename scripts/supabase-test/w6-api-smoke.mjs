#!/usr/bin/env node
// W6 local-only API smoke test: training programs, enrollments, evidence and the booking gate through
// PostgREST / GoTrue.
//
//   node scripts/supabase-test/w6-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w5-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
// `.local-supabase-test` workdir. API URL and keys come from `npx supabase status -o env --workdir
// .local-supabase-test` and are held in memory: never printed, never written. Refuses any non-loopback API
// URL. Reads no .env. Users are synthetic (@local.test, random suffix) and deleted at the end (asserted).
// Time-shift fixture (TEST ONLY, W6 R3): two past sessions and an earlier acceptance are created through
// `docker exec supabase_db_<staged project_id> psql` (a trusted local session calling the seeded
// test_helpers); the container name is derived from the asserted `*-local-test` project_id, and only
// validated uuids / dates are interpolated. All evidence is then recorded through the real RPCs.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
    console.error('w6-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w6-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w6-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const SAFE_VALUE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2})$/
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
const manilaDate = (offsetDays) => new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10)
const TABLES = ['training_programs', 'training_program_trainers', 'training_sessions', 'training_enrollments',
  'training_attendance_records', 'training_assessments', 'training_enrollment_progress']

let retainedProgramId = null   // D-18 keeps the program after the owner is deleted; removed in finally
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
  const email = `smoke6-${label}-${runId}@local.test`
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
  return { id, client }
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
async function linkToRoster(owner, worker, name) {
  const row = await owner.client.from('workers').insert({ owner_id: owner.id, name }).select('id').single()
  const code = (await owner.client.rpc('create_roster_link_code', { p_worker_row_id: row.data?.id })).data?.[0]?.link_code
  const accepted = await worker.client.rpc('accept_roster_link_code', { p_code: code })
  if (accepted.data?.[0]?.result !== 'linked') throw new Error(`roster link failed for ${name}`)
  return row.data.id
}

async function main() {
  const owner = await signUp('owner', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const customer = await signUp('customer', 'customer')
  const reviewer = await signUp('reviewer', 'customer')
  const trainee = await createWorker('trainee')
  const trainer = await createWorker('trainer')
  const second = await createWorker('second')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: 'Smoke W6 Wash', address: '6 Test Street' }).select('id').single()
  const shopId = shop.data?.id
  const approve = await reviewer.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId).select('id').single()
  check('verified_shop_ready', !promote.error && !shop.error && !approve.error, promote.error?.message ?? shop.error?.message ?? approve.error?.message)

  const anon = newClient(anonKey)
  for (const table of TABLES) {
    const read = await anon.from(table).select('*')
    check(`anon_read_${table}_error_or_zero_rows`, Boolean(read.error) || read.data?.length === 0, `${read.data?.length} rows`)
  }
  const ownerInsert = await owner.client.from('training_programs').insert({ shop_id: shopId, owner_id: owner.id, title: 'Direct' }).select('id')
  const workerInsert = await trainee.client.from('training_enrollments').insert({ worker_id: trainee.id }).select('id')
  const serviceInsert = await admin.from('training_attendance_records').insert({ attendance_status: 'present' }).select('id')
  check('direct_inserts_denied_for_owner_worker_and_service_role', denied(ownerInsert.error) && denied(workerInsert.error) && denied(serviceInsert.error),
    [ownerInsert.error?.code, workerInsert.error?.code, serviceInsert.error?.code].join(','))

  const created = await owner.client.rpc('create_training_program', { p_shop_id: shopId, p_title: 'Smoke W6 training' }).single()
  const programId = created.data?.id
  retainedProgramId = programId
  const draft = await owner.client.rpc('update_training_program_draft', {
    p_program_id: programId, p_title: 'Smoke W6 training', p_objectives: 'Learn safe washing', p_skills_to_learn: ['Rinse'],
    p_terms: 'Three supervised days', p_min_training_days: 3, p_assessment_checklist: ['Rinses well', 'Dries well'],
    p_training_pay_amount: 350, p_training_pay_currency: 'PHP', p_training_pay_period: 'day', p_training_pay_details: 'Paid daily',
    p_reimbursement_details: 'Fare refunded', p_expected_updated_at: created.data?.updated_at }).single()
  const sessions = []
  for (const [offset, kind] of [[0, 'supervised_training'], [1, 'supervised_training'], [2, 'supervised_training'], [3, 'competency_assessment']]) {
    sessions.push((await owner.client.rpc('add_training_session', { p_program_id: programId, p_session_date: manilaDate(offset), p_session_kind: kind }).single()).data?.id)
  }
  check('owner_creates_draft_program_with_sessions', !created.error && !draft.error && draft.data?.worker_fee === 0 && sessions.every(Boolean),
    created.error?.message ?? draft.error?.message)
  const draftRead = await trainee.client.from('training_programs').select('id')
  check('worker_cannot_see_draft_program', !draftRead.error && draftRead.data?.length === 0, draftRead.error?.message)
  const move = (client, from, to, attestation) => client.rpc('transition_training_program',
    { p_program_id: programId, p_from_status: from, p_to_status: to, p_owner_attestation_version: attestation }).single()
  const noAttestation = await move(owner.client, 'draft', 'open', null)
  check('open_refused_without_attestation', noAttestation.error?.message === 'Confirm the free-training statement before opening.', noAttestation.error?.message)
  const opened = await move(owner.client, 'draft', 'open', 'w6_owner_v1')
  check('owner_opens_program_with_attestation', opened.data?.status === 'open', opened.error?.message)

  const opening = await owner.client.from('job_openings').insert({ shop_id: shopId, title: 'Smoke W6 attendant', description: 'Wash cars',
    work_location: 'Smoke W6 Wash', openings_count: 2, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single()
  await owner.client.rpc('transition_job_opening', { p_job_opening_id: opening.data?.id, p_from_status: 'draft', p_to_status: 'published' })
  const applications = {}
  for (const [label, worker] of [['trainee', trainee], ['second', second]]) {
    const applied = await worker.client.rpc('create_job_application', { p_job_opening_id: opening.data?.id, p_submit: true, p_notice_version: 'w5_v1' }).single()
    for (const [from, to] of [['submitted', 'under_review'], ['under_review', 'accepted']]) {
      await owner.client.rpc('transition_job_application', { p_application_id: applied.data?.id, p_from_status: from, p_to_status: to })
    }
    applications[label] = applied.data?.id
  }
  const traineeRoster = await linkToRoster(owner, trainee, 'Smoke trainee')
  const trainerRoster = await linkToRoster(owner, trainer, 'Smoke trainer')
  const designation = await owner.client.rpc('designate_training_trainer', { p_program_id: programId, p_roster_worker_id: trainerRoster }).single()
  check('owner_designates_linked_trainer', !designation.error && designation.data?.trainer_id === trainer.id, designation.error?.message)
  const invite = await owner.client.rpc('invite_to_training', { p_program_id: programId, p_job_application_id: applications.trainee }).single()
  const secondInvite = await owner.client.rpc('invite_to_training', { p_program_id: programId, p_job_application_id: applications.second }).single()
  const enrollmentId = invite.data?.id
  check('owner_invites_accepted_applicants', invite.data?.status === 'invited' && secondInvite.data?.status === 'invited', invite.error?.message ?? secondInvite.error?.message)

  const schedule = (await one(trainee.client.from('training_programs').select('schedule_changed_at').eq('id', programId).single()))?.schedule_changed_at
  const respond = (notice) => trainee.client.rpc('respond_to_training_invitation',
    { p_enrollment_id: enrollmentId, p_accept: true, p_notice_version: notice, p_expected_schedule_changed_at: schedule }).single()
  const noNotice = await respond(null)
  check('accept_refused_without_notice', noNotice.error?.message === 'Review the free-training notice before enrolling.', noNotice.error?.message)
  const accepted = await respond('w6_v1')
  check('worker_accepts_with_notice_and_snapshot', accepted.data?.status === 'accepted' && accepted.data?.terms_snapshot?.worker_fee === 0
    && accepted.data?.terms_snapshot?.training_pay_amount === 350, accepted.error?.message ?? JSON.stringify(accepted.data?.terms_snapshot))
  const feePatch = await owner.client.from('training_programs').update({ worker_fee: 5 }).eq('id', programId).select('id')
  const feeRead = await one(owner.client.from('training_programs').select('worker_fee').eq('id', programId).single())
  check('worker_fee_patch_denied_and_still_zero', denied(feePatch.error) && feeRead?.worker_fee === 0, feePatch.error?.code ?? 'no error')

  const bookingId = trustedFixture('select test_helpers.create_booking_fixture($1, $2)', customer.id, shopId)
  const assign = await owner.client.from('bookings').update({ assigned_worker_id: traineeRoster }).eq('id', bookingId).select('id')
  check('trainee_booking_assignment_refused', assign.error?.code === '23514' && /required training/.test(assign.error?.message ?? ''), assign.error?.message ?? 'no error')

  const record = (client, sessionId, status = 'present') => client.rpc('record_training_attendance',
    { p_enrollment_id: enrollmentId, p_session_id: sessionId, p_attendance_status: status }).single()
  const selfRecord = await record(trainee.client, sessions[0])
  const otherRecord = await record(otherOwner.client, sessions[0])
  check('trainee_and_other_owner_cannot_record', denied(selfRecord.error) && denied(otherRecord.error), `${selfRecord.error?.code},${otherRecord.error?.code}`)
  const trainerRecord = await record(trainer.client, sessions[0])
  check('designated_trainer_records_attendance', trainerRecord.data?.recorder_role === 'trainer' && trainerRecord.data?.recorded_by === trainer.id,
    trainerRecord.error?.message)
  const duplicate = await record(trainer.client, sessions[0])
  check('same_day_duplicate_returns_23505', duplicate.error?.code === '23505', duplicate.error?.code ?? 'no error')
  const assess = () => trainer.client.rpc('record_training_assessment', { p_enrollment_id: enrollmentId, p_items_met: [true, true], p_result: 'passed' }).single()
  const early = await assess()
  check('assessment_before_three_days_refused', early.error?.message === 'The worker has not attended the required training days yet.', early.error?.message)

  const past = [manilaDate(-2), manilaDate(-1)].map((day) => trustedFixture('select test_helpers.add_training_session($1, $2)', programId, day))
  trustedFixture("update public.training_enrollments set accepted_at = now() - interval '5 days' where id = $1", enrollmentId)
  for (const sessionId of past) await record(trainer.client, sessionId)
  const progress = async () => (await one(trainee.client.from('training_enrollment_progress').select('progress_status, attended_training_days')
    .eq('enrollment_id', enrollmentId).single()))
  const awaiting = await progress()
  check('three_days_without_assessment_not_completed', awaiting?.progress_status === 'awaiting_assessment' && awaiting?.attended_training_days === 3,
    JSON.stringify(awaiting))
  const noReason = await trainer.client.rpc('correct_training_attendance',
    { p_attendance_id: trainerRecord.data?.id, p_attendance_status: 'absent', p_progress_note: null, p_correction_reason: null }).single()
  check('correction_without_reason_refused', noReason.error?.code === '23514', noReason.error?.message)
  const passedAssessment = await assess()
  const completed = await progress()
  check('completed_only_after_three_days_and_pass', !passedAssessment.error && completed?.progress_status === 'completed', passedAssessment.error?.message)
  const evidencePatch = await owner.client.from('training_assessments').update({ result: 'failed' }).eq('enrollment_id', enrollmentId).select('id')
  const evidenceDelete = await owner.client.from('training_attendance_records').delete().eq('enrollment_id', enrollmentId).select('id')
  check('evidence_patch_and_delete_denied', denied(evidencePatch.error) && denied(evidenceDelete.error), `${evidencePatch.error?.code},${evidenceDelete.error?.code}`)

  const notes = (await one(trainee.client.from('notifications').select('category, title, body').like('category', 'training%'))) ?? []
  check('trainee_notified_on_invite_and_assessment', ['training.invited', 'training.assessment'].every((c) => notes.some((n) => n.category === c)),
    JSON.stringify(notes.map((n) => n.category)))
  check('training_notifications_have_no_dates_names_or_pay', notes.length > 0
    && notes.every((n) => !/\d{4}-\d{2}-\d{2}|Smoke Test|350|PHP/.test(`${n.title} ${n.body}`)), JSON.stringify(notes))
  const setConfig = await trainee.client.rpc('set_config', { setting_name: 'washlink.training_write', new_value: enrollmentId, is_local: false })
  check('rpc_set_config_not_exposed', Boolean(setConfig.error) && setConfig.data === null, setConfig.error?.code ?? 'no error')

  if (await deleteUserChecked('owner_with_training_through_gotrue', owner.id)) {
    const retained = await one(second.client.from('training_enrollment_progress').select('progress_status').eq('enrollment_id', secondInvite.data?.id))
    check('owner_account_delete_retains_worker_training_d18', retained?.length === 1 && retained[0].progress_status === 'shop_removed', JSON.stringify(retained))
  }
  if (await deleteUserChecked('trainee_with_training_through_gotrue', trainee.id)) {
    const events = await one(reviewer.client.from('workforce_audit_events').select('action, payload').eq('subject_id', enrollmentId)
      .in('action', ['training_enrollment.deleted', 'training_enrollment.shop_removed']))
    check('worker_account_delete_removes_enrollment_and_keeps_audit', events?.length === 2
      && events.some((e) => e.action === 'training_enrollment.deleted' && e.payload?.deleted_by === 'worker_profile_deleted'), JSON.stringify(events))
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  if (retainedProgramId) {
    trustedFixture('delete from public.training_programs p where p.id = $1 and not exists (select 1 from public.training_enrollments e where e.program_id = p.id)', retainedProgramId)
    const left = trustedFixture('select count(*) from public.training_programs where id = $1', retainedProgramId)
    check('cleanup_retained_program_removed', left === '0', left)
  }
}
console.log(`w6-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
