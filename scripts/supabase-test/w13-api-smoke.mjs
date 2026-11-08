#!/usr/bin/env node
// W13 local-only API smoke test: super_admin audit reads only through the audited RPC (D-70), the keyset-paged moderation queue (D-71)
// and the contract expiry notice wording through the real scheduled-job runner (D-72).
//
//   node scripts/supabase-test/w13-api-smoke.mjs      (after run-db-tests.mjs left the stack running; run-api-smokes.mjs runs it last)
//
// Same safety rules as w2..w14 and w12: ONLY the local stack of the staged `.local-supabase-test` workdir; keys come from `supabase status` in
// memory, never printed or written; refuses any non-loopback URL; reads no .env; synthetic smoke13-*@local.test users deleted at the end
// (asserted). Registers NO cron job. TEST-ONLY via `docker exec supabase_db_<project_id> psql` (uuid values only): a 3-day backdate of one
// smoke contract (the W6 / W12 time-shift technique) and two trusted calls of run_workforce_scheduled_job, as pg_cron would make them.
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
    console.error('w13-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w13-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w13-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// TEST-ONLY trusted SQL in the LOCAL db container; the only interpolated value is a validated uuid.
function trustedSql(sql, id) {
  if (id !== undefined && !UUID.test(id)) throw new Error('trusted sql: unsafe value')
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', id === undefined ? sql : sql.replaceAll('$1', `'${id}'`)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted sql failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim().split(/\r?\n/).filter((line) => !/^(BEGIN|COMMIT|ROLLBACK|SET)$/.test(line)).pop()
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const [admin, anon] = [newClient(serviceKey), newClient(anonKey)]
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const manilaToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const WORKER_EXPIRY = (shop) => `Your contract with ${shop} reached the end date written in it, so WashLink now shows it as expired. `
  + 'What this means for your work depends on the contract terms and the law.'
const OWNER_EXPIRY = 'A contract reached the end date written in it, so WashLink now shows it as expired. '
  + 'What this means for you and the worker depends on the contract terms and the law.'

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
  const email = `smoke13-${label}-${runId}@local.test`
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { role, full_name: `Smoke ${label} Wombat` } }),
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

const rows = async (query) => (await query).data ?? []
const fail = (step, result) => { if (result?.error) throw new Error(`${step} failed: ${result.error.message}`); return result }
const runExpiryJob = () => JSON.parse(trustedSql("select public.run_workforce_scheduled_job('worker_contract_expiry')::text") ?? '{}')
const expiryNotes = (who, contractId) => rows(who.client.from('notifications').select('title, body, category, subject_id').eq('subject_id', contractId).eq('title', 'Contract expired'))

async function main() {
  const superAdmin = await signUp('admin', 'customer')
  const [owner, worker, customer] = [await signUp('owner', 'owner'), await signUp('worker', 'worker'), await signUp('customer', 'customer')]
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  check('setup_super_admin_promoted', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)
  fail('worker profile', await worker.client.from('worker_profiles').insert({ profile_id: worker.id, headline: 'Smoke washer', availability_status: 'flexible' }))
  const sa = superAdmin.client
  const shopName = `Smoke W13 Wash ${runId}`
  const shop = fail('shop', await owner.client.from('shops').insert({ owner_id: owner.id, name: shopName, address: '13 Test Street' }).select('id').single())
  const shopId = shop.data.id
  fail('approve', await sa.from('shops').update({ verification_status: 'approved' }).eq('id', shopId))

  // 1. D-70: the raw audit table returns 0 rows to every client role; the review-log view is denied; the audited RPC reads and logs.
  const raw = await Promise.all([sa, owner.client, worker.client].map((client) => client.from('workforce_audit_events').select('id').eq('subject_id', shopId)))
  check('raw_audit_select_returns_zero_rows_for_super_admin_owner_worker', raw.every((r) => !r.error && r.data?.length === 0), raw.map((r) => r.error?.code ?? r.data?.length).join(','))
  const views = await Promise.all([sa, owner.client, worker.client, customer.client, admin, anon].map((client) => client.from('shop_verification_review_log').select('event_id').limit(1)))
  check('review_log_view_denied_42501', views.every((r) => r.error?.code === '42501' && !r.data?.length), views.map((r) => r.error?.code ?? 'rows').join(','))
  const searchCount = () => Number(trustedSql("select count(*) from public.workforce_audit_events where action = 'workforce_audit.log_searched'"))
  const searchesBefore = searchCount()
  const logged = await adminAuditRows(sa, { subjectId: shopId })
  const lastSearch = trustedSql("select (actor_id::text = $1)::text || ',' || (payload ->> 'result_count') from public.workforce_audit_events where action = 'workforce_audit.log_searched' order by id desc limit 1", superAdmin.id)
  const denied = await Promise.all([owner.client, worker.client, anon, admin].map((client) => client.rpc('admin_workforce_audit_log', { p_limit: 5 })))
  check('admin_audit_log_returns_rows_and_logs_search', !logged.error && logged.data?.some((r) => r.action === 'shop.verification_decided' && r.actor_id === superAdmin.id)
    && searchCount() === searchesBefore + 1 && lastSearch === `true,${logged.data?.length}` && denied.every((r) => r.error?.code === '42501'),
  `${logged.error?.message ?? logged.data?.length} / ${searchesBefore} / ${lastSearch} / ${denied.map((r) => r.error?.code).join(',')}`)

  // 2. D-71: three reported openings walked two per page with the keyset cursor; total count; super_admin only.
  const caseIds = []
  for (const n of [1, 2, 3]) {
    const opening = fail('opening', await owner.client.from('job_openings').insert({ shop_id: shopId, title: `Smoke W13 opening ${n} ${runId}`, description: 'Wash cars',
      work_location: 'Smoke W13', openings_count: 1, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single())
    fail('publish', await owner.client.rpc('transition_job_opening', { p_job_opening_id: opening.data.id, p_from_status: 'draft', p_to_status: 'published' }))
    const report = fail('report', await worker.client.rpc('report_job_opening', { p_job_opening_id: opening.data.id, p_category: 'age_requirement',
      p_statement: 'This smoke posting asks for an age limit for applicants.' }).single())
    caseIds.push(trustedSql('select case_id::text from public.job_opening_reports where id = $1', report.data.report_id))
  }
  const pages = []
  let cursor = { p_after_opened_at: null, p_after_id: null }
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await sa.rpc('admin_job_opening_moderation_queue_page', { p_status: 'active', ...cursor, p_limit: 2 })
    if (page.error) throw new Error(`queue page failed: ${page.error.message}`)
    pages.push(page.data)
    if (page.data.length === 0) break
    const last = page.data[page.data.length - 1]
    cursor = { p_after_opened_at: last.opened_at, p_after_id: last.case_id }
  }
  const walked = pages.flat()
  const mine = walked.filter((row) => caseIds.includes(row.case_id)).map((row) => row.case_id)
  check('queue_page_walks_three_cases_two_per_page', pages.slice(0, -1).every((p) => p.length === 2 || p === pages.at(-2)) && pages.at(-1).length === 0
    && mine.join() === caseIds.join() && new Set(walked.map((r) => r.case_id)).size === walked.length
    && walked.every((r, i) => i === 0 || r.opened_at > walked[i - 1].opened_at || (r.opened_at === walked[i - 1].opened_at && r.case_id > walked[i - 1].case_id)),
  pages.map((p) => p.length).join('+'))
  const old = await rows(sa.rpc('admin_job_opening_moderation_queue', { p_status: 'active' }))
  check('queue_page_total_count', walked.length >= 3 && walked.every((r) => r.total_count === walked.length) && old.length === walked.length
    && walked.every((r) => !Object.keys(r).some((k) => /statement|reporter|note|message/.test(k))), `${walked.length} rows / ${walked.map((r) => r.total_count).join(',')}`)
  const outsiders = await Promise.all([owner.client, worker.client, customer.client].map((client) => client.rpc('admin_job_opening_moderation_queue_page', { p_limit: 2 })))
  check('queue_page_zero_rows_for_owner_and_worker', outsiders.every((r) => !r.error && r.data?.length === 0), outsiders.map((r) => r.error?.code ?? r.data?.length).join(','))
  const closed = await Promise.all([anon, admin].map((client) => client.rpc('admin_job_opening_moderation_queue_page', { p_limit: 2 })))
  const invalid = await Promise.all([{ p_limit: 0 }, { p_limit: 101 }, { p_after_id: caseIds[0] }].map((args) => sa.rpc('admin_job_opening_moderation_queue_page', args)))
  check('queue_page_denied_for_anon_and_service_role', closed.every((r) => r.error?.code === '42501') && invalid.every((r) => r.error?.code === '22023'),
    [...closed, ...invalid].map((r) => r.error?.code).join(','))

  // 3. D-72: a real contract (RPCs only) past its end date through the trusted runner twice: one notice per party, record wording.
  const created = fail('template', await owner.client.rpc('create_owner_contract_template', { p_name: `Smoke W13 agreement ${runId}`, p_from_version_id: null }).single())
  const templateVersionId = (await rows(owner.client.rpc('owner_contract_templates'))).find((row) => row.template_id === created.data.id)?.current_version_id
  const opening = fail('opening', await owner.client.from('job_openings').insert({ shop_id: shopId, title: `Smoke W13 contract opening ${runId}`, description: 'Wash cars',
    work_location: 'Smoke W13', openings_count: 1, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single())
  fail('publish', await owner.client.rpc('transition_job_opening', { p_job_opening_id: opening.data.id, p_from_status: 'draft', p_to_status: 'published' }))
  const applied = fail('apply', await worker.client.rpc('create_job_application', { p_job_opening_id: opening.data.id, p_cover_note: null, p_submit: true, p_notice_version: 'w5_v1' }).single())
  for (const [from, to] of [['submitted', 'under_review'], ['under_review', 'accepted']]) {
    fail('application', await owner.client.rpc('transition_job_application', { p_application_id: applied.data.id, p_from_status: from, p_to_status: to }))
  }
  const platform = (await rows(owner.client.rpc('platform_contract_template_current')))[0]
  const standard = await rows(owner.client.rpc('contract_template_version_clauses', { p_version_id: platform?.version_id }))
  const bodies = Object.fromEntries(standard.filter((c) => c.kind === 'editable').map((c) => [c.clause_key, 'The shop and the worker agree to this smoke clause.']))
  bodies.pay_terms = 'We pay {{pay_details}} each Friday.'
  const draft = fail('draft', await owner.client.rpc('create_worker_contract_draft', { p_shop_id: shopId, p_worker_id: worker.id, p_template_version_id: templateVersionId,
    p_classification_key: 'employee', p_start_date: manilaToday }).single())
  const contractId = draft.data.id
  fail('save', await owner.client.rpc('save_worker_contract_draft', { p_contract_id: contractId, p_expected_draft_revision: 1, p_classification_key: 'employee',
    p_start_date: manilaToday, p_end_date: manilaToday, p_owner_values: { role_title: 'Car wash attendant', schedule_summary: 'Weekdays from morning to afternoon',
      pay_details: 'Daily pay as agreed in writing' }, p_editable_bodies: bodies, p_shop_terms: [] }).single())
  const sent = fail('send', await owner.client.rpc('send_worker_contract_version', { p_contract_id: contractId, p_expected_draft_revision: 2,
    p_acknowledgement_key: 'w9_owner_send_v1', p_contractor_acknowledgement_key: null, p_acknowledged_flag_count: 0 }).single())
  fail('accept', await worker.client.rpc('accept_worker_contract_version', { p_contract_id: contractId, p_version_id: sent.data.id, p_content_hash: sent.data.content_hash,
    p_acknowledgement_key: 'w9_worker_accept_v1', p_contractor_acknowledgement_key: null }).single())
  const revision = (await rows(owner.client.rpc('owner_worker_contracts'))).find((row) => row.contract_id === contractId)?.revision
  fail('activate', await owner.client.rpc('activate_worker_contract', { p_contract_id: contractId, p_expected_revision: revision }).single())
  // TEST-ONLY time shift: the W9 guard refuses this for every session, so skip triggers for the one statement (as test_helpers.backdate_test_worker_contract).
  trustedSql('begin; set local session_replication_role = replica; update public.worker_contracts set start_date = start_date - 3, end_date = end_date - 3 where id = $1; commit;', contractId)
  const firstRun = runExpiryJob()
  const status = (await rows(owner.client.rpc('owner_worker_contracts'))).find((row) => row.contract_id === contractId)?.status
  const [workerNotes, ownerNotes] = [await expiryNotes(worker, contractId), await expiryNotes(owner, contractId)]
  check('contract_expiry_runner_one_notice_per_party_with_record_wording', firstRun.outcome === 'completed' && firstRun.processed >= 1 && status === 'expired'
    && workerNotes.length === 1 && workerNotes[0].body === WORKER_EXPIRY(shopName) && workerNotes[0].category === 'worker_contract'
    && ownerNotes.length === 1 && ownerNotes[0].body === OWNER_EXPIRY, `${JSON.stringify(firstRun)} / ${status} / ${workerNotes.length},${ownerNotes.length}`)
  const allNotes = [...await rows(worker.client.from('notifications').select('body')), ...await rows(owner.client.from('notifications').select('body'))]
  const hasExpired = trustedSql("select count(*) from public.notifications where category = 'worker_contract' and created_at > now() - interval '1 hour' and body ilike '%has expired%'")
  check('no_notice_body_says_has_expired', allNotes.length > 0 && allNotes.every((n) => !/has expired/i.test(n.body)) && hasExpired === '0', hasExpired)
  const secondRun = runExpiryJob()
  const [workerAgain, ownerAgain] = [await expiryNotes(worker, contractId), await expiryNotes(owner, contractId)]
  check('second_runner_call_creates_nothing', secondRun.outcome === 'completed' && secondRun.processed === 0 && workerAgain.length === 1 && ownerAgain.length === 1,
    `${JSON.stringify(secondRun)} / ${workerAgain.length},${ownerAgain.length}`)

  // 4. set_config is not exposed to any client role.
  const setConfig = await Promise.all([owner.client, sa, admin, anon].map((client) => client.rpc('set_config', { setting_name: 'washlink.worker_contract_write', new_value: contractId, is_local: false })))
  check('set_config_not_exposed', setConfig.every((r) => Boolean(r.error) && r.data === null), setConfig.map((r) => r.error?.code).join(','))

  for (const [label, who] of [['worker', worker], ['owner', owner], ['customer', customer], ['super_admin', superAdmin]]) await deleteUserChecked(label, who.id)
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  const remaining = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  check('no_smoke13_users_left', !(remaining.data?.users ?? []).some((user) => user.email?.startsWith('smoke13-')))
}
console.log(`w13-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
