#!/usr/bin/env node
// W9 local-only API smoke test: worker contracts, sealed versions, acceptance records and amendments through
// PostgREST / GoTrue.
//
//   node scripts/supabase-test/w9-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w8-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
// `.local-supabase-test` workdir. API URL and keys come from `npx supabase status -o env --workdir
// .local-supabase-test` and are held in memory: never printed, never written. Refuses any non-loopback API URL.
// Reads no .env. Users are synthetic (smoke9-*@local.test, random suffix) and deleted at the end (asserted). No
// time shift and no trusted write: every write goes through the real RPCs. Note: the super_admin publishes a new
// platform (standard) version, and contracts the remaining party keeps after a deleteUser (D-32, D-35) stay on the
// local stack as their retention rules require; the next run-db-tests.mjs reset removes them.

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
assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('w9-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w9-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w9-api-smoke: refusing non-loopback API URL')
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
const letterTag = runId.replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)])
const createdUserIds = []
const manilaToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const TABLES = ['contract_acknowledgement_texts', 'contract_problem_term_rules', 'worker_contracts', 'contract_versions', 'contract_version_clauses',
  'contract_version_flags', 'contract_acceptances', 'retained_job_application_records']
const LABEL = `Acceptance record ${String.fromCharCode(0x2014)} not an e-signature`
const PAY = 'Daily pay WALLABY as agreed in writing'
const REASON = 'Moving away NUMBAT, ending the contract.'

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
  const email = `smoke9-${label}-${runId}@local.test`
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { role, full_name: `Smoke ${label} Quoll` } }),
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

async function createWorker(label) {
  const worker = await signUp(label, 'worker')
  const profile = await worker.client.from('worker_profiles').insert({ profile_id: worker.id, headline: 'Smoke washer', availability_status: 'flexible' })
  if (profile.error) throw new Error(`worker profile failed for ${label}: ${profile.error.message}`)
  return worker
}

async function deleteUserChecked(label, id) {
  const { error } = await admin.auth.admin.deleteUser(id)
  check(`delete_user_${label}`, !error, error?.message)
  if (!error && createdUserIds.includes(id)) createdUserIds.splice(createdUserIds.indexOf(id), 1)
  return !error
}

const denied = (error) => error?.code === '42501'
const rows = async (query) => (await query).data ?? []
const one = async (query) => (await rows(query))[0]

async function main() {
  const owner = await signUp('owner', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const superAdmin = await signUp('admin', 'customer')
  const worker = await createWorker('worker')
  const contractor = await createWorker('contractor')
  const otherWorker = await createWorker('other-worker')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: 'Smoke W9 Wash', address: '9 Test Street' }).select('id').single()
  const shopId = shop.data?.id
  const approve = () => superAdmin.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId)
  await approve()
  const opening = await owner.client.from('job_openings').insert({ shop_id: shopId, title: 'Smoke W9 washer', description: 'Wash cars', work_location: 'Smoke W9',
    openings_count: 3, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single()
  await owner.client.rpc('transition_job_opening', { p_job_opening_id: opening.data?.id, p_from_status: 'draft', p_to_status: 'published' })
  for (const applicant of [worker, contractor]) {
    const applied = await applicant.client.rpc('create_job_application', { p_job_opening_id: opening.data?.id, p_cover_note: null, p_submit: true,
      p_notice_version: 'w5_v1' }).single()
    await owner.client.rpc('transition_job_application', { p_application_id: applied.data?.id, p_from_status: 'submitted', p_to_status: 'under_review' })
    await owner.client.rpc('transition_job_application', { p_application_id: applied.data?.id, p_from_status: 'under_review', p_to_status: 'accepted' })
  }
  const eligible = await rows(owner.client.rpc('owner_contract_eligible_workers'))
  check('setup_verified_shop_and_two_accepted_applicants', !promote.error && Boolean(shopId) && eligible.length === 2
    && eligible.every((row) => Object.keys(row).join(',') === 'worker_id,display_name,shop_id,shop_name,origin,has_open_contract'), JSON.stringify(eligible))

  for (const table of TABLES) {
    const attempts = [await owner.client.from(table).insert({ updated_at: new Date().toISOString() }), await worker.client.from(table).insert({ updated_at: new Date().toISOString() }),
      await admin.from(table).insert({ updated_at: new Date().toISOString() }), await owner.client.from(table).update({ updated_at: new Date().toISOString() }).not('created_at', 'is', null),
      await admin.from(table).update({ updated_at: new Date().toISOString() }).not('created_at', 'is', null), await worker.client.from(table).delete().not('created_at', 'is', null),
      await admin.from(table).delete().not('created_at', 'is', null)]
    check(`direct_writes_denied_${table}`, attempts.every((attempt) => denied(attempt.error)), attempts.map((attempt) => attempt.error?.code).join(','))
  }

  const platform = (await rows(owner.client.rpc('platform_contract_template_current')))[0]
  const created = await owner.client.rpc('create_owner_contract_template', { p_name: 'Smoke W9 crew agreement', p_from_version_id: null }).single()
  const template = (await rows(owner.client.rpc('owner_contract_templates'))).find((row) => row.template_id === created.data?.id)
  const draft = (workerId, classification, templateVersion = template?.current_version_id) => owner.client.rpc('create_worker_contract_draft', {
    p_shop_id: shopId, p_worker_id: workerId, p_template_version_id: templateVersion, p_classification_key: classification, p_start_date: manilaToday }).single()
  const notEligible = await draft(otherWorker.id, 'employee')
  const noClassification = await draft(worker.id, null)
  check('draft_refused_for_non_eligible_worker_and_without_classification', notEligible.error?.code === '23514' && noClassification.error?.code === '23514'
    && noClassification.error?.message === 'Choose the relationship type for this contract.', `${notEligible.error?.message} / ${noClassification.error?.message}`)
  const contract = await draft(worker.id, 'employee')
  const contractId = contract.data?.id
  const workerBefore = [...await rows(worker.client.from('worker_contracts').select('id')), ...await rows(worker.client.rpc('my_worker_contracts'))]
  check('worker_sees_nothing_before_send', contract.data?.status === 'draft' && workerBefore.length === 0, contract.error?.message ?? `${workerBefore.length} rows`)

  const standard = await rows(owner.client.rpc('contract_template_version_clauses', { p_version_id: platform?.version_id }))
  const bodies = Object.fromEntries(standard.filter((clause) => clause.kind === 'editable').map((clause) => [clause.clause_key, 'The shop and the worker agree to this smoke clause.']))
  bodies.pay_terms = 'We pay {{pay_details}} each Friday.'
  const values = { role_title: 'Car wash attendant', schedule_summary: 'Weekdays from morning to afternoon', pay_details: PAY }
  const deposit = [{ section_number: 7, heading: 'Locker', body: 'The worker pays a deposit for the locker key.' }]
  const save = (id, revision, terms = deposit, classification = 'employee', extra = {}) => owner.client.rpc('save_worker_contract_draft', { p_contract_id: id,
    p_expected_draft_revision: revision, p_classification_key: classification, p_start_date: manilaToday, p_end_date: null, p_owner_values: values,
    p_editable_bodies: { ...bodies, ...extra }, p_shop_terms: terms }).single()
  const send = (id, revision, flags, contractorAck = null) => owner.client.rpc('send_worker_contract_version', { p_contract_id: id,
    p_expected_draft_revision: revision, p_acknowledgement_key: 'w9_owner_send_v1', p_contractor_acknowledgement_key: contractorAck,
    p_acknowledged_flag_count: flags }).single()
  const saved = await save(contractId, 1)
  const preview = (await rows(owner.client.rpc('preview_worker_contract_draft', { p_contract_id: contractId })))[0]
  await owner.client.from('shops').update({ name: 'Smoke W9 Wash Renamed' }).eq('id', shopId)
  const unverified = await send(contractId, 2, 1)
  await approve()
  const staleFlags = await send(contractId, 2, 0)
  const sent = await send(contractId, 2, 1)
  check('unverified_shop_send_23514', unverified.error?.code === '23514'
    && unverified.error?.message === 'Your shop needs a recorded verification before you send a contract.', unverified.error?.message)
  check('send_with_deposit_term_and_flag_acknowledgement', !saved.error && preview?.flag_count === 1 && staleFlags.error?.code === '55000'
    && sent.data?.state === 'sent_for_review' && sent.data?.flag_count === 1, saved.error?.message ?? staleFlags.error?.message ?? sent.error?.message)

  const v1 = sent.data?.id
  const doc = await one(worker.client.rpc('worker_contract_version_document', { p_version_id: v1 }))
  const flags = await rows(worker.client.rpc('worker_contract_version_flags', { p_version_id: v1 }))
  const clauses = await rows(worker.client.rpc('worker_contract_version_clauses', { p_version_id: v1 }))
  check('worker_reads_document_flags_and_diff', doc?.content_hash === sent.data?.content_hash && doc?.record_label === LABEL
    && doc?.rendered_text.includes(PAY) && flags.length === 1 && flags[0].rule_key === 'deposit' && flags[0].disclaimer.startsWith('Automatic keyword check.')
    && clauses.some((clause) => clause.change === 'edited' && clause.edited_in === 'contract') && clauses.some((clause) => clause.change === 'added_by_shop'),
    JSON.stringify({ flags: flags.length, clauses: clauses.length }))
  const accept = (client, id, version, hash, contractorAck = null) => client.rpc('accept_worker_contract_version', { p_contract_id: id, p_version_id: version,
    p_content_hash: hash, p_acknowledgement_key: 'w9_worker_accept_v1', p_contractor_acknowledgement_key: contractorAck }).single()
  const staleAccept = await accept(worker.client, contractId, v1, platform?.content_hash)
  const accepted = await accept(worker.client, contractId, v1, doc?.content_hash)
  const records = await rows(worker.client.rpc('worker_contract_acceptances', { p_contract_id: contractId }))
  check('stale_hash_accept_55000', staleAccept.error?.code === '55000', staleAccept.error?.code ?? 'no error')
  check('worker_accepts_with_acceptance_records', accepted.data?.status === 'accepted' && records.length === 2
    && records.every((record) => record.record_label === LABEL && record.version_content_hash === doc?.content_hash), accepted.error?.message)

  const templateSave = await owner.client.rpc('save_owner_contract_template_version', { p_template_id: created.data?.id, p_expected_version_number: 1,
    p_base_platform_version_id: platform?.version_id, p_editable_bodies: { schedule: 'Evenings only from now on.' }, p_shop_terms: [] }).single()
  const publishInput = standard.map((clause) => ({ section_number: clause.section_number, clause_key: clause.clause_key, kind: clause.kind, heading: clause.heading,
    requires_owner_input: clause.requires_owner_input,
    body: clause.clause_key === 'attachments_list' ? `[Shop: list each attachment by its title (${letterTag} nine), or write "None".]` : clause.body }))
  const published = await superAdmin.client.rpc('publish_platform_contract_template_version', { p_expected_version_number: platform?.version_number,
    p_clauses: publishInput }).single()
  const docAfter = await one(worker.client.rpc('worker_contract_version_document', { p_version_id: v1 }))
  check('template_save_and_platform_publish_leave_document_unchanged', !templateSave.error && !published.error && docAfter?.content_hash === doc?.content_hash
    && docAfter?.rendered_text === doc?.rendered_text, templateSave.error?.message ?? published.error?.message)

  const revisionOf = async () => (await rows(owner.client.rpc('owner_worker_contracts'))).find((row) => row.contract_id === contractId)?.revision
  const amendment = async (extra) => {
    const created = await owner.client.rpc('create_worker_contract_amendment', { p_contract_id: contractId, p_expected_revision: await revisionOf() }).single()
    await save(contractId, 1, deposit, 'employee', extra)
    return send(contractId, 2, 1)
  }
  const first = await amendment({ schedule: 'Weekends only for the season.' })
  const declined = await worker.client.rpc('decline_worker_contract_version', { p_contract_id: contractId, p_version_id: first.data?.id, p_note: 'Prefer weekdays.' }).single()
  const afterDecline = (await rows(worker.client.rpc('my_worker_contracts')))[0]
  check('amendment_declined_current_unchanged', declined.data?.status === 'accepted' && afterDecline?.current_version_number === 1
    && afterDecline?.pending_version_id === null, first.error?.message ?? declined.error?.message)
  const second = await amendment({ schedule: 'Mornings and some afternoons.' })
  const acceptedSecond = await accept(worker.client, contractId, second.data?.id, second.data?.content_hash)
  const history = await rows(worker.client.rpc('worker_contract_versions', { p_contract_id: contractId }))
  check('second_amendment_accepted_old_superseded', acceptedSecond.data?.current_version_id === second.data?.id
    && history.map((row) => `${row.version_number}:${row.state}`).join(',') === '3:accepted,2:declined,1:superseded', JSON.stringify(history.map((row) => row.state)))

  const contractorDraft = await draft(contractor.id, 'independent_contractor')
  await save(contractorDraft.data?.id, 1, [], 'independent_contractor')
  const noOwnerAck = await send(contractorDraft.data?.id, 2, 0)
  const contractorSent = await send(contractorDraft.data?.id, 2, 0, 'w9_contractor_owner_v1')
  const noWorkerAck = await accept(contractor.client, contractorDraft.data?.id, contractorSent.data?.id, contractorSent.data?.content_hash)
  const contractorAccepted = await accept(contractor.client, contractorDraft.data?.id, contractorSent.data?.id, contractorSent.data?.content_hash, 'w9_contractor_worker_v1')
  check('missing_contractor_acknowledgement_23514', noOwnerAck.error?.code === '23514' && noWorkerAck.error?.code === '23514'
    && noWorkerAck.error?.message === 'Confirm the independent contractor acknowledgement.' && contractorAccepted.data?.status === 'accepted',
    noOwnerAck.error?.message ?? contractorAccepted.error?.message)

  for (const [label, client] of [['other_owner', otherOwner.client], ['other_worker', otherWorker.client], ['super_admin', superAdmin.client]]) {
    const leaks = [...await rows(client.from('worker_contracts').select('id')), ...await rows(client.from('contract_versions').select('id')),
      ...await rows(client.from('contract_acceptances').select('id')), ...await rows(client.rpc('worker_contract_version_document', { p_version_id: v1 })),
      ...await rows(client.rpc('worker_contract_acceptances', { p_contract_id: contractId }))]
    check(`${label}_reads_nothing`, leaks.length === 0, `${leaks.length} rows`)
  }

  const activated = await owner.client.rpc('activate_worker_contract', { p_contract_id: contractId, p_expected_revision: await revisionOf() }).single()
  check('owner_records_the_start', activated.data?.status === 'active', activated.error?.message)
  const terminated = await worker.client.rpc('terminate_worker_contract', { p_contract_id: contractId, p_expected_revision: activated.data?.revision,
    p_reason: REASON }).single()
  check('worker_terminates_with_reason', terminated.data?.status === 'terminated' && terminated.data?.ended_by === 'worker', terminated.error?.message)

  const notes = [...await rows(worker.client.from('notifications').select('title, body').eq('subject_type', 'worker_contract')),
    ...await rows(owner.client.from('notifications').select('title, body').eq('subject_type', 'worker_contract'))]
  check('notifications_hold_no_contract_text', notes.length >= 8 && notes.every((note) => !/(WALLABY|NUMBAT|Quoll|deposit|weekdays|locker)/i.test(note.title + note.body)),
    `${notes.length} notifications`)
  const setConfig = await owner.client.rpc('set_config', { setting_name: 'washlink.worker_contract_write', new_value: contractId, is_local: false })
  const expire = await owner.client.rpc('expire_worker_contracts', { p_as_of: manilaToday })
  const seal = await owner.client.rpc('worker_contract_seal_version', { p_version_id: v1 })
  check('set_config_and_internal_functions_not_callable', Boolean(setConfig.error) && Boolean(expire.error) && Boolean(seal.error),
    [setConfig.error?.code, expire.error?.code, seal.error?.code].join(','))

  if (await deleteUserChecked('owner_with_contracts_through_gotrue', owner.id)) {
    const kept = (await rows(worker.client.rpc('my_worker_contracts')))[0]
    const keptDoc = await one(worker.client.rpc('worker_contract_version_document', { p_version_id: v1 }))
    const keptRecords = await rows(contractor.client.rpc('worker_contract_acceptances', { p_contract_id: contractorDraft.data?.id }))
    check('owner_delete_keeps_contracts_for_worker', kept?.status === 'terminated' && kept?.owner_removed === true && keptDoc?.content_hash === doc?.content_hash
      && keptRecords.length === 2, JSON.stringify(kept ?? null))
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
console.log(`w9-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
