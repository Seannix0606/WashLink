#!/usr/bin/env node
// W14 local-only API smoke test: posting reports, takedown, unreviewed-shop re-review, standard template publishing, redacted
// activity, audit log and relationship lookups through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w14-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w11: ONLY the local stack of the staged `.local-supabase-test` workdir; keys come from `supabase status` in memory,
// never printed or written; refuses any non-loopback URL; reads no .env; synthetic smoke14-*@local.test users deleted at the end (asserted).
// TEST-ONLY fixture via `docker exec supabase_db_<project_id> psql` (uuid values only): test_helpers.make_test_shop_legacy_unreviewed
// (a pre-W2 production row) and read-only counts. Everything else: real RPCs.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { adminAuditRows } from './smoke-admin-audit-log.mjs'
import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const { createClient } = createRequire(path.join(repoRoot, 'frontend', 'package.json'))('@supabase/supabase-js')
const projectId = assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')
const dbContainer = `supabase_db_${projectId}`

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('w14-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w14-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w14-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
function trustedFixture(sql, id) {
  if (!new RegExp(`^${UUID.source}$`).test(id)) throw new Error('trusted fixture: unsafe value')
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', sql.replaceAll('$1', `'${id}'`)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted fixture failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim().split(/\r?\n/).pop()
}
const NIL = '00000000-0000-4000-8000-000000000000'
const contractHashes = () => trustedFixture("select coalesce(md5(string_agg(coalesce(content_hash, ''), ',' order by id)), 'none') from public.contract_versions where $1::uuid = $1::uuid", NIL)

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const [admin, anon] = [newClient(serviceKey), newClient(anonKey)]
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const TABLES = ['job_opening_reports', 'job_opening_moderation_cases', 'job_opening_moderation_actions', 'admin_access_records']
const MARK = 'ZEBRAFINCH'
const text = (what) => `Smoke ${MARK} ${what} statement for the local check.`
const letterTag = runId.replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)])

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
  const email = `smoke14-${label}-${runId}@local.test`
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
const code = (result) => result.error?.code ?? 'ok'

async function main() {
  const superAdmin = await signUp('admin', 'customer')
  const [worker, worker2] = [await createWorker('worker'), await createWorker('worker2')]
  const customer = await signUp('customer', 'customer')
  const [ownerA, ownerB] = [await signUp('owner-a', 'owner'), await signUp('owner-b', 'owner')]
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  check('setup_super_admin_promoted', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)
  const sa = superAdmin.client
  const makeShop = async (owner, name) => {
    const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name, address: '14 Test Street' }).select('id').single()
    await sa.from('shops').update({ verification_status: 'approved' }).eq('id', shop.data?.id)
    return shop.data?.id
  }
  const [shopA, shopB, shopC, shopD] = [await makeShop(ownerA, 'Smoke W14 Wash A'), await makeShop(ownerB, 'Smoke W14 Wash B'),
    await makeShop(ownerB, 'Smoke W14 Wash C'), await makeShop(ownerB, 'Smoke W14 Wash D')]
  const makeOpening = async (owner, shopId, title) => {
    const draft = await owner.client.from('job_openings').insert({ shop_id: shopId, title, description: 'Wash cars', work_location: 'Smoke W14', openings_count: 2,
      job_type: 'part_time', applicant_requirement: 'trainees_welcome', other_terms: 'Smoke original terms' }).select('id').single()
    const published = await owner.client.rpc('transition_job_opening', { p_job_opening_id: draft.data?.id, p_from_status: 'draft', p_to_status: 'published' })
    if (draft.error || published.error) throw new Error(`opening setup failed: ${draft.error?.message} / ${published.error?.message}`)
    return draft.data.id
  }
  const move = (opening, from, to) => ownerA.client.rpc('transition_job_opening', { p_job_opening_id: opening, p_from_status: from, p_to_status: to })
  const title1 = `Smoke W14 posting ${runId}`
  const title2 = `Smoke W14 limits ${runId}`
  const [o1, o2, ob] = [await makeOpening(ownerA, shopA, title1), await makeOpening(ownerA, shopA, title2), await makeOpening(ownerB, shopB, `Smoke W14 shop B ${runId}`)]
  const applied = await worker.client.rpc('create_job_application', { p_job_opening_id: o1, p_cover_note: null, p_submit: true, p_notice_version: 'w5_v1' }).single()
  const snapshotOf = async () => one(worker.client.from('job_applications').select('status, opening_snapshot').eq('id', applied.data?.id))
  const snapBefore = await snapshotOf()
  // No direct writes on the four new tables (incl. service_role); no raw selects (incl. super_admin).
  const stamp = new Date().toISOString()
  for (const table of TABLES) {
    const attempts = []
    for (const client of [ownerA.client, worker.client, customer.client, admin, sa, anon]) {
      attempts.push(await client.from(table).insert({ created_at: stamp }), await client.from(table).update({ updated_at: stamp }).not('created_at', 'is', null),
        await client.from(table).delete().not('created_at', 'is', null))
    }
    const reads = await Promise.all([ownerA.client, worker.client, sa, admin, anon].map((client) => client.from(table).select('*')))
    check(`direct_writes_and_raw_selects_denied_${table}`, attempts.every((a) => a.error && a.status >= 400 && !a.data?.length) && reads.every((r) => (r.data ?? []).length === 0),
      attempts.map((a) => a.error?.code).join(','))
  }
  // Reports: worker only, readable opening, duplicate, per-opening limit; owner sees nothing.
  const report = (client, opening, category = 'age_requirement', statement = text('report')) => client.rpc('report_job_opening', { p_job_opening_id: opening, p_category: category, p_statement: statement }).single()
  const first = await report(worker.client, o1)
  const [dup, badCategory, shortText] = [await report(worker.client, o1), await report(worker2.client, o1, 'nonsense'), await report(worker2.client, o1, 'other', 'too short')]
  const forbidden = [await report(ownerA.client, o1), await report(customer.client, o1), await report(anon, o1)]
  check('worker_reports_with_rules_and_others_refused', first.data?.status === 'open' && dup.error?.code === '23505' && badCategory.error?.code === '22023' && shortText.error?.code === '23514'
    && forbidden.every((r) => r.error), `${first.error?.message} ${code(dup)} ${code(badCategory)} ${code(shortText)}`)
  const limitCodes = []
  for (let n = 0; n < 4; n += 1) {
    const reported = await report(worker.client, o2, 'misleading_terms')
    limitCodes.push(code(reported))
    if (reported.data) await worker.client.rpc('withdraw_job_opening_report', { p_report_id: reported.data.report_id }).single()
  }
  check('report_limit_per_opening_23514', limitCodes.join() === 'ok,ok,ok,23514', limitCodes.join())
  const mine = await rows(worker.client.rpc('my_job_opening_reports'))
  const ownerView = await rows(ownerA.client.rpc('owner_job_opening_moderation'))
  const ownerReports = await rows(ownerA.client.rpc('my_job_opening_reports'))
  check('owner_sees_no_report_statement_or_reporter', mine.some((row) => row.report_id === first.data?.report_id) && ownerView.length === 0 && ownerReports.length === 0
    && (await rows(ownerA.client.rpc('admin_job_opening_moderation_queue'))).length === 0, `${mine.length} / ${ownerView.length}`)
  // Admin queue + audited case read.
  const queueRow = async (status = 'active', title = title1) => (await rows(sa.rpc('admin_job_opening_moderation_queue', { p_status: status }))).find((row) => row.opening_title_snapshot === title)
  const q1 = await queueRow()
  const views = async () => (await rows(adminAuditRows(sa, { action: 'job_opening_moderation.case_viewed' }))).length
  const viewsBefore = await views()
  const caseRead = await sa.rpc('admin_job_opening_moderation_case', { p_case_id: q1?.case_id })
  const outsiderCase = await Promise.all([ownerA, worker, customer].map((who) => who.client.rpc('admin_job_opening_moderation_case', { p_case_id: q1?.case_id })))
  const serialized = JSON.stringify(caseRead.data ?? {})
  check('admin_queue_and_audited_case_without_reporter_identity', q1?.report_count === 1 && (await views()) === viewsBefore + 1 && outsiderCase.every((r) => r.error)
    && serialized.includes('Reporter 1') && !serialized.includes(worker.id) && !serialized.includes(worker.email), `${q1?.report_count} / ${viewsBefore}->${await views()}`)
  // Takedown: pause with hold, owner resume refused, owner edit + submit, keep, lift, resume.
  const moderate = (client, row, action, kind = 'age_requirement', revision = row?.revision) => client.rpc('moderate_job_opening',
    { p_case_id: row?.case_id, p_expected_revision: revision, p_action: action, p_reason_kind: kind, p_owner_message: `Smoke ${MARK} please remove the age limit from this posting.`, p_admin_note: null }).single()
  const [stale, notAdmin] = [await moderate(sa, q1, 'pause', 'age_requirement', 99), await moderate(ownerA.client, q1, 'close')]
  const paused = await moderate(sa, q1, 'pause')
  const resumeHeld = await move(o1, 'paused', 'published')
  const notice = await one(ownerA.client.rpc('owner_job_opening_moderation'))
  check('super_admin_pauses_with_hold_owner_sees_reason_only', stale.error?.code === '55000' && notAdmin.error?.code === '42501' && paused.data?.status === 'paused_by_washlink'
    && resumeHeld.error?.code === '23514' && notice?.status === 'paused_by_washlink' && notice?.owner_message.includes(MARK) && !JSON.stringify(notice).match(/statement|reporter|admin_note|report_count/i),
  `${code(stale)} ${code(notAdmin)} ${paused.error?.message} ${code(resumeHeld)}`)
  const submitEarly = await ownerA.client.rpc('submit_job_opening_changes', { p_case_id: notice?.case_id, p_note: null }).single()
  const noOpEdit = await ownerA.client.from('job_openings').update({ other_terms: 'Smoke original terms' }).eq('id', o1).select('id')
  const submitNoOp = await ownerA.client.rpc('submit_job_opening_changes', { p_case_id: notice?.case_id, p_note: null }).single()
  const edit = await ownerA.client.from('job_openings').update({ other_terms: 'Smoke edited terms' }).eq('id', o1).select('id')
  const submit = await ownerA.client.rpc('submit_job_opening_changes', { p_case_id: notice?.case_id, p_note: 'Removed the age limit.' }).single()
  const adminEdit = await sa.from('job_openings').update({ title: 'Edited by admin' }).eq('id', o1).select('id')
  const adminPublish = await sa.rpc('transition_job_opening', { p_job_opening_id: o1, p_from_status: 'paused', p_to_status: 'published' })
  check('owner_edits_then_submits_super_admin_cannot_edit_or_publish', submitEarly.error?.code === '23514' && !noOpEdit.error && submitNoOp.error?.code === '23514' && !edit.error && submit.data?.status === 'changes_submitted'
    && (adminEdit.error || (adminEdit.data ?? []).length === 0) && Boolean(adminPublish.error), `${code(submitEarly)} ${edit.error?.message} ${submit.error?.message}`)
  const kept = await moderate(sa, await queueRow(), 'keep_paused', 'misleading_terms')
  await ownerA.client.from('job_openings').update({ other_terms: 'Smoke edited terms again' }).eq('id', o1)
  const resubmit = await ownerA.client.rpc('submit_job_opening_changes', { p_case_id: notice?.case_id, p_note: null }).single()
  const lifted = await moderate(sa, await queueRow(), 'lift')
  const resumed = await move(o1, 'paused', 'published')
  check('keep_pause_then_lift_owner_resumes', kept.data?.status === 'paused_by_washlink' && resubmit.data?.status === 'changes_submitted' && lifted.data?.status === 'lifted'
    && resumed.data?.status === 'published', `${kept.error?.message} ${resubmit.error?.message} ${lifted.error?.message} ${resumed.error?.message}`)
  const second = await report(worker2.client, o1, 'unpaid_trial_or_training')
  const closed = await moderate(sa, await queueRow(), 'close', 'unpaid_trial_or_training')
  const snapAfter = await snapshotOf()
  check('close_closes_applications_and_snapshots_unchanged', !second.error && closed.data?.status === 'closed_by_washlink' && snapAfter?.status === 'closed'
    && JSON.stringify(snapAfter?.opening_snapshot) === JSON.stringify(snapBefore?.opening_snapshot) && snapBefore?.opening_snapshot?.other_terms === 'Smoke original terms',
  `${second.error?.message} ${closed.error?.message} ${snapAfter?.status}`)
  // B1: an owner close of a WashLink-paused opening closes the open reports in the owner's session; the owner's activity
  // still shows no report event, the reporter sees their own.
  await worker2.client.rpc('create_job_application', { p_job_opening_id: o2, p_cover_note: null, p_submit: true, p_notice_version: 'w5_v1' })
  await report(worker2.client, o2, 'other')
  const pausedO2 = await moderate(sa, await queueRow('active', title2), 'pause', 'other')
  const lateReport = await report(worker2.client, o2, 'worker_fee_or_deposit')
  const ownerClosed = await move(o2, 'paused', 'closed')
  const [ownerB1, reporterB1] = await Promise.all([ownerA, worker2].map((who) => rows(who.client.rpc('my_workforce_activity', { p_limit: 100 }))))
  check('b1_owner_close_never_shows_reports_to_owner', pausedO2.data?.status === 'paused_by_washlink' && !lateReport.error && !ownerClosed.error
    && !ownerB1.some((row) => row.action.startsWith('job_opening_report')) && reporterB1.some((row) => row.action === 'job_opening_report.closed' && row.details?.outcome === 'opening_closed'),
  `${code(pausedO2)} ${code(lateReport)} ${code(ownerClosed)} ${ownerB1.map((r) => r.action).join('|')}`)
  // Re-review of approved shops without a recorded review.
  const unreviewed = [shopB, shopC, shopD]
  unreviewed.forEach((shopId) => trustedFixture('select test_helpers.make_test_shop_legacy_unreviewed($1::uuid)', shopId))
  const shopQueue = await rows(sa.rpc('admin_unreviewed_approved_shops'))
  const outsiders = (await Promise.all([ownerB.client, worker.client, customer.client, anon].map((client) => rows(client.rpc('admin_unreviewed_approved_shops'))))).flat()
  const visible = async () => (await rows(worker.client.rpc('search_job_openings', {}))).some((row) => row.job_opening_id === ob)
  const hiddenBefore = !(await visible())
  const rereview = (client, shopId, decision, notes = null) => client.rpc('rereview_approved_shop', { p_shop_id: shopId, p_decision: decision, p_notes: notes }).single()
  const refused = await Promise.all([ownerB.client, worker.client, admin].map((client) => rereview(client, shopB, 'confirm_approval')))
  const confirmed = await rereview(sa, shopB, 'confirm_approval')
  const noNotes = await rereview(sa, shopC, 'request_changes', 'short')
  const changes = await rereview(sa, shopC, 'request_changes', text('changes'))
  const rejected = await rereview(sa, shopD, 'reject', text('reject'))
  const again = await rereview(sa, shopB, 'confirm_approval')
  check('rereview_confirm_request_changes_reject', unreviewed.every((id) => shopQueue.some((row) => row.shop_id === id)) && outsiders.length === 0 && hiddenBefore && refused.every((r) => r.error)
    && confirmed.data?.verification_status === 'approved' && noNotes.error?.code === '23514' && changes.data?.verification_status === 'changes_requested'
    && rejected.data?.verification_status === 'rejected' && again.error?.code === '23514' && (await visible()), `${shopQueue.length} ${code(confirmed)} ${code(changes)} ${code(rejected)}`)
  // Standard template: super_admin only; existing owner versions and sent contract hashes unchanged.
  const current = await one(ownerA.client.rpc('platform_contract_template_current'))
  const created = await ownerA.client.rpc('create_owner_contract_template', { p_name: `Smoke W14 ${runId} agreement`, p_from_version_id: null }).single()
  const ownerVersion = async () => JSON.stringify(await rows(ownerA.client.rpc('contract_template_version_clauses',
    { p_version_id: (await rows(ownerA.client.rpc('owner_contract_templates'))).find((row) => row.template_id === created.data?.id)?.current_version_id })))
  const [versionBefore, hashesBefore] = [await ownerVersion(), contractHashes()]
  const input = (await rows(sa.rpc('contract_template_version_clauses', { p_version_id: current?.version_id }))).map((clause) => ({ section_number: clause.section_number,
    clause_key: clause.clause_key, kind: clause.kind, heading: clause.heading, requires_owner_input: clause.requires_owner_input,
    body: clause.clause_key === 'attachments_list' ? `[Shop: list each attachment by its title (${letterTag}), or write "None".]` : clause.body }))
  const publish = (client, expected = current?.version_number) => client.rpc('publish_platform_contract_template_version', { p_expected_version_number: expected, p_clauses: input }).single()
  const publishDenied = await Promise.all([ownerA.client, worker.client, customer.client, anon].map((client) => publish(client)))
  const published = await publish(sa)
  const stalePublish = await publish(sa)
  const listed = (await rows(ownerA.client.rpc('owner_contract_templates'))).find((row) => row.template_id === created.data?.id)
  check('standard_template_published_by_super_admin_only_and_stays_draft', publishDenied.every((r) => r.error) && published.data?.version_number === current?.version_number + 1
    && published.data?.review_status === 'draft_requires_legal_review' && stalePublish.error?.code === '55000' && listed?.newer_standard_available === true,
  `${published.error?.message} ${code(stalePublish)}`)
  check('owner_versions_and_contract_hashes_unchanged_after_publish', (await ownerVersion()) === versionBefore && contractHashes() === hashesBefore)
  // Redacted activity per role, audited admin log, audited relationship lookups (no minimum, D1).
  const activity = {}
  for (const [label, who] of Object.entries({ worker, ownerA, customer, superAdmin })) activity[label] = await rows(who.client.rpc('my_workforce_activity', { p_limit: 100 }))
  const idKeys = /(^|_)(actor|subject|subject_profile)_id$/
  check('activity_redacted_per_role_no_ids', Object.values(activity).every((list) => list.every((row) => !Object.keys(row).some((key) => idKeys.test(key)) && !UUID.test(JSON.stringify(row.details ?? {}))))
    && activity.worker.length > 0 && !activity.ownerA.some((row) => row.action.startsWith('job_opening_report') || ['job_opening_moderation.opened', 'job_opening_moderation.dismissed'].includes(row.action))
    && activity.ownerA.some((row) => row.action.startsWith('job_opening_moderation.')) && !(await anon.rpc('my_workforce_activity')).data?.length, Object.entries(activity).map(([k, v]) => `${k}:${v.length}`).join(','))
  // W13 (D-70): the helper reads through admin_workforce_audit_log and pages (fix cycle 1, W13 N4); every RPC call adds
  // one log_searched event after its rows are read, so the final count is before + before.calls + 1 (the log call) + last.calls.
  const searches = async () => adminAuditRows(sa, { action: 'workforce_audit.log_searched' })
  const before = await searches()
  const log = await rows(sa.rpc('admin_workforce_audit_log', { p_action_prefix: 'job_opening_moderation', p_limit: 50 }))
  const logDenied = await Promise.all([ownerA, worker, customer].map((who) => who.client.rpc('admin_workforce_audit_log', { p_limit: 5 })))
  const last = await searches()
  const lastSearch = last.data?.at(-1)
  const after = await searches()
  const expectedSearches = (before.data?.length ?? NaN) + before.calls + 1 + last.calls
  check('admin_audit_log_is_audited_and_admin_only', log.length > 0 && log.every((row) => row.action.startsWith('job_opening_moderation')) && after.data?.length === expectedSearches
    && lastSearch?.payload?.action_prefix === 'job_opening_moderation' && lastSearch?.payload?.subject_type === null
    && logDenied.every((r) => r.error) && Boolean((await anon.rpc('admin_workforce_audit_log', { p_limit: 5 })).error), `${log.length} / ${before.data?.length}->${after.data?.length} (expected ${expectedSearches})`)
  const lookup = (client, fn, id, purpose = 'policy_monitoring', note = text('lookup')) => client.rpc(fn, { [fn === 'admin_worker_relationships' ? 'p_worker_id' : 'p_owner_id']: id, p_purpose: purpose, p_note: note })
  const accessEvents = async () => (await rows(adminAuditRows(sa, { action: 'admin_access.relationships_viewed' }))).length
  const accessBefore = await accessEvents()
  const [badPurpose, shortNote] = [await lookup(sa, 'admin_worker_relationships', worker.id, 'curiosity'), await lookup(sa, 'admin_worker_relationships', worker.id, 'policy_monitoring', 'short')]
  const workerLookup = await lookup(sa, 'admin_worker_relationships', worker.id)
  const ownerLookup = await lookup(sa, 'admin_owner_relationships', ownerA.id)
  const unknown = await lookup(sa, 'admin_worker_relationships', NIL)
  const denied = []
  for (const client of [ownerA.client, worker.client, customer.client, admin, anon]) denied.push((await lookup(client, 'admin_worker_relationships', worker.id)).error, (await lookup(client, 'admin_owner_relationships', ownerA.id)).error)
  check('relationship_lookups_need_purpose_note_are_audited_and_return_no_minimum', badPurpose.error?.code === '22023' && shortNote.error?.code === '23514'
    && workerLookup.data?.found === true && ownerLookup.data?.found === true && unknown.data?.found === false && !/minimum/i.test(JSON.stringify(workerLookup.data))
    && !/worker_count|other_owner/i.test(JSON.stringify(ownerLookup.data)) && denied.every(Boolean) && (await accessEvents()) === accessBefore + 3, `${code(badPurpose)} ${code(shortNote)} ${accessBefore}->${await accessEvents()}`)
  const subjectActivity = await rows(worker.client.rpc('my_workforce_activity', { p_limit: 100 }))
  check('lookup_visible_in_subject_activity', subjectActivity.some((row) => row.action === 'admin_access.relationships_viewed' && row.actor_label === 'washlink' && row.details?.purpose === 'washlink_review'), subjectActivity.map((r) => r.action).join(','))
  // Internal functions, trigger functions and set_config are not callable by any client role.
  const internal = []
  for (const client of [ownerA.client, worker.client, sa, admin, anon]) {
    const results = await Promise.all([client.rpc('shop_lacks_recorded_super_admin_review', { p_shop_id: shopB }), client.rpc('job_opening_moderation_close_reports', { p_case: q1?.case_id, p_outcome: 'no_action' }),
      client.rpc('admin_access_record_lookup', { p_access_kind: 'worker_relationships', p_subject: worker.id, p_purpose: 'policy_monitoring', p_note: text('x'), p_row_count: 0 }),
      client.rpc('job_openings_guard_moderation'), client.rpc('shops_zz_rereview_stamp'),
      client.rpc('set_config', { setting_name: 'washlink.job_opening_moderation_write', new_value: q1?.case_id, is_local: false }),
      client.rpc('set_config', { setting_name: 'washlink.shop_rereview', new_value: shopB, is_local: false })])
    internal.push(...results.map((result) => result.error?.code ?? 'callable'))
  }
  check('internal_functions_and_set_config_not_callable', internal.every((c) => c !== 'callable'), internal.join(','))
  const anonRpc = await Promise.all(['my_job_opening_reports', 'owner_job_opening_moderation', 'admin_job_opening_moderation_queue', 'admin_unreviewed_approved_shops', 'admin_moderation_summary', 'admin_oversight_access_flags'].map((fn) => anon.rpc(fn)))
  check('anon_cannot_call_w14_rpcs', anonRpc.every((result) => result.error), anonRpc.map((result) => result.error?.code).join(','))
  const summary = await one(sa.rpc('admin_moderation_summary'))
  check('admin_summary_for_super_admin_only', summary !== undefined && (await rows(ownerA.client.rpc('admin_moderation_summary'))).length === 0 && (await rows(worker.client.rpc('admin_moderation_summary'))).length === 0, JSON.stringify(summary ?? null))
  // Notifications carry fixed text only, never statements, messages or notes.
  const notes = await Promise.all([worker, worker2, ownerA, ownerB].map((who) => rows(who.client.from('notifications').select('category, title, body')
    .or('category.like.job_opening_moderation%,category.like.job_opening_report%,category.like.shop_verification%'))))
  check('moderation_notifications_have_no_free_text', notes[2].length >= 3 && notes[0].length >= 1 && notes.flat().every((n) => !`${n.title} ${n.body}`.match(new RegExp(`${MARK}|age limit|edited`, 'i'))),
    notes.map((list) => list.map((n) => n.category).join('|')).join(' ; '))
  // Worker accounts removed through GoTrue: their reports cascade.
  const reportsOf = (id) => Number(trustedFixture('select count(*) from public.job_opening_reports where reporter_id = $1', id))
  const beforeDelete = reportsOf(worker.id) + reportsOf(worker2.id)
  const deleted = [await deleteUserChecked('worker_with_reports_through_gotrue', worker.id), await deleteUserChecked('worker2_with_report_through_gotrue', worker2.id)]
  check('worker_delete_cascades_reports', deleted.every(Boolean) && beforeDelete >= 2 && reportsOf(worker.id) + reportsOf(worker2.id) === 0, `${beforeDelete} before`)
}
try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  const remaining = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  check('no_smoke14_users_left', !(remaining.data?.users ?? []).some((user) => user.email?.startsWith('smoke14-')))
}
console.log(`w14-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
