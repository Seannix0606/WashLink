#!/usr/bin/env node
// W12 local-only API smoke test: notification registry and scheduler state locked from clients, internal runner / batch functions
// not callable, admin scheduled-job read, inbox keyset paging (frontend F2) over real rows, mark-read limits, no free text in notices.
//
//   node scripts/supabase-test/w12-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w14: ONLY the local stack of the staged `.local-supabase-test` workdir; keys come from `supabase status` in memory,
// never printed or written; refuses any non-loopback URL; reads no .env; synthetic smoke12-*@local.test users deleted at the end (asserted).
// Registers NO cron job. TEST-ONLY via `docker exec supabase_db_<project_id> psql` (uuid values only): enqueue_notification for paging rows
// (one statement batch = one transaction = equal created_at, so the id tie-break is exercised) and the runner inside begin ... rollback.
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

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('w12-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w12-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w12-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
function trustedSql(sql, id) {
  if (id !== undefined && !new RegExp(`^${UUID.source}$`).test(id)) throw new Error('trusted sql: unsafe value')
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', id === undefined ? sql : sql.replaceAll('$1', `'${id}'`)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted sql failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim().split(/\r?\n/).filter((line) => !/^(BEGIN|ROLLBACK)$/.test(line)).pop()
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const [admin, anon] = [newClient(serviceKey), newClient(anonKey)]
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const MARK = 'ZEBRAFINCH'

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
  const email = `smoke12-${label}-${runId}@local.test`
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

async function deleteUserChecked(label, id) {
  const { error } = await admin.auth.admin.deleteUser(id)
  check(`delete_user_${label}`, !error, error?.message)
  if (!error && createdUserIds.includes(id)) createdUserIds.splice(createdUserIds.indexOf(id), 1)
  return !error
}

const rows = async (query) => (await query).data ?? []
const NIL = '00000000-0000-4000-8000-000000000000'
const TABLES = ['notification_categories', 'workforce_scheduled_jobs']
// Same query shape as SupabaseNotificationRepository.listMyNotifications (frontend F2).
const COLUMNS = 'id, category, title, body, read_at, created_at'
const keyset = (before) => `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`
const page = (client, limit, { before = null, unreadOnly = false } = {}) => {
  let query = client.from('notifications').select(COLUMNS).order('created_at', { ascending: false }).order('id', { ascending: false })
  if (unreadOnly) query = query.is('read_at', null)
  if (before) query = query.or(keyset(before))
  return rows(query.limit(limit))
}
const idsOf = (list) => list.map((n) => n.id)

async function main() {
  const superAdmin = await signUp('admin', 'customer')
  const [worker, owner, other] = [await signUp('worker', 'worker'), await signUp('owner', 'owner'), await signUp('other', 'customer')]
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  check('setup_super_admin_promoted', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)
  const profile = await worker.client.from('worker_profiles').insert({ profile_id: worker.id, headline: 'Smoke washer', availability_status: 'flexible' })
  if (profile.error) throw new Error(`worker profile failed: ${profile.error.message}`)
  const sa = superAdmin.client
  // 1. Registry and job state: no client access of any kind, including service_role and super_admin.
  const stamp = new Date().toISOString()
  for (const table of TABLES) {
    const attempts = []
    for (const client of [owner.client, worker.client, other.client, admin, sa, anon]) {
      attempts.push(await client.from(table).insert({ created_at: stamp }), await client.from(table).update({ updated_at: stamp }).not('created_at', 'is', null),
        await client.from(table).delete().not('created_at', 'is', null))
    }
    const reads = await Promise.all([owner.client, worker.client, sa, admin, anon].map((client) => client.from(table).select('*')))
    check(`direct_writes_and_selects_denied_${table}`, attempts.every((a) => a.error && a.status >= 400 && !a.data?.length) && reads.every((r) => (r.data ?? []).length === 0),
      attempts.map((a) => a.error?.code).join(','))
  }
  // 2. Date-free runner, batch, lock and raw W7 / W9 / W10 functions: callable by no client role.
  const internal = []
  for (const client of [owner.client, worker.client, sa, admin, anon]) {
    const results = await Promise.all([client.rpc('run_workforce_scheduled_job', { p_job: 'worker_contract_expiry' }), client.rpc('workforce_scheduled_job_pending', { p_job: 'worker_contract_expiry' }),
      client.rpc('expire_worker_contracts_batch', { p_after_contract: null, p_limit: 5 }), client.rpc('refresh_worker_owner_relationships_batch', { p_after_worker: null, p_after_owner: null, p_limit: 5 }),
      client.rpc('worker_owner_pair_try_lock', { p_worker: worker.id, p_owner: owner.id }), client.rpc('expire_worker_contracts', { p_as_of: '2099-01-01' }),
      client.rpc('enqueue_certification_expiry_notices', { p_as_of: '2099-01-01T00:00:00Z' }), client.rpc('refresh_worker_owner_relationships', { p_as_of: '2099-01-01' }),
      client.rpc('enqueue_notification', { p_recipient_id: worker.id, p_category: 'roster.linked', p_title: 'x', p_body: 'x', p_idempotency_key: `roster_link:${NIL}` }),
      client.rpc('set_config', { setting_name: 'washlink.scheduled_job', new_value: 'x', is_local: false }),
      client.rpc('set_config', { setting_name: 'washlink.scheduled_job_state_write', new_value: 'worker_contract_expiry', is_local: false })])
    internal.push(...results.map((result) => result.error?.code ?? 'callable'))
  }
  check('runner_batches_raw_jobs_and_set_config_not_callable', internal.length === 55 && internal.every((c) => c !== 'callable'), internal.join(','))
  const ranCount = trustedSql('select count(*) from public.workforce_scheduled_jobs where run_count > 0')
  check('no_job_ran_through_the_api', ranCount === '0', ranCount)
  // 3. admin_workforce_scheduled_jobs: 3 rows for super_admin, 0 for other signed-in users, 42501 for anon / service_role.
  const adminJobs = await sa.rpc('admin_workforce_scheduled_jobs')
  const others = await Promise.all([owner.client, worker.client, other.client].map((client) => client.rpc('admin_workforce_scheduled_jobs')))
  const [anonJobs, serviceJobs] = [await anon.rpc('admin_workforce_scheduled_jobs'), await admin.rpc('admin_workforce_scheduled_jobs')]
  check('admin_scheduled_jobs_3_rows_for_super_admin_only', (adminJobs.data ?? []).length === 3 && others.every((r) => !r.error && (r.data ?? []).length === 0)
    && anonJobs.error?.code === '42501' && serviceJobs.error?.code === '42501', `${adminJobs.error?.message} ${anonJobs.error?.code} ${serviceJobs.error?.code}`)
  check('admin_scheduled_jobs_no_ids_or_names', (adminJobs.data ?? []).every((row) => !Object.keys(row).some((k) => /(^|_)id$/.test(k)) && !UUID.test(JSON.stringify(row))
    && row.enabled === true && row.run_count === 0), Object.keys(adminJobs.data?.[0] ?? {}).join(','))
  // 4. Representative events: exactly one notice to the right party, with fixed text only.
  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: `Smoke W12 Wash ${runId}`, address: '12 Test Street' }).select('id').single()
  const approved = await sa.from('shops').update({ verification_status: 'approved' }).eq('id', shop.data?.id)
  const draft = await owner.client.from('job_openings').insert({ shop_id: shop.data?.id, title: `Smoke W12 opening ${runId}`, description: 'Wash cars', work_location: 'Smoke W12',
    openings_count: 1, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single()
  const published = await owner.client.rpc('transition_job_opening', { p_job_opening_id: draft.data?.id, p_from_status: 'draft', p_to_status: 'published' })
  const before = await rows(owner.client.from('notifications').select('category').like('category', 'job_application%'))
  const applied = await worker.client.rpc('create_job_application', { p_job_opening_id: draft.data?.id, p_cover_note: `Smoke ${MARK} private cover note 0917 123 4567 a@b.test`, p_submit: true, p_notice_version: 'w5_v1' }).single()
  const [ownerNotes, workerNotes, otherNotes] = await Promise.all([owner, worker, other].map((who) => rows(who.client.from('notifications').select('category, title, body').like('category', 'job_application%'))))
  check('application_creates_exactly_one_owner_notice_without_free_text', !shop.error && !approved.error && !published.error && !applied.error && before.length === 0
    && ownerNotes.length === 1 && ownerNotes[0].category === 'job_application.submitted' && workerNotes.length === 0 && otherNotes.length === 0
    && !JSON.stringify(ownerNotes).match(new RegExp(`${MARK}|0917|a@b\\.test|private`, 'i')), `${shop.error?.message} ${published.error?.message} ${applied.error?.message} ${ownerNotes.length}`)
  const verification = await rows(owner.client.from('notifications').select('category, title, body').eq('category', 'shop_verification.status_changed'))
  check('shop_verification_creates_exactly_one_owner_notice', verification.length === 1 && !JSON.stringify(verification).match(new RegExp(`${MARK}|@`, 'i')), String(verification.length))
  const delivered = await rows(owner.client.from('notifications').select('category'))
  const categories = new Set((trustedSql("select string_agg(category, ',') from public.notification_categories") ?? '').split(','))
  check('every_delivered_category_is_registered', delivered.length > 0 && delivered.every((n) => categories.has(n.category)), delivered.map((n) => n.category).join(','))
  // 5. Keyset paging over real rows: 12 notices, two statement batches (6 rows share one created_at, so the id tie-break matters); unread filter.
  const seed = Array.from({ length: 6 }, () => "select public.enqueue_notification($1::uuid, 'roster.linked', 'Roster entry linked', 'A roster entry was linked to your account.', 'roster_link:' || gen_random_uuid()::text, 'roster_entry', gen_random_uuid());").join(' ')
  trustedSql(seed, worker.id)
  trustedSql(seed, worker.id)
  const full = await page(worker.client, 100)
  const sameStamp = full.filter((n) => full.filter((m) => m.created_at === n.created_at).length > 1)
  const walked = []
  let cursor = null
  for (let guard = 0; guard < 20; guard += 1) {
    const next = await page(worker.client, 5, { before: cursor })
    if (next.length === 0) break
    walked.push(...next)
    cursor = next[next.length - 1]
  }
  check('keyset_paging_walks_every_row_once_in_order', full.length >= 12 && sameStamp.length >= 6 && walked.length === full.length && new Set(idsOf(walked)).size === full.length
    && walked.every((n, index) => n.id === full[index].id), `${full.length} full / ${walked.length} walked / ${sameStamp.length} same-time`)
  const ordered = full.every((n, i) => i === 0 || n.created_at < full[i - 1].created_at || (n.created_at === full[i - 1].created_at && n.id < full[i - 1].id))
  const firstTwo = await page(worker.client, 2)
  const marked = await worker.client.rpc('mark_notifications_read', { p_notification_ids: idsOf(firstTwo) })
  const unread = await page(worker.client, 100, { unreadOnly: true })
  const unreadPaged = await page(worker.client, 3, { unreadOnly: true })
  unreadPaged.push(...(await page(worker.client, 100, { unreadOnly: true, before: unreadPaged[2] })))
  check('unread_filter_and_paging_match', ordered && marked.data === 2 && unread.length === full.length - 2 && unread.every((n) => n.read_at === null)
    && !unread.some((n) => idsOf(firstTwo).includes(n.id)) && idsOf(unreadPaged).join() === idsOf(unread).join(), `${marked.data} / ${unread.length} of ${full.length}`)
  // 6. mark_notifications_read limits: 200 ids max, anon refused, foreign and unknown ids ignored, repeat changes nothing, no other edits.
  const tooMany = await worker.client.rpc('mark_notifications_read', { p_notification_ids: Array.from({ length: 201 }, () => NIL) })
  const foreign = await worker.client.rpc('mark_notifications_read', { p_notification_ids: [...idsOf(await rows(owner.client.from('notifications').select('id'))), NIL] })
  const anonMark = await anon.rpc('mark_notifications_read', { p_notification_ids: null })
  const repeat = await worker.client.rpc('mark_notifications_read', { p_notification_ids: idsOf(firstTwo) })
  const ownerUnread = await rows(owner.client.from('notifications').select('id').is('read_at', null))
  const edit = await worker.client.from('notifications').update({ title: 'edited' }).eq('id', full[0].id).select('id')
  const unreadAgain = await worker.client.from('notifications').update({ read_at: null }).eq('id', firstTwo[0].id).select('id')
  check('mark_read_limits_and_recipient_only', tooMany.error?.code === '22023' && foreign.data === 0 && ownerUnread.length >= 2 && Boolean(anonMark.error) && repeat.data === 0
    && (edit.data ?? []).length === 0 && (unreadAgain.data ?? []).length === 0, `${tooMany.error?.code} ${foreign.data} ${repeat.data}`)
  const all = await worker.client.rpc('mark_notifications_read', { p_notification_ids: null })
  check('mark_all_read_then_none_unread', all.data === unread.length && (await page(worker.client, 5, { unreadOnly: true })).length === 0, `${all.data}`)
  // 7. TEST-ONLY runner call (trusted psql, rolled back): a trusted session may run one job; clients never could. No cron is registered.
  const outcome = trustedSql("begin; select public.run_workforce_scheduled_job('owner_relationship_refresh')->>'outcome'; rollback;")
  check('trusted_session_runs_job_in_rolled_back_transaction', outcome === 'completed', outcome)
  const after = await rows(sa.rpc('admin_workforce_scheduled_jobs'))
  check('rolled_back_run_left_no_job_state_and_no_pg_cron', after.length === 3 && after.every((row) => row.run_count === 0) && trustedSql("select count(*) from pg_extension where extname = 'pg_cron'") === '0')
  const realtime = trustedSql("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('notifications', 'notification_categories', 'workforce_scheduled_jobs')")
  check('notification_tables_not_in_realtime', realtime === '0', realtime)
}
try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
  const remaining = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  check('no_smoke12_users_left', !(remaining.data?.users ?? []).some((user) => user.email?.startsWith('smoke12-')))
}
console.log(`w12-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
