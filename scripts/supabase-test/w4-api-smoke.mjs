#!/usr/bin/env node
// W4 local-only API smoke test: job openings through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w4-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2-api-smoke.mjs / w3-api-smoke.mjs: talks ONLY to the local Supabase stack
// of the staged `.local-supabase-test` workdir. The local API URL and keys come from
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
    console.error('w4-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w4-api-smoke: could not read local API settings')
    process.exit(2)
  }
  const host = new URL(apiUrl).hostname
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    console.error('w4-api-smoke: refusing non-loopback API URL')
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
const OPENING_COLUMNS = 'id, shop_id, owner_id, status, title, first_published_at, status_changed_at'

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
  const email = `smoke4-${label}-${runId}@local.test`
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
const transition = (client, id, from, to) =>
  client.rpc('transition_job_opening', { p_job_opening_id: id, p_from_status: from, p_to_status: to }).single()

async function main() {
  const owner = await signUp('owner', 'owner')
  const otherOwner = await signUp('other-owner', 'owner')
  const worker = await signUp('worker', 'worker')
  const customer = await signUp('customer', 'customer')
  const reviewer = await signUp('reviewer', 'customer')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  check('service_role_can_promote_reviewer', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)

  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: 'Smoke W4 Wash', address: '4 Test Street' }).select('id').single()
  check('owner_can_register_shop', !shop.error, shop.error?.message)
  const shopId = shop.data?.id

  const anonRead = await newClient(anonKey).from('job_openings').select('id')
  check('anon_read_gets_error_or_zero_rows', Boolean(anonRead.error) || anonRead.data?.length === 0,
    `${anonRead.data?.length} rows`)

  // Draft through PostgREST: never sends owner_id, status or stamps.
  const draft = await owner.client.from('job_openings').insert({
    shop_id: shopId, title: 'Smoke car wash attendant', description: 'Wash and dry cars',
    work_location: 'Smoke W4 Wash', openings_count: 2, job_type: 'part_time', applicant_requirement: 'trainees_welcome',
  }).select(OPENING_COLUMNS).single()
  check('owner_inserts_draft_via_postgrest',
    !draft.error && draft.data?.status === 'draft' && draft.data?.owner_id === owner.id && draft.data?.first_published_at === null,
    draft.error?.message)
  const openingId = draft.data?.id

  const unverifiedPublish = await transition(owner.client, openingId, 'draft', 'published')
  check('publish_rejected_for_unverified_shop',
    isPermissionError(unverifiedPublish.error) && unverifiedPublish.error?.message === 'Only a verified shop can publish job openings.',
    unverifiedPublish.error?.message ?? 'no error')

  const approve = await reviewer.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId)
    .select('verification_status').single()
  check('super_admin_approves_shop', !approve.error && approve.data?.verification_status === 'approved', approve.error?.message)
  const gate = await owner.client.rpc('is_verified_shop_owner', { p_shop_id: shopId })
  check('is_verified_shop_owner_true_after_review', !gate.error && gate.data === true, gate.error?.message ?? String(gate.data))

  const publish = await transition(owner.client, openingId, 'draft', 'published')
  check('publish_succeeds_for_verified_shop',
    !publish.error && publish.data?.status === 'published' && Boolean(publish.data?.first_published_at), publish.error?.message)

  const workerList = await worker.client.from('job_openings').select('id, title, status')
  check('worker_lists_one_published_opening', !workerList.error && workerList.data?.length === 1 && workerList.data[0].id === openingId,
    workerList.error?.message ?? `${workerList.data?.length} rows`)
  const customerList = await customer.client.from('job_openings').select('id')
  check('customer_lists_zero_openings', !customerList.error && customerList.data?.length === 0, customerList.error?.message)
  const otherList = await otherOwner.client.from('job_openings').select('id')
  check('other_owner_lists_zero_openings', !otherList.error && otherList.data?.length === 0, otherList.error?.message)

  const otherUpdate = await otherOwner.client.from('job_openings').update({ title: 'Hijacked' }).eq('id', openingId).select('id')
  check('other_owner_update_changes_zero_rows', !otherUpdate.error && otherUpdate.data?.length === 0, otherUpdate.error?.message)
  const otherRpc = await transition(otherOwner.client, openingId, 'published', 'paused')
  check('other_owner_transition_rpc_denied', isPermissionError(otherRpc.error) && otherRpc.error?.message === 'Job opening not found.',
    otherRpc.error?.message ?? 'no error')

  const directStatus = await owner.client.from('job_openings').update({ status: 'closed' }).eq('id', openingId).select('id')
  check('direct_status_patch_rejected',
    isPermissionError(directStatus.error) && directStatus.error?.message === 'This job opening status change is not allowed.',
    directStatus.error?.message ?? 'no error')
  const forgedStamp = await owner.client.from('job_openings').update({ first_published_at: '2000-01-01T00:00:00Z' }).eq('id', openingId).select('id')
  check('server_stamp_patch_rejected', isPermissionError(forgedStamp.error), forgedStamp.error?.code ?? 'no error')
  const setConfig = await owner.client.rpc('set_config', { setting_name: 'washlink.job_opening_transition', new_value: openingId, is_local: false })
  check('rpc_set_config_not_exposed', Boolean(setConfig.error) && setConfig.data === null, setConfig.error?.code ?? 'no error')

  const stale = await transition(owner.client, openingId, 'draft', 'published')
  check('stale_transition_returns_55000', stale.error?.code === '55000', stale.error?.code ?? 'no error')
  const publishedDelete = await owner.client.from('job_openings').delete().eq('id', openingId).select('id')
  check('published_delete_removes_nothing', !publishedDelete.error ? publishedDelete.data?.length === 0 : true,
    publishedDelete.error?.message)

  for (const [from, to] of [['published', 'paused'], ['paused', 'published'], ['published', 'closed'], ['closed', 'archived']]) {
    const step = await transition(owner.client, openingId, from, to)
    check(`transition_${from}_to_${to}`, !step.error && step.data?.status === to, step.error?.message)
  }
  const reopen = await transition(owner.client, openingId, 'archived', 'published')
  check('archived_cannot_be_reopened', isPermissionError(reopen.error), reopen.error?.message ?? 'no error')
  const archivedEdit = await owner.client.from('job_openings').update({ title: 'Edited after archive' }).eq('id', openingId).select('id')
  check('archived_opening_is_read_only', isPermissionError(archivedEdit.error), archivedEdit.error?.message ?? 'no error')
  const stillThere = await owner.client.from('job_openings').select('id, status').eq('id', openingId).single()
  check('published_delete_left_row_in_place', !stillThere.error && stillThere.data?.status === 'archived', stillThere.error?.message)

  const second = await owner.client.from('job_openings').insert({ shop_id: shopId, title: 'Smoke draft to delete' }).select('id').single()
  const draftDelete = await owner.client.from('job_openings').delete().eq('id', second.data?.id).select('id')
  check('draft_delete_works', !second.error && !draftDelete.error && draftDelete.data?.length === 1,
    second.error?.message ?? draftDelete.error?.message)

  // Optimistic concurrency exactly as SupabaseJobOpeningRepository does it:
  // read updated_at as PostgREST returns it, then update with .eq('updated_at', value).select(cols).
  const versioned = await owner.client.from('job_openings').insert({ shop_id: shopId, title: 'Smoke versioned draft' }).select('id').single()
  const versionedId = versioned.data?.id
  const readBack = await owner.client.from('job_openings').select(OPENING_COLUMNS + ', updated_at').eq('id', versionedId).single()
  const versionOne = readBack.data?.updated_at
  check('occ_read_returns_updated_at_text', !readBack.error && typeof versionOne === 'string', readBack.error?.message ?? String(versionOne))
  const nonOwnerOcc = await otherOwner.client.from('job_openings').update({ title: 'Hijack by version' })
    .eq('id', versionedId).eq('updated_at', versionOne).select(OPENING_COLUMNS + ', updated_at')
  check('occ_non_owner_update_affects_zero_rows', !nonOwnerOcc.error && nonOwnerOcc.data?.length === 0,
    nonOwnerOcc.error?.message ?? `${nonOwnerOcc.data?.length} rows`)
  const occOne = await owner.client.from('job_openings').update({ title: 'Smoke versioned edit one' })
    .eq('id', versionedId).eq('updated_at', versionOne).select(OPENING_COLUMNS + ', updated_at')
  check('occ_update_with_current_updated_at_affects_one_row',
    !occOne.error && occOne.data?.length === 1 && occOne.data[0].title === 'Smoke versioned edit one',
    occOne.error?.message ?? `${occOne.data?.length} rows; read value ${versionOne}`)
  const versionTwo = occOne.data?.[0]?.updated_at
  check('occ_updated_at_advances_after_update', typeof versionTwo === 'string' && versionTwo !== versionOne, `${versionOne} -> ${versionTwo}`)
  const occStale = await owner.client.from('job_openings').update({ title: 'Smoke versioned stale' })
    .eq('id', versionedId).eq('updated_at', versionOne).select(OPENING_COLUMNS + ', updated_at')
  check('occ_stale_updated_at_affects_zero_rows', !occStale.error && occStale.data?.length === 0,
    occStale.error?.message ?? `${occStale.data?.length} rows`)
  const occFresh = await owner.client.from('job_openings').update({ title: 'Smoke versioned edit two' })
    .eq('id', versionedId).eq('updated_at', versionTwo).select(OPENING_COLUMNS + ', updated_at')
  check('occ_update_with_returned_updated_at_chains', !occFresh.error && occFresh.data?.length === 1, occFresh.error?.message ?? `${occFresh.data?.length} rows`)
  const nonDraftDelete = await owner.client.from('job_openings').delete().eq('id', openingId).eq('status', 'draft').select('id')
  check('occ_delete_non_draft_affects_zero_rows', !nonDraftDelete.error && nonDraftDelete.data?.length === 0,
    nonDraftDelete.error?.message ?? `${nonDraftDelete.data?.length} rows`)
  const versionedCleanup = await owner.client.from('job_openings').delete().eq('id', versionedId).eq('status', 'draft').select('id')
  check('occ_draft_cleanup_delete_affects_one_row', !versionedCleanup.error && versionedCleanup.data?.length === 1, versionedCleanup.error?.message)

  const audit = await reviewer.client.from('workforce_audit_events').select('action').eq('subject_id', openingId)
  check('super_admin_reads_job_opening_audit',
    !audit.error && audit.data?.filter((row) => row.action === 'job_opening.status_changed').length === 5,
    audit.error?.message ?? JSON.stringify(audit.data))
  const ownerJobNotices = await owner.client.from('notifications').select('id, category').like('category', 'job_opening%')
  const ownerNotices = await owner.client.from('notifications').select('id, category')
  check('owner_has_no_job_opening_notifications',
    !ownerJobNotices.error && ownerJobNotices.data?.length === 0
      && ownerNotices.data?.every((row) => row.category === 'shop_verification.status_changed'),
    ownerJobNotices.error?.message ?? JSON.stringify(ownerNotices.data))

  if (await deleteUserChecked('owner_with_openings_through_gotrue', owner.id)) {
    const gone = await reviewer.client.from('job_openings').select('id').eq('id', openingId)
    check('owner_account_delete_cascades_openings', !gone.error && gone.data?.length === 0, gone.error?.message)
    const deletedEvent = await reviewer.client.from('workforce_audit_events').select('payload')
      .eq('subject_id', openingId).eq('action', 'job_opening.deleted')
    check('owner_account_delete_writes_deleted_event',
      !deletedEvent.error && deletedEvent.data?.length === 1 && deletedEvent.data[0].payload?.deleted_by === 'owner_account_deleted',
      deletedEvent.error?.message ?? JSON.stringify(deletedEvent.data))
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
console.log(`w4-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
