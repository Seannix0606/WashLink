#!/usr/bin/env node
// W11 local-only API smoke test: dashboards, WashLink certification review and contract disputes through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w11-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w10: ONLY the local stack of the staged `.local-supabase-test` workdir; keys come from `supabase status` in memory, never
// printed or written; refuses any non-loopback URL; reads no .env; synthetic smoke11-*@local.test users deleted at the end (asserted). TEST-ONLY fixtures via
// `docker exec supabase_db_<project_id> psql` (completed training, 14-day backdate of a shop request; validated values only). Everything else: real RPCs.
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
    console.error('w11-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w11-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w11-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const SAFE_VALUE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}|\d{1,3}|smoke11-[a-z0-9-]+@local\.test)$/
function trustedFixture(sql, ...values) {
  if (!values.every((value) => SAFE_VALUE.test(String(value)))) throw new Error('trusted fixture: unsafe value')
  const text = values.reduce((acc, value, index) => acc.replaceAll(`$${index + 1}`, `'${value}'`), sql)
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', text], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted fixture failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim().split(/\r?\n/).pop()
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const [admin, anon] = [newClient(serviceKey), newClient(anonKey)]
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const [createdUserIds, retainedPrograms] = [[], []]
const manilaToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const TABLES = ['certification_platform_reviews', 'worker_contract_disputes']
const MARK = 'ZEBRAFINCH'
const text = (what) => `Smoke ${MARK} ${what} statement for the local check.`

let [passed, failed] = [0, 0]
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
  const email = `smoke11-${label}-${runId}@local.test`
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

const rows = async (query) => (await query).data ?? []
const one = async (query) => (await rows(query))[0]

async function main() {
  const superAdmin = await signUp('admin', 'customer')
  const worker = await createWorker('worker')
  const otherWorker = await createWorker('other-worker')
  const customer = await signUp('customer', 'customer')
  const ownerA = await signUp('owner-a', 'owner')
  const ownerB = await signUp('owner-b', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  check('setup_super_admin_promoted', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)
  const sa = superAdmin.client
  const makeShop = async (owner, name) => {
    const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name, address: '11 Test Street' }).select('id').single()
    await sa.from('shops').update({ verification_status: 'approved' }).eq('id', shop.data?.id)
    return shop.data?.id
  }
  const shopA1 = await makeShop(ownerA, 'Smoke W11 Wash A1')
  const shopA2 = await makeShop(ownerA, 'Smoke W11 Wash A2')
  const shopB = await makeShop(ownerB, 'Smoke W11 Wash B')
  await makeShop(otherOwner, 'Smoke W11 Wash Other')
  // Direct writes on both W11 tables are denied for every client role, including service_role.
  const stamp = new Date().toISOString()
  for (const table of TABLES) {
    const attempts = []
    for (const client of [ownerA.client, worker.client, customer.client, admin, sa, anon]) {
      attempts.push(await client.from(table).insert({ updated_at: stamp }), await client.from(table).update({ updated_at: stamp }).not('created_at', 'is', null),
        await client.from(table).delete().not('created_at', 'is', null))
    }
    check(`direct_writes_denied_${table}`, attempts.every((a) => a.error && a.status >= 400 && !a.data?.length), attempts.map((a) => a.error?.code).join(','))
  }
  // Dashboard summaries: one row for the right role, none for any other role or anon.
  const summaries = { my_worker_dashboard_summary: worker, owner_dashboard_summary: ownerA, admin_dashboard_summary: superAdmin }
  const roles = { worker, ownerA, customer, superAdmin, anon: { client: anon } }
  const summaryRows = {}
  for (const [fn, right] of Object.entries(summaries)) {
    for (const [label, who] of Object.entries(roles)) summaryRows[`${fn}:${label}`] = (await rows(who.client.rpc(fn))).length
  }
  const expected = (fn, label) => (summaries[fn] === roles[label] ? 1 : 0)
  check('summaries_one_row_for_right_role_only', Object.entries(summaryRows).every(([key, count]) => count === expected(...key.split(':'))), JSON.stringify(summaryRows))
  const adminSummary = await one(sa.rpc('admin_dashboard_summary'))
  const ownerSummary = await one(ownerA.client.rpc('owner_dashboard_summary'))
  const workerSummary = await one(worker.client.rpc('my_worker_dashboard_summary'))
  check('summary_columns_are_counts_flags_and_dates_only', [adminSummary, ownerSummary, workerSummary].every((row) => row
    && Object.values(row).every((value) => value === null || ['number', 'boolean'].includes(typeof value) || Array.isArray(value) || /^\d{4}-\d{2}-\d{2}/.test(value)))
    && ownerSummary.shop_count === 2 && ownerSummary.verified_shop_count === 2, JSON.stringify(ownerSummary ?? null))
  // Certification A: issued, suspended, escalation rules, holds.
  const issueCert = async (owner, shopId) => {
    const enrollment = trustedFixture('select test_helpers.complete_training($1, $2, $3)', shopId, worker.id, owner.email)
    retainedPrograms.push(trustedFixture('select program_id from public.training_enrollments where id = $1', enrollment))
    const assessment = trustedFixture('select public.current_training_assessment_id($1)', enrollment)
    const issued = await owner.client.rpc('issue_certification', { p_enrollment_id: enrollment, p_expected_assessment_id: assessment, p_issuer_attestation_version: 'w7_issuer_v1' }).single()
    if (issued.error) throw new Error(`issue failed: ${issued.error.message}`)
    return issued.data.id
  }
  const suspend = (owner, id) => owner.client.rpc('transition_certification', { p_certification_id: id, p_from_status: 'active', p_to_status: 'suspended', p_reason: text('suspend') }).single()
  const openReview = (id, statement = text('worker')) => worker.client.rpc('open_certification_platform_review', { p_certification_id: id, p_expected_status: 'suspended', p_statement: statement }).single()
  const certA = await issueCert(ownerA, shopA1)
  const activeOpen = await worker.client.rpc('open_certification_platform_review', { p_certification_id: certA, p_expected_status: 'active', p_statement: text('worker') }).single()
  check('review_refused_for_active_certificate', activeOpen.error?.code === '23514', activeOpen.error?.message)
  await suspend(ownerA, certA)
  const tooEarly = await openReview(certA)
  const mineBefore = (await rows(worker.client.rpc('my_certification_platform_reviews'))).find((row) => row.certification_id === certA)
  check('review_refused_before_shop_decides_and_can_open_false', tooEarly.error?.code === '23514' && /Ask the shop/.test(tooEarly.error?.message ?? '') && mineBefore?.can_open === false,
    tooEarly.error?.message ?? JSON.stringify(mineBefore))
  const shopRequest = await worker.client.rpc('request_certification_review', { p_certification_id: certA, p_statement: text('shop request') }).single()
  const stillEarly = await openReview(certA)
  trustedFixture('select test_helpers.backdate_shop_review_request($1, $2)', shopRequest.data?.id, 15)
  const shortStatement = await openReview(certA, 'too short')
  const opened = await openReview(certA)
  const requestAfter = { status: trustedFixture('select status from public.certification_review_requests where id = $1', shopRequest.data?.id) }
  check('overdue_shop_request_allows_escalation_and_withdraws_it', stillEarly.error?.code === '23514' && shortStatement.error?.code === '23514'
    && opened.data?.status === 'open' && opened.data?.basis === 'shop_decision_overdue' && requestAfter?.status === 'withdrawn', opened.error?.message ?? requestAfter?.status)
  const reviewId = opened.data?.id
  const again = await openReview(certA)
  check('second_open_review_refused_23505', again.error?.code === '23505', again.error?.code)
  // Holds while a review is open (W7 RPCs unchanged): revoke and a new shop request are refused; owner and worker cannot decide.
  const revokeHeld = await ownerA.client.rpc('transition_certification', { p_certification_id: certA, p_from_status: 'suspended', p_to_status: 'revoked', p_reason: text('revoke') }).single()
  const requestHeld = await worker.client.rpc('request_certification_review', { p_certification_id: certA, p_statement: text('again') }).single()
  check('revoke_and_shop_request_held_while_review_open', revokeHeld.error?.code === '23514' && /WashLink is reviewing/.test(revokeHeld.error?.message ?? '')
    && requestHeld.error?.code === '23514', `${revokeHeld.error?.message} / ${requestHeld.error?.message}`)
  const decideAs = (client, decision = 'uphold') => client.rpc('decide_certification_platform_review', { p_review_id: reviewId, p_expected_revision: 1, p_decision: decision, p_reason: text('decision') }).single()
  const refusedDeciders = []
  for (const [label, client] of [['owner', ownerA.client], ['worker', worker.client], ['customer', customer.client], ['service_role', admin], ['anon', anon]]) refusedDeciders.push(`${label}:${(await decideAs(client)).error?.code}`)
  check('only_super_admin_decides_reviews', refusedDeciders.every((entry) => !entry.endsWith('undefined')), refusedDeciders.join(','))
  const queue = await rows(sa.rpc('admin_certification_platform_review_queue'))
  const outsiders = (await Promise.all([ownerA.client, worker.client, customer.client, anon].map((client) => rows(client.rpc('admin_certification_platform_review_queue'))))).flat()
  const caseBefore = (await rows(sa.from('workforce_audit_events').select('id').eq('action', 'certification_platform_review.case_viewed'))).length
  const reviewCase = await sa.rpc('admin_certification_platform_review_case', { p_review_id: reviewId })
  const caseAfter = (await rows(sa.from('workforce_audit_events').select('id').eq('action', 'certification_platform_review.case_viewed'))).length
  const workerCase = await worker.client.rpc('admin_certification_platform_review_case', { p_review_id: reviewId })
  check('admin_queue_and_audited_case_only_for_super_admin', queue.some((row) => row.review_id === reviewId) && outsiders.length === 0 && reviewCase.data?.review?.id === reviewId
    && caseAfter === caseBefore + 1 && Boolean(workerCase.error), `${queue.length} / ${outsiders.length} / ${caseBefore}->${caseAfter}`)
  const rawAdminReads = await Promise.all(TABLES.map((table) => sa.from(table).select('id')))
  check('super_admin_has_no_raw_select_on_w11_tables', queue.length >= 1 && rawAdminReads.every((r) => (r.data ?? []).length === 0), rawAdminReads.map((r) => r.data?.length ?? r.error?.code).join(','))
  // Contracts sent and ended while the review is open: terminate and decline are never blocked (J16).
  const templateOf = async (owner) => {
    const created = await owner.client.rpc('create_owner_contract_template', { p_name: `Smoke W11 ${owner.id.slice(0, 4)} agreement`, p_from_version_id: null }).single()
    return (await rows(owner.client.rpc('owner_contract_templates'))).find((row) => row.template_id === created.data?.id)?.current_version_id
  }
  const templateA = await templateOf(ownerA)
  const standard = await rows(ownerA.client.rpc('contract_template_version_clauses', { p_version_id: (await one(ownerA.client.rpc('platform_contract_template_current')))?.version_id }))
  const bodies = Object.fromEntries(standard.filter((clause) => clause.kind === 'editable').map((clause) => [clause.clause_key, 'The shop and the worker agree to this smoke clause.']))
  bodies.pay_terms = 'We pay {{pay_details}} each Friday.'
  const values = { role_title: 'Car wash attendant', schedule_summary: 'Weekdays from morning to afternoon', pay_details: 'Daily pay as agreed in writing' }
  const contractRevision = async (id) => (await rows(ownerA.client.rpc('owner_worker_contracts'))).find((row) => row.contract_id === id)
  const sendOffer = async (shopId, beforeSend) => {
    const opening = await ownerA.client.from('job_openings').insert({ shop_id: shopId, title: `Smoke W11 ${shopId.slice(0, 4)}`, description: 'Wash cars', work_location: 'Smoke W11',
      openings_count: 2, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single()
    await ownerA.client.rpc('transition_job_opening', { p_job_opening_id: opening.data?.id, p_from_status: 'draft', p_to_status: 'published' })
    const applied = await worker.client.rpc('create_job_application', { p_job_opening_id: opening.data?.id, p_cover_note: null, p_submit: true, p_notice_version: 'w5_v1' }).single()
    for (const [from, to] of [['submitted', 'under_review'], ['under_review', 'accepted']]) {
      await ownerA.client.rpc('transition_job_application', { p_application_id: applied.data?.id, p_from_status: from, p_to_status: to })
    }
    const draft = await ownerA.client.rpc('create_worker_contract_draft', { p_shop_id: shopId, p_worker_id: worker.id, p_template_version_id: templateA, p_classification_key: 'employee', p_start_date: manilaToday }).single()
    await ownerA.client.rpc('save_worker_contract_draft', { p_contract_id: draft.data?.id, p_expected_draft_revision: 1, p_classification_key: 'employee', p_start_date: manilaToday,
      p_end_date: null, p_owner_values: values, p_editable_bodies: bodies, p_shop_terms: [] }).single()
    if (beforeSend) await beforeSend(draft.data?.id)
    const sent = await ownerA.client.rpc('send_worker_contract_version', { p_contract_id: draft.data?.id, p_expected_draft_revision: 2, p_acknowledgement_key: 'w9_owner_send_v1',
      p_contractor_acknowledgement_key: null, p_acknowledged_flag_count: 0 }).single()
    if (draft.error || sent.error) throw new Error(`contract setup failed: ${draft.error?.message} / ${sent.error?.message}`)
    return { id: draft.data.id, version: sent.data }
  }
  const activeContract = async (shopId) => {
    const sent = await sendOffer(shopId)
    await worker.client.rpc('accept_worker_contract_version', { p_contract_id: sent.id, p_version_id: sent.version.id, p_content_hash: sent.version.content_hash,
      p_acknowledgement_key: 'w9_worker_accept_v1', p_contractor_acknowledgement_key: null }).single()
    const active = await ownerA.client.rpc('activate_worker_contract', { p_contract_id: sent.id, p_expected_revision: (await contractRevision(sent.id))?.revision }).single()
    if (active.error) throw new Error(`activation failed: ${active.error.message}`)
    return { ...sent, revision: active.data.revision }
  }
  const raise = (client, id, category, statement = text('dispute')) => client.rpc('raise_contract_dispute', { p_contract_id: id, p_category: category, p_statement: statement }).single()
  const contract1 = await activeContract(shopA1)
    const ended = await ownerA.client.rpc('terminate_worker_contract', { p_contract_id: contract1.id, p_expected_revision: contract1.revision, p_reason: 'Ending the smoke contract MARTEN now.' }).single()
  const wrongCategory = await raise(worker.client, contract1.id, 'worker_ended_contract')
  const stranger = await raise(otherWorker.client, contract1.id, 'other')
  const strangerOwner = await raise(otherOwner.client, contract1.id, 'other')
  const dispute = await raise(worker.client, contract1.id, 'owner_ended_contract')
  const duplicate = await raise(worker.client, contract1.id, 'owner_ended_contract')
  check('worker_reports_owner_termination_with_rules', !ended.error && wrongCategory.error?.code === '23514' && stranger.error?.code === '42501' && strangerOwner.error?.code === '42501'
    && dispute.data?.status === 'open' && duplicate.error?.code === '23505', ended.error?.message ?? dispute.error?.message ?? duplicate.error?.code)
  const contractBefore = await contractRevision(contract1.id)
  const ownerList = await rows(ownerA.client.rpc('my_contract_disputes'))
  const otherSeen = (await Promise.all([otherWorker.client, otherOwner.client, customer.client, anon].map((client) => rows(client.rpc('my_contract_disputes'))))).flat()
  check('only_the_two_parties_see_the_dispute_and_no_admin_ids', ownerList.length === 1 && ownerList[0].can_respond === true && otherSeen.length === 0
    && !Object.keys(ownerList[0]).some((key) => /admin|viewed_by|closed_by/.test(key)), `${ownerList.length} / ${otherSeen.length}`)
  const selfRespond = await worker.client.rpc('respond_to_contract_dispute', { p_dispute_id: dispute.data?.id, p_statement: text('own side') }).single()
  const response = await ownerA.client.rpc('respond_to_contract_dispute', { p_dispute_id: dispute.data?.id, p_statement: text('owner side') }).single()
  const secondResponse = await ownerA.client.rpc('respond_to_contract_dispute', { p_dispute_id: dispute.data?.id, p_statement: text('owner again') }).single()
  check('other_party_responds_once_only', selfRespond.error?.code === '42501' && !response.error && secondResponse.error?.code === '23505', `${selfRespond.error?.code} / ${response.error?.message} / ${secondResponse.error?.code}`)
  const noAdmin = (await Promise.all([ownerA.client, worker.client, customer.client, admin, anon].map((client) => client.rpc('admin_contract_dispute_case', { p_dispute_id: dispute.data?.id })))).map((r) => r.error?.code)
  const viewAudits = async () => (await rows(sa.from('workforce_audit_events').select('id, payload').eq('action', 'worker_contract_dispute.case_viewed').eq('subject_id', contract1.id)))
  const auditsBefore = (await viewAudits()).length
  const openCase = await sa.rpc('admin_contract_dispute_case', { p_dispute_id: dispute.data?.id })
  const sealedVersion = openCase.data?.versions?.[0]
  const document = await rows(sa.rpc('admin_contract_dispute_version_document', { p_dispute_id: dispute.data?.id, p_version_id: sealedVersion?.id }))
  const wrongDoc = await rows(sa.rpc('admin_contract_dispute_version_document', { p_dispute_id: dispute.data?.id, p_version_id: '00000000-0000-4000-8000-000000000000' }))
  const auditsAfter = await viewAudits()
  check('admin_case_while_open_has_contract_block_and_is_audited', noAdmin.every(Boolean) && openCase.data?.contract?.status === 'terminated' && openCase.data?.versions?.length >= 1
    && document.length === 1 && wrongDoc.length === 0 && auditsAfter.length === auditsBefore + 2, `${noAdmin} / ${auditsBefore}->${auditsAfter.length}`)
  check('relationship_block_has_no_count_and_audit_payload_no_statement', !JSON.stringify(openCase.data?.relationship ?? {}).match(/count|remaining|minimum|owners/i)
    && !JSON.stringify(auditsAfter.map((row) => row.payload)).includes(MARK), JSON.stringify(openCase.data?.relationship))
  const queueRow = (await rows(sa.rpc('admin_contract_dispute_queue'))).find((row) => row.dispute_id === dispute.data?.id)
  const staleClose = await sa.rpc('close_contract_dispute', { p_dispute_id: dispute.data?.id, p_expected_revision: 99, p_resolution_kind: 'information_shared', p_resolution_note: text('close') }).single()
  const badKind = await sa.rpc('close_contract_dispute', { p_dispute_id: dispute.data?.id, p_expected_revision: queueRow?.revision, p_resolution_kind: 'award_pay', p_resolution_note: text('close') }).single()
  const nonAdminClose = await ownerA.client.rpc('close_contract_dispute', { p_dispute_id: dispute.data?.id, p_expected_revision: queueRow?.revision, p_resolution_kind: 'information_shared', p_resolution_note: text('close') }).single()
  const closed = await sa.rpc('close_contract_dispute', { p_dispute_id: dispute.data?.id, p_expected_revision: queueRow?.revision, p_resolution_kind: 'referred_outside_washlink', p_resolution_note: text('close') }).single()
  const contractAfter = await contractRevision(contract1.id)
  check('close_needs_admin_revision_and_kind_and_leaves_contract_unchanged', staleClose.error?.code === '55000' && badKind.error?.code === '22023' && nonAdminClose.error?.code === '42501'
    && closed.data?.status === 'closed' && contractBefore?.status === 'terminated' && JSON.stringify(contractAfter) === JSON.stringify(contractBefore), `${staleClose.error?.code} ${badKind.error?.code} ${closed.error?.message}`)
  const closedRow = (await rows(sa.rpc('admin_contract_dispute_queue', { p_status: 'closed' }))).find((row) => row.dispute_id === dispute.data?.id)
  check('closed_dispute_queue_row_hides_contract_fields', queueRow?.contract_status === 'terminated' && Boolean(queueRow?.shop_name_snapshot) && closedRow?.contract_id === contract1.id
    && [closedRow?.contract_status, closedRow?.effective_status, closedRow?.shop_name_snapshot].every((value) => value === null), JSON.stringify(closedRow ?? null))
  const closedCase = await sa.rpc('admin_contract_dispute_case', { p_dispute_id: dispute.data?.id })
  const closedDoc = await rows(sa.rpc('admin_contract_dispute_version_document', { p_dispute_id: dispute.data?.id, p_version_id: sealedVersion?.id }))
  check('closed_dispute_case_has_no_contract_block_and_no_document', closedCase.data?.dispute?.status === 'closed' && !closedCase.data?.contract && closedDoc.length === 0, JSON.stringify(Object.keys(closedCase.data ?? {})))
  // An open dispute never blocks terminate (worker) or decline (worker); withdraw by the raiser.
  const contract2 = await activeContract(shopA2)
  const ownerDispute = await raise(ownerA.client, contract2.id, 'contract_terms')
  const terminated = await worker.client.rpc('terminate_worker_contract', { p_contract_id: contract2.id, p_expected_revision: contract2.revision, p_reason: 'Moving away, ending the smoke contract.' }).single()
  const withdrawn = await ownerA.client.rpc('withdraw_contract_dispute', { p_dispute_id: ownerDispute.data?.id }).single()
  const withdrawAgain = await ownerA.client.rpc('withdraw_contract_dispute', { p_dispute_id: ownerDispute.data?.id }).single()
  check('open_dispute_does_not_block_terminate_and_raiser_withdraws', !ownerDispute.error && terminated.data?.status === 'terminated' && withdrawn.data?.status === 'withdrawn'
    && withdrawAgain.error?.code === '23514', terminated.error?.message ?? ownerDispute.error?.message ?? withdrawn.error?.message)
  let unsent = null
  const offer = await sendOffer(shopA1, async (draftId) => { unsent = await raise(ownerA.client, draftId, 'contract_terms') })
  const offerDispute = await raise(worker.client, offer.id, 'contract_terms')
  const declined = await worker.client.rpc('decline_worker_contract_version', { p_contract_id: offer.id, p_version_id: offer.version.id, p_note: 'Not now.' }).single()
  check('open_dispute_does_not_block_decline_and_unsent_draft_cannot_be_reported', unsent?.error?.code === '23514' && !offerDispute.error && !declined.error && declined.data?.status !== 'active', declined.error?.message ?? offerDispute.error?.message)
  // The WashLink review is still open: uphold it (final for this event), then a second escalation is refused.
  const decide = (decision, revision = 1) => sa.rpc('decide_certification_platform_review', { p_review_id: reviewId, p_expected_revision: revision, p_decision: decision, p_reason: text('decision') }).single()
  const [stale, badDecision] = [await decide('uphold', 9), await decide('delete')]
  const upheld = await decide('uphold')
  const afterUphold = (await rows(worker.client.rpc('my_certifications'))).find((row) => row.certification_id === certA)
  const escalateAgain = await openReview(certA)
  check('super_admin_upholds_certificate_unchanged_and_second_escalation_refused', stale.error?.code === '55000' && badDecision.error?.code === '22023' && upheld.data?.status === 'upheld'
    && afterUphold?.status === 'suspended' && escalateAgain.error?.code === '23514', upheld.error?.message ?? escalateAgain.error?.message)
  // Notifications carry fixed text only.
  const notes = (await Promise.all([worker.client, ownerA.client].map((client) => rows(client.from('notifications').select('category, title, body').or('category.like.certification_platform_review%,category.like.worker_contract_dispute%'))))).flat()
  check('oversight_notifications_have_no_statement_text', notes.length >= 4 && notes.every((n) => !new RegExp(`${MARK}|MARTEN`).test(`${n.title} ${n.body}`)), JSON.stringify(notes.map((n) => n.category)))
  // Issuer unavailable: the owner account is removed, the suspended certificate can still go to WashLink and be reinstated.
  const certB = await issueCert(ownerB, shopB).then(async (id) => { await suspend(ownerB, id); return id })
  if (await deleteUserChecked('owner_b_with_suspended_certificate_through_gotrue', ownerB.id)) {
    const stranded = await worker.client.rpc('open_certification_platform_review', { p_certification_id: certB, p_expected_status: 'suspended', p_statement: text('stranded') }).single()
    const reinstated = await sa.rpc('decide_certification_platform_review', { p_review_id: stranded.data?.id, p_expected_revision: 1, p_decision: 'reinstate', p_reason: text('reinstate') }).single()
    const row = (await rows(worker.client.rpc('my_certifications'))).find((item) => item.certification_id === certB)
    check('owner_removed_issuer_unavailable_escalation_then_reinstate', stranded.data?.basis === 'issuer_unavailable' && reinstated.data?.status === 'reinstated' && row?.status === 'active',
      stranded.error?.message ?? reinstated.error?.message)
  }
  // Internal functions and set_config are not callable by any client role.
  const internal = []
  for (const client of [ownerA.client, worker.client, sa, admin, anon]) {
    const results = await Promise.all([client.rpc('certification_platform_review_basis', { p_cert: certA }),
      client.rpc('set_config', { setting_name: 'washlink.certification_platform_review_decision', new_value: certA, is_local: false }),
      client.rpc('set_config', { setting_name: 'washlink.contract_dispute_write', new_value: dispute.data?.id, is_local: false })])
    internal.push(...results.map((result) => result.error?.code ?? 'callable'))
  }
  check('basis_function_and_set_config_not_callable', internal.every((code) => code !== 'callable'), internal.join(','))
  const anonRpc = await Promise.all(['admin_dashboard_summary', 'my_contract_disputes', 'my_certification_platform_reviews', 'admin_contract_dispute_queue'].map((fn) => anon.rpc(fn)))
  check('anon_cannot_call_w11_rpcs', anonRpc.every((result) => result.error), anonRpc.map((result) => result.error?.code).join(','))
  if (await deleteUserChecked('worker_with_review_and_disputes_through_gotrue', worker.id)) {
    const events = await rows(sa.from('workforce_audit_events').select('action').in('action', ['certification_platform_review.deleted', 'worker_contract_dispute.deleted']))
    const left = trustedFixture('select count(*) from public.certification_platform_reviews where worker_id = $1', worker.id)
    check('worker_delete_cascades_review_and_audits', left === '0' && events.some((e) => e.action === 'certification_platform_review.deleted'), `${left} rows, ${events.length} events`)
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
}
console.log(`w11-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)