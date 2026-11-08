#!/usr/bin/env node
// W8 local-only API smoke test: contract templates and template versions through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w8-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w7-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
// `.local-supabase-test` workdir. API URL and keys come from `npx supabase status -o env --workdir
// .local-supabase-test` and are held in memory: never printed, never written. Refuses any non-loopback API
// URL. Reads no .env. Users are synthetic (smoke8-*@local.test, random suffix) and deleted at the end
// (asserted). No time shift and no trusted write: every write goes through the real W8 RPCs; one trusted READ
// (docker exec psql into the staged local DB container) confirms the cascade after the owner deleteUser.
// Note: the super_admin publishes a new platform (standard) version, which stays on the local stack (as any
// platform version would); the next run-db-tests.mjs reset removes it.

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
    console.error('w8-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w8-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w8-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

// Trusted local read (docker exec psql into the staged local DB container); only validated uuids are interpolated.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function trustedCount(sql, value) {
  if (!UUID.test(value ?? '')) throw new Error('trusted read: unsafe value')
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-c', sql.replaceAll('$1', `'${value}'`)], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted read failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim()
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const admin = newClient(serviceKey)
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
// Platform text may hold no digits: a letters-only run tag keeps each published standard version distinct.
const letterTag = runId.replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)])
const createdUserIds = []
const TABLES = ['contract_templates', 'contract_template_versions', 'contract_template_clauses']
const NOTICE = 'Draft — requires review by a qualified Philippine labor-law professional'

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
  const email = `smoke8-${label}-${runId}@local.test`
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

const denied = (error) => error?.code === '42501'
const rows = async (query) => (await query).data ?? []
async function readsNothing(client) {
  for (const table of TABLES) {
    const read = await client.from(table).select('id')
    if (!read.error && read.data?.length !== 0) return `${table}: ${read.data?.length} rows`
  }
  return ''
}

async function main() {
  const owner = await signUp('owner', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const worker = await signUp('worker', 'worker')
  const customer = await signUp('customer', 'customer')
  const superAdmin = await signUp('admin', 'customer')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  check('super_admin_ready', promote.data?.role === 'super_admin', promote.error?.message)

  for (const [label, client] of [['anon', newClient(anonKey)], ['worker', worker.client], ['customer', customer.client]]) {
    const leak = await readsNothing(client)
    check(`${label}_reads_no_contract_template_rows_platform_included`, leak === '', leak)
  }
  const platform = (await rows(owner.client.rpc('platform_contract_template_current')))[0]
  const platformRows = await rows(owner.client.from('contract_templates').select('id, scope, status').eq('scope', 'platform'))
  const platformHistory = await rows(owner.client.rpc('contract_template_version_history', { p_template_id: platform?.template_id }))
  check('owner_reads_platform_standard_v1', platformRows.length === 1 && platformRows[0].status === 'active' && platform?.version_number >= 1
    && platformHistory.some((row) => row.version_number === 1), JSON.stringify(platform ?? null))

  const ownerInsert = await owner.client.from('contract_templates').insert({ scope: 'owner', owner_id: owner.id, name: 'Direct insert' }).select('id')
  const workerInsert = await worker.client.from('contract_template_clauses').insert({ heading: 'Forged', body: 'Forged' }).select('id')
  const serviceInsert = await admin.from('contract_template_versions').insert({ template_id: platform?.template_id }).select('id')
  check('direct_inserts_denied_for_owner_worker_and_service_role', denied(ownerInsert.error) && denied(workerInsert.error) && denied(serviceInsert.error),
    [ownerInsert.error?.code, workerInsert.error?.code, serviceInsert.error?.code].join(','))

  const created = await owner.client.rpc('create_owner_contract_template', { p_name: 'Smoke crew agreement', p_from_version_id: null }).single()
  const templateId = created.data?.id
  check('owner_creates_template_from_standard', created.data?.scope === 'owner' && created.data?.current_version_number === 1
    && created.data?.status === 'active', created.error?.message)
  const history1 = await rows(owner.client.rpc('contract_template_version_history', { p_template_id: templateId }))
  const v1 = history1[0]
  const v1Clauses = await rows(owner.client.rpc('contract_template_version_clauses', { p_version_id: v1?.version_id }))

  const save = (expected, bodies, terms, base = platform?.version_id) => owner.client.rpc('save_owner_contract_template_version', {
    p_template_id: templateId, p_expected_version_number: expected, p_base_platform_version_id: base, p_editable_bodies: bodies, p_shop_terms: terms,
  }).single()
  const term = { section_number: 15, heading: 'Uniform', body: 'The shop lends a uniform to the worker for each shift.' }
  const v2 = await save(1, { pay_terms: 'We pay {{pay_details}} at the end of each week.' }, [term])
  const v1After = await rows(owner.client.rpc('contract_template_version_clauses', { p_version_id: v1?.version_id }))
  check('save_v2_with_edit_and_section_15_term_keeps_v1', v2.data?.version_number === 2 && v2.data?.edited_count === 1 && v2.data?.added_count === 1
    && /^[0-9a-f]{64}$/.test(v2.data?.content_hash ?? '') && v2.data?.content_hash !== v1?.content_hash
    && JSON.stringify(v1After) === JSON.stringify(v1Clauses) && v1Clauses.length > 0, v2.error?.message)

  const locked = await save(2, { template_is_draft: 'This template is final.' }, [])
  check('locked_safeguard_edit_refused_23514', locked.error?.code === '23514'
    && locked.error?.message === 'This clause is a WashLink safeguard and cannot be changed.', locked.error?.message)
  const placeholder = await save(2, { pay_terms: 'We pay {{salary}} each week.' }, [])
  check('unknown_placeholder_refused_23514', placeholder.error?.code === '23514' && placeholder.error?.message === 'Unknown placeholder {{salary}}.',
    placeholder.error?.message)
  const section4 = await save(2, {}, [{ section_number: 4, heading: 'Contractor', body: 'The worker is an independent contractor.' }])
  check('section_4_shop_term_refused_23514', section4.error?.code === '23514'
    && section4.error?.message === 'Shop-specific terms are not allowed in this section.', section4.error?.message)
  const stale = await save(1, { schedule: 'Mornings only.' }, [])
  check('stale_save_returns_55000', stale.error?.code === '55000', stale.error?.code ?? 'no error')

  for (const [label, client] of [['other_owner', otherOwner.client], ['super_admin', superAdmin.client]]) {
    const raw = await rows(client.from('contract_templates').select('id').eq('id', templateId))
    const viaRpc = await rows(client.rpc('contract_template_version_clauses', { p_version_id: v2.data?.id }))
    const takeOver = await client.rpc('rename_owner_contract_template', { p_template_id: templateId, p_name: 'Taken over' })
    check(`${label}_reads_nothing_of_owner_template`, raw.length === 0 && viaRpc.length === 0 && denied(takeOver.error),
      `${raw.length},${viaRpc.length},${takeOver.error?.code}`)
  }

  const standard = await rows(superAdmin.client.rpc('contract_template_version_clauses', { p_version_id: platform?.version_id }))
  const input = standard.map((clause) => ({ section_number: clause.section_number, clause_key: clause.clause_key, kind: clause.kind,
    heading: clause.heading, requires_owner_input: clause.requires_owner_input,
    body: clause.clause_key === 'attachments_list' ? `[Shop: list each attachment by its title (${letterTag}), or write "None".]` : clause.body }))
  const ownerPublish = await owner.client.rpc('publish_platform_contract_template_version', { p_expected_version_number: platform?.version_number, p_clauses: input })
  check('owner_publish_denied', denied(ownerPublish.error), ownerPublish.error?.code ?? 'no error')
  const published = await superAdmin.client.rpc('publish_platform_contract_template_version',
    { p_expected_version_number: platform?.version_number, p_clauses: input }).single()
  check('super_admin_publishes_platform_version', published.data?.version_number === platform?.version_number + 1
    && published.data?.saved_by_role === 'super_admin' && published.data?.review_status === 'draft_requires_legal_review', published.error?.message)

  const listed = (await rows(owner.client.rpc('owner_contract_templates'))).find((row) => row.template_id === templateId)
  const rebased = await save(2, {}, [term], published.data?.id)
  const rebasedClauses = await rows(owner.client.rpc('contract_template_version_clauses', { p_version_id: rebased.data?.id }))
  const payTerms = rebasedClauses.find((clause) => clause.clause_key === 'pay_terms')
  const attachments = rebasedClauses.find((clause) => clause.clause_key === 'attachments_list')
  check('owner_sees_newer_standard_and_rebases_keeping_edits', listed?.newer_standard_available === true && rebased.data?.version_number === 3
    && rebased.data?.base_platform_version_id === published.data?.id && payTerms?.body === 'We pay {{pay_details}} at the end of each week.'
    && attachments?.body.includes('by its title'), rebased.error?.message ?? JSON.stringify(listed ?? null))

  const preview = await rows(owner.client.rpc('preview_contract_template_version', { p_version_id: rebased.data?.id }))
  const sections = new Set(preview.map((row) => row.section_number))
  check('preview_carries_draft_notice_on_fifteen_sections', sections.size === 15 && preview.every((row) => row.review_notice === NOTICE)
    && preview.every((row) => !row.rendered_body.includes('{{')), `${sections.size} sections`)
  const diff = await rows(owner.client.rpc('contract_template_version_diff', { p_version_id: rebased.data?.id }))
  const changes = diff.reduce((acc, row) => ({ ...acc, [row.change]: (acc[row.change] ?? 0) + 1 }), {})
  check('diff_marks_edited_and_added_by_shop', changes.edited === 1 && changes.added_by_shop === 1 && changes.unchanged === diff.length - 2,
    JSON.stringify(changes))

  const archive = await owner.client.rpc('set_owner_contract_template_status', { p_template_id: templateId, p_from_status: 'active', p_to_status: 'archived' }).single()
  const archivedSave = await save(3, { schedule: 'Evenings only.' }, [term], published.data?.id)
  const restore = await owner.client.rpc('set_owner_contract_template_status', { p_template_id: templateId, p_from_status: 'archived', p_to_status: 'active' }).single()
  check('archive_blocks_saves_and_restore_reopens', archive.data?.status === 'archived' && archivedSave.error?.code === '23514'
    && restore.data?.status === 'active', archive.error?.message ?? restore.error?.message)

  const patch = await owner.client.from('contract_template_clauses').update({ body: 'Changed' }).eq('version_id', v1?.version_id).select('id')
  const remove = await owner.client.from('contract_templates').delete().eq('id', templateId).select('id')
  const servicePatch = await admin.from('contract_template_versions').update({ edited_count: 9 }).eq('template_id', templateId).select('id')
  check('direct_patch_and_delete_denied_for_owner_and_service_role', denied(patch.error) && denied(remove.error) && denied(servicePatch.error),
    [patch.error?.code, remove.error?.code, servicePatch.error?.code].join(','))
  const setConfig = await owner.client.rpc('set_config', { setting_name: 'washlink.contract_template_write', new_value: templateId, is_local: false })
  check('rpc_set_config_not_exposed', Boolean(setConfig.error) && setConfig.data === null, setConfig.error?.code ?? 'no error')
  const internal = await owner.client.rpc('contract_template_insert_version',
    { p_template_id: templateId, p_base_version_id: published.data?.id, p_clauses: [], p_edited_count: 0, p_added_count: 0 })
  check('internal_version_writer_not_client_callable', Boolean(internal.error), internal.error?.code ?? 'no error')

  if (await deleteUserChecked('owner_with_templates_through_gotrue', owner.id)) {
    const left = trustedCount('select (select count(*) from public.contract_templates where id = $1) + (select count(*) from '
      + 'public.contract_template_versions where template_id = $1)', templateId)
    const audit = await rows(adminAuditRows(superAdmin.client, { subjectId: templateId }))
    const actions = audit.map((event) => event.action)
    check('owner_delete_removes_templates_and_keeps_audit', left === '0' && actions[0] === 'contract_template.created'
      && actions.at(-1) === 'contract_template.deleted' && audit.at(-1)?.payload?.deleted_by === 'owner_account_deleted'
      && audit.every((event) => !JSON.stringify(event.payload).includes('Smoke crew')), JSON.stringify(actions))
    const stillThere = await rows(otherOwner.client.rpc('platform_contract_template_current'))
    check('platform_standard_survives_owner_deletion', stillThere[0]?.version_id === published.data?.id, JSON.stringify(stillThere))
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
console.log(`w8-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
