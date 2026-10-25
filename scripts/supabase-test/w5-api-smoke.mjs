#!/usr/bin/env node
// W5 local-only API smoke test: marketplace search and job applications through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w5-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2/w3/w4-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
// `.local-supabase-test` workdir. The local API URL and keys come from
// `npx supabase status -o env --workdir .local-supabase-test` and are held in memory: never
// printed, never written. Refuses any non-loopback API URL. Reads no .env. Test users are
// synthetic (@local.test, random suffix) and are deleted at the end (result asserted).

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

assertLocalTestProjectId(
  fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'),
  'staged config.toml',
)

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
  })
  if (result.status !== 0) {
    console.error('w5-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w5-api-smoke: could not read local API settings')
    process.exit(2)
  }
  const host = new URL(apiUrl).hostname
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    console.error('w5-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const admin = newClient(serviceKey)
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const NOTICE = 'w5_v1'
const COVER_NOTE = `Smoke cover note ${runId}`

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
  const email = `smoke5-${label}-${runId}@local.test`
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

const isPermissionError = (error) => error?.code === '42501'
const apply = (client, openingId, notice = NOTICE, coverNote = null) =>
  client.rpc('create_job_application', {
    p_job_opening_id: openingId, p_cover_note: coverNote, p_submit: true, p_notice_version: notice,
  }).single()
const moveApplication = (client, id, from, to) =>
  client.rpc('transition_job_application', { p_application_id: id, p_from_status: from, p_to_status: to }).single()
const moveOpening = (client, id, from, to) =>
  client.rpc('transition_job_opening', { p_job_opening_id: id, p_from_status: from, p_to_status: to }).single()

async function createWorker(label) {
  const worker = await signUp(label, 'worker')
  const profile = await worker.client.from('worker_profiles')
    .insert({ profile_id: worker.id, headline: 'Smoke washer', availability_status: 'flexible' }).select('profile_id').single()
  if (profile.error) throw new Error(`worker profile failed for ${label}: ${profile.error.message}`)
  return worker
}

async function main() {
  const owner = await signUp('owner', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const customer = await signUp('customer', 'customer')
  const reviewer = await signUp('reviewer', 'customer')
  const worker = await createWorker('worker')
  const otherWorker = await createWorker('other-worker')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  check('service_role_can_promote_reviewer', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)
  const contact = await worker.client.from('worker_private_contacts')
    .insert({ profile_id: worker.id, contact_phone: '+63 917 000 0005', preferred_contact_method: 'phone' }).select('profile_id')
  check('worker_saves_private_contact', !contact.error, contact.error?.message)

  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: 'Smoke W5 Wash', address: '5 Test Street' }).select('id').single()
  const approve = await reviewer.client.from('shops').update({ verification_status: 'approved' }).eq('id', shop.data?.id).select('id').single()
  check('verified_shop_ready', !shop.error && !approve.error, shop.error?.message ?? approve.error?.message)
  const draft = await owner.client.from('job_openings').insert({
    shop_id: shop.data?.id, title: 'Smoke W5 attendant', description: 'Wash and dry cars', work_location: 'Smoke W5 Wash',
    openings_count: 1, job_type: 'part_time', applicant_requirement: 'trainees_welcome', other_terms: 'Smoke original terms',
  }).select('id').single()
  const openingId = draft.data?.id
  const publish = await moveOpening(owner.client, openingId, 'draft', 'published')
  check('owner_publishes_opening', !draft.error && publish.data?.status === 'published', draft.error?.message ?? publish.error?.message)

  const anonRead = await newClient(anonKey).from('job_applications').select('id')
  check('anon_read_gets_error_or_zero_rows', Boolean(anonRead.error) || anonRead.data?.length === 0, `${anonRead.data?.length} rows`)
  const directInsert = await worker.client.from('job_applications')
    .insert({ job_opening_id: openingId, worker_id: worker.id, shop_id: shop.data?.id, owner_id: owner.id }).select('id')
  check('worker_direct_insert_denied', isPermissionError(directInsert.error), directInsert.error?.code ?? 'no error')

  const workerSearch = await worker.client.rpc('search_job_openings', {})
  check('worker_search_returns_one_opening', !workerSearch.error && workerSearch.data?.length === 1
    && workerSearch.data[0].job_opening_id === openingId && workerSearch.data[0].my_application_status === null,
  workerSearch.error?.message ?? JSON.stringify(workerSearch.data))
  for (const [label, client] of [['customer', customer.client], ['owner', owner.client]]) {
    const search = await client.rpc('search_job_openings', {})
    check(`${label}_search_returns_zero_rows`, !search.error && search.data?.length === 0, search.error?.message ?? `${search.data?.length} rows`)
  }

  const noNotice = await apply(worker.client, openingId, null)
  check('apply_without_notice_rejected', noNotice.error?.message === 'Review the training and work notice before applying.',
    noNotice.error?.message ?? 'no error')
  const applied = await apply(worker.client, openingId, NOTICE, COVER_NOTE)
  const applicationId = applied.data?.id
  check('worker_applies_through_rpc', !applied.error && applied.data?.status === 'submitted'
    && applied.data?.opening_snapshot?.other_terms === 'Smoke original terms', applied.error?.message)
  const duplicate = await apply(worker.client, openingId)
  check('duplicate_application_rejected', duplicate.error?.code === '23505'
    && duplicate.error?.message === 'You have already applied to this job opening.', duplicate.error?.message ?? 'no error')

  const directPatch = await worker.client.from('job_applications').update({ status: 'accepted' }).eq('id', applicationId).select('id')
  check('worker_direct_patch_denied', isPermissionError(directPatch.error), directPatch.error?.code ?? 'no error')
  const directDelete = await worker.client.from('job_applications').delete().eq('id', applicationId).select('id')
  check('worker_direct_delete_denied', isPermissionError(directDelete.error), directDelete.error?.code ?? 'no error')
  const setConfig = await worker.client.rpc('set_config', { setting_name: 'washlink.job_application_write', new_value: applicationId, is_local: false })
  check('rpc_set_config_not_exposed', Boolean(setConfig.error) && setConfig.data === null, setConfig.error?.code ?? 'no error')

  const otherWorkerRead = await otherWorker.client.from('job_applications').select('id')
  check('other_worker_sees_zero_applications', !otherWorkerRead.error && otherWorkerRead.data?.length === 0, otherWorkerRead.error?.message)
  const ownerRead = await owner.client.from('job_applications').select('id, status, cover_note')
  check('owner_sees_one_application', !ownerRead.error && ownerRead.data?.length === 1 && ownerRead.data[0].id === applicationId,
    ownerRead.error?.message ?? `${ownerRead.data?.length} rows`)
  const otherOwnerRead = await otherOwner.client.from('job_applications').select('id')
  check('other_owner_sees_zero_applications', !otherOwnerRead.error && otherOwnerRead.data?.length === 0, otherOwnerRead.error?.message)
  const otherOwnerMove = await moveApplication(otherOwner.client, applicationId, 'submitted', 'under_review')
  check('other_owner_transition_denied', isPermissionError(otherOwnerMove.error), otherOwnerMove.error?.message ?? 'no error')

  const contacts = await owner.client.from('worker_private_contacts').select('profile_id')
  check('owner_reads_zero_private_contacts', !contacts.error && contacts.data?.length === 0, contacts.error?.message)
  const profiles = await owner.client.rpc('applicant_profiles_for_job_opening', { p_job_opening_id: openingId })
  const profileKeys = Object.keys(profiles.data?.[0] ?? {})
  check('applicant_profiles_have_no_contact_keys', !profiles.error && profiles.data?.length === 1
    && profileKeys.length > 0 && !profileKeys.some((key) => /contact|phone|email/i.test(key)),
  profiles.error?.message ?? profileKeys.join(','))
  const certifications = await owner.client.rpc('applicant_verified_certifications', { p_application_id: applicationId })
  check('verified_certifications_empty_list', !certifications.error && Array.isArray(certifications.data)
    && certifications.data.length === 0, certifications.error?.message)

  const review = await moveApplication(owner.client, applicationId, 'submitted', 'under_review')
  check('owner_moves_to_under_review', review.data?.status === 'under_review', review.error?.message)
  const stale = await moveApplication(owner.client, applicationId, 'submitted', 'under_review')
  check('stale_transition_returns_55000', stale.error?.code === '55000', stale.error?.code ?? 'no error')

  const withdraw = await moveApplication(worker.client, applicationId, 'under_review', 'withdrawn')
  check('worker_withdraws', withdraw.data?.status === 'withdrawn', withdraw.error?.message)
  const reapplied = await apply(worker.client, openingId)
  const reapplicationId = reapplied.data?.id
  check('worker_reapplies_after_withdraw', !reapplied.error && reapplied.data?.status === 'submitted', reapplied.error?.message)

  const edit = await owner.client.from('job_openings').update({ other_terms: 'Smoke edited terms' }).eq('id', openingId).select('id')
  const snapshot = await worker.client.from('job_applications').select('opening_snapshot').eq('id', reapplicationId).single()
  check('snapshot_unchanged_after_owner_edit', !edit.error && edit.data?.length === 1
    && snapshot.data?.opening_snapshot?.other_terms === 'Smoke original terms', edit.error?.message ?? snapshot.error?.message)

  const close = await moveOpening(owner.client, openingId, 'published', 'closed')
  const closedApplication = await worker.client.from('job_applications').select('status').eq('id', reapplicationId).single()
  check('closing_opening_closes_application', close.data?.status === 'closed' && closedApplication.data?.status === 'closed',
    close.error?.message ?? closedApplication.error?.message)
  const stillVisible = await worker.client.from('job_openings').select('id, status').eq('id', openingId)
  check('applicant_still_reads_closed_opening', !stillVisible.error && stillVisible.data?.length === 1, stillVisible.error?.message)

  const ownerNotes = await owner.client.from('notifications').select('category, title, body').like('category', 'job_application%')
  const workerNotes = await worker.client.from('notifications').select('category, title, body').like('category', 'job_%')
  const allNotes = [...(ownerNotes.data ?? []), ...(workerNotes.data ?? [])]
  check('notifications_exist_for_both_parties', !ownerNotes.error && !workerNotes.error
    && ownerNotes.data?.some((row) => row.category === 'job_application.submitted')
    && ownerNotes.data?.some((row) => row.category === 'job_application.withdrawn')
    && workerNotes.data?.some((row) => row.category === 'job_application.closed'),
  ownerNotes.error?.message ?? JSON.stringify(allNotes.map((row) => row.category)))
  check('notifications_have_no_cover_note_or_terms', allNotes.length > 0
    && allNotes.every((row) => !`${row.title} ${row.body}`.includes('Smoke cover note') && !`${row.title} ${row.body}`.includes('terms')),
  JSON.stringify(allNotes))

  if (await deleteUserChecked('worker_with_applications_through_gotrue', worker.id)) {
    const remaining = await owner.client.from('job_applications').select('id')
    check('worker_account_delete_removes_applications', !remaining.error && remaining.data?.length === 0, remaining.error?.message)
    const deletedEvents = await reviewer.client.from('workforce_audit_events').select('payload')
      .in('subject_id', [applicationId, reapplicationId]).eq('action', 'job_application.deleted')
    check('worker_account_delete_audited', !deletedEvents.error && deletedEvents.data?.length === 2
      && deletedEvents.data.every((row) => row.payload?.deleted_by === 'worker_profile_deleted'),
    deletedEvents.error?.message ?? JSON.stringify(deletedEvents.data))
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
}
console.log(`w5-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
