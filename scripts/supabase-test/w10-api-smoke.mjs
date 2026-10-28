#!/usr/bin/env node
// W10 local-only API smoke test: owner relationships and the three-distinct-owner progress goal through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w10-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2..w9-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
// `.local-supabase-test` workdir. API URL and keys come from `npx supabase status -o env --workdir
// .local-supabase-test` and are held in memory: never printed, never written. Refuses any non-loopback API URL.
// Reads no .env. Users are synthetic (smoke10-*@local.test, random suffix) and deleted at the end (asserted). No
// time shift and no trusted write: every write goes through the real RPCs. The super_admin changes the global
// minimum (3 -> 5) and puts it back to 3 before the end (two audited changes). Contracts the remaining party keeps
// after a deleteUser stay on the local stack as their retention rules require (the next run-db-tests.mjs reset removes them).

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
    console.error('w10-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w10-api-smoke: could not read local API settings')
    process.exit(2)
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('w10-api-smoke: refusing non-loopback API URL')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const admin = newClient(serviceKey)
const anon = newClient(anonKey)
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const manilaToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
const TABLES = ['worker_owner_relationships', 'workforce_policies']
const POLICY_REASON = 'Smoke check NUMBAT of the informational goal.'
const END_REASON = 'Moving away WALLABY, ending the contract.'

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
  const email = `smoke10-${label}-${runId}@local.test`
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
let superAdminClient = null
let policyRaised = false

async function main() {
  const superAdmin = await signUp('admin', 'customer')
  superAdminClient = superAdmin.client
  const worker = await createWorker('worker')
  const otherWorker = await createWorker('other-worker')
  const customer = await signUp('customer', 'customer')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  check('setup_super_admin_promoted', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)

  const owners = {}
  const setupOwner = async (key, shopName) => {
    const owner = owners[key] ?? { ...(await signUp(`owner-${key}`, 'owner')) }
    owners[key] = owner
    const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: shopName, address: '10 Test Street' }).select('id').single()
    const shopId = shop.data?.id
    await superAdmin.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId)
    const opening = await owner.client.from('job_openings').insert({ shop_id: shopId, title: `Smoke W10 ${shopName}`, description: 'Wash cars', work_location: 'Smoke W10',
      openings_count: 2, job_type: 'part_time', applicant_requirement: 'trainees_welcome' }).select('id').single()
    await owner.client.rpc('transition_job_opening', { p_job_opening_id: opening.data?.id, p_from_status: 'draft', p_to_status: 'published' })
    const applied = await worker.client.rpc('create_job_application', { p_job_opening_id: opening.data?.id, p_cover_note: null, p_submit: true, p_notice_version: 'w5_v1' }).single()
    await owner.client.rpc('transition_job_application', { p_application_id: applied.data?.id, p_from_status: 'submitted', p_to_status: 'under_review' })
    await owner.client.rpc('transition_job_application', { p_application_id: applied.data?.id, p_from_status: 'under_review', p_to_status: 'accepted' })
    if (!owner.templateVersionId) {
      const created = await owner.client.rpc('create_owner_contract_template', { p_name: `Smoke W10 ${key} agreement`, p_from_version_id: null }).single()
      owner.templateVersionId = (await rows(owner.client.rpc('owner_contract_templates'))).find((row) => row.template_id === created.data?.id)?.current_version_id
    }
    return shopId
  }
  const approve = (shopId) => superAdmin.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId)

  const shopA1 = await setupOwner('a', 'Smoke W10 Wash A1')
  const shopB = await setupOwner('b', 'Smoke W10 Wash B')
  const shopC = await setupOwner('c', 'Smoke W10 Wash C')
  const ownerA = owners.a
  const ownerB = owners.b
  const ownerC = owners.c

  const platform = (await rows(ownerA.client.rpc('platform_contract_template_current')))[0]
  const standard = await rows(ownerA.client.rpc('contract_template_version_clauses', { p_version_id: platform?.version_id }))
  const bodies = Object.fromEntries(standard.filter((clause) => clause.kind === 'editable').map((clause) => [clause.clause_key, 'The shop and the worker agree to this smoke clause.']))
  bodies.pay_terms = 'We pay {{pay_details}} each Friday.'
  const values = { role_title: 'Car wash attendant', schedule_summary: 'Weekdays from morning to afternoon', pay_details: 'Daily pay as agreed in writing' }
  const save = (owner, id, extra = {}) => owner.client.rpc('save_worker_contract_draft', { p_contract_id: id, p_expected_draft_revision: 1,
    p_classification_key: 'employee', p_start_date: manilaToday, p_end_date: null, p_owner_values: values, p_editable_bodies: { ...bodies, ...extra }, p_shop_terms: [] }).single()
  const send = (owner, id) => owner.client.rpc('send_worker_contract_version', { p_contract_id: id, p_expected_draft_revision: 2,
    p_acknowledgement_key: 'w9_owner_send_v1', p_contractor_acknowledgement_key: null, p_acknowledged_flag_count: 0 }).single()
  const accept = (id, version) => worker.client.rpc('accept_worker_contract_version', { p_contract_id: id, p_version_id: version.id, p_content_hash: version.content_hash,
    p_acknowledgement_key: 'w9_worker_accept_v1', p_contractor_acknowledgement_key: null }).single()
  const revisionOf = async (owner, id) => (await rows(owner.client.rpc('owner_worker_contracts'))).find((row) => row.contract_id === id)?.revision
  const makeContract = async (owner, shopId, activate) => {
    const draft = await owner.client.rpc('create_worker_contract_draft', { p_shop_id: shopId, p_worker_id: worker.id, p_template_version_id: owner.templateVersionId,
      p_classification_key: 'employee', p_start_date: manilaToday }).single()
    const id = draft.data?.id
    await save(owner, id)
    const sent = await send(owner, id)
    const accepted = await accept(id, sent.data ?? {})
    const active = activate ? await owner.client.rpc('activate_worker_contract', { p_contract_id: id, p_expected_revision: await revisionOf(owner, id) }).single() : null
    if (draft.error || sent.error || accepted.error || active?.error) throw new Error(`contract setup failed: ${[draft, sent, accepted, active].map((r) => r?.error?.message).join(' / ')}`)
    return { id, revision: active?.data?.revision }
  }
  const progress = async () => one(worker.client.rpc('my_owner_relationship_progress'))
  const mine = async () => rows(worker.client.rpc('my_owner_relationships'))
  const policy = async () => one(superAdmin.client.from('workforce_policies').select('*').eq('policy_key', 'minimum_distinct_owners'))
  const setPolicy = async (client, value, reason = POLICY_REASON, revision = null) => client.rpc('set_workforce_policy_value', { p_policy_key: 'minimum_distinct_owners',
    p_new_value: value, p_expected_revision: revision ?? (await policy())?.revision ?? 1, p_change_reason: reason }).single()

  // Direct writes are denied for every client role, including service_role.
  const stamp = new Date().toISOString()
  const attemptDirect = async (table, client) => [await client.from(table).insert({ updated_at: stamp }), await client.from(table).update({ updated_at: stamp }).not('created_at', 'is', null),
    await client.from(table).delete().not('created_at', 'is', null)]
  for (const table of TABLES) {
    const attempts = []
    for (const client of [ownerA.client, worker.client, admin, superAdmin.client, anon]) attempts.push(...await attemptDirect(table, client))
    check(`direct_writes_denied_${table}`, attempts.every((attempt) => attempt.error && attempt.status >= 400 && !attempt.data?.length), attempts.map((attempt) => attempt.error?.code).join(','))
  }
  const policyBefore = await policy()
  check('policy_seeded_minimum_three_informational', policyBefore?.integer_value === 3 && policyBefore?.default_value === 3 && policyBefore?.enforcement === 'informational',
    JSON.stringify(policyBefore ?? null))
  const policyRpcDenied = []
  for (const [label, client] of [['owner', ownerA.client], ['worker', worker.client], ['customer', customer.client], ['service_role', admin], ['anon', anon]]) {
    const attempt = await setPolicy(client, 4, POLICY_REASON, policyBefore?.revision)
    policyRpcDenied.push(`${label}:${attempt.error?.code}`)
  }
  check('set_workforce_policy_value_denied_for_non_admins', policyRpcDenied.every((entry) => !entry.endsWith('undefined')) && (await policy())?.integer_value === 3, policyRpcDenied.join(','))
  const progressBefore = await progress()
  check('worker_progress_zero_remaining_three', progressBefore?.qualifying_owner_count === 0 && progressBefore?.remaining_owner_count === 3 && progressBefore?.minimum_distinct_owners === 3
    && progressBefore?.goal_reached === false && progressBefore?.enforcement === 'informational', JSON.stringify(progressBefore ?? null))

  // Three distinct owners, then a second shop and an amendment with owner A.
  const contractA = await makeContract(ownerA, shopA1, true)
  const afterOne = await progress()
  await makeContract(ownerB, shopB, true)
  const contractC = await makeContract(ownerC, shopC, true)
  const afterThree = await progress()
  check('one_active_contract_counts_one', afterOne?.qualifying_owner_count === 1 && afterOne?.remaining_owner_count === 2, JSON.stringify(afterOne ?? null))
  check('three_active_owners_count_three_remaining_zero', afterThree?.qualifying_owner_count === 3 && afterThree?.remaining_owner_count === 0 && afterThree?.goal_reached === true,
    JSON.stringify(afterThree ?? null))

  const shopA2 = await setupOwner('a', 'Smoke W10 Wash A2')
  await makeContract(ownerA, shopA2, true)
  const afterSecondShop = await progress()
  const listAfterSecond = await mine()
  const ownerARow = listAfterSecond.find((row) => row.owner_name?.includes('owner-a'))
  const ownerASide = await rows(ownerA.client.rpc('owner_worker_relationships'))
  check('second_shop_same_owner_still_three_and_two_contracts', afterSecondShop?.qualifying_owner_count === 3 && listAfterSecond.length === 3 && ownerARow?.accepted_contract_count === 2
    && ownerARow?.qualifying_contract_count === 2 && ownerASide.length === 1 && ownerASide[0].contracts_with_you_count === 2,
    JSON.stringify({ count: afterSecondShop?.qualifying_owner_count, rows: listAfterSecond.length, ownerSide: ownerASide.length }))

  const amend = await ownerA.client.rpc('create_worker_contract_amendment', { p_contract_id: contractA.id, p_expected_revision: await revisionOf(ownerA, contractA.id) }).single()
  await save(ownerA, contractA.id, { schedule: 'Mornings and some afternoons.' })
  const amendmentSent = await send(ownerA, contractA.id)
  const amendmentAccepted = await accept(contractA.id, amendmentSent.data ?? {})
  const afterAmendment = await progress()
  check('accepted_amendment_keeps_count_three', !amend.error && !amendmentSent.error && amendmentAccepted.data?.status === 'active' && afterAmendment?.qualifying_owner_count === 3
    && (await mine()).length === 3, amend.error?.message ?? amendmentSent.error?.message ?? amendmentAccepted.error?.message)

  // Verification lapse and reinstatement.
  const lapse = await superAdmin.client.from('shops').update({ verification_status: 'changes_requested' }).eq('id', shopB)
  const suspended = await progress()
  const bRow = (await mine()).find((row) => row.owner_name?.includes('owner-b'))
  check('shop_verification_lapse_suspends_owner_b_count_two', !lapse.error && suspended?.qualifying_owner_count === 2 && bRow?.status === 'suspended' && bRow?.counts_toward_goal === false,
    JSON.stringify({ count: suspended?.qualifying_owner_count, status: bRow?.status }))
  await approve(shopB)
  const reinstated = await progress()
  check('verification_restored_owner_b_counts_again', reinstated?.qualifying_owner_count === 3, JSON.stringify(reinstated ?? null))

  // Policy change: super_admin only, audited, no reason text. Decline and terminate are never blocked (J16).
  const revisionBefore = (await policy())?.revision
  const raised = await setPolicy(superAdmin.client, 5)
  policyRaised = !raised.error
  const afterRaise = await progress()
  const staleRevision = await setPolicy(superAdmin.client, 6, POLICY_REASON, revisionBefore)
  const audit = await rows(superAdmin.client.from('workforce_audit_events').select('action, actor_id, subject_type, payload').eq('action', 'workforce_policy.changed')
    .eq('subject_id', policyBefore?.id).order('created_at', { ascending: false }))
  check('super_admin_raises_minimum_remaining_two', !raised.error && afterRaise?.minimum_distinct_owners === 5 && afterRaise?.qualifying_owner_count === 3 && afterRaise?.remaining_owner_count === 2
    && afterRaise?.goal_reached === false && staleRevision.error?.code === '55000', raised.error?.message ?? staleRevision.error?.code)
  check('policy_change_audited_without_reason_text', audit.length >= 1 && audit[0].actor_id === superAdmin.id && audit[0].payload?.from_value === 3 && audit[0].payload?.to_value === 5
    && !JSON.stringify(audit[0].payload).includes('NUMBAT') && (await policy())?.last_change_reason === POLICY_REASON, JSON.stringify(audit[0] ?? null))
  const ownerAudit = await rows(ownerA.client.from('workforce_audit_events').select('id'))
  check('non_admin_cannot_read_policy_audit', ownerAudit.length === 0, `${ownerAudit.length} rows`)

  const terminated = await worker.client.rpc('terminate_worker_contract', { p_contract_id: contractC.id, p_expected_revision: contractC.revision, p_reason: END_REASON }).single()
  const afterTerminate = await progress()
  const cRow = (await mine()).find((row) => row.owner_name?.includes('owner-c'))
  check('worker_terminates_below_minimum_succeeds_count_two', terminated.data?.status === 'terminated' && afterTerminate?.qualifying_owner_count === 2 && cRow?.status === 'ended',
    terminated.error?.message ?? JSON.stringify({ count: afterTerminate?.qualifying_owner_count, status: cRow?.status }))

  owners.d = await signUp('owner-d', 'owner')
  const ownerD = owners.d
  const shopD = await setupOwner('d', 'Smoke W10 Wash D')
  const offerD = await ownerD.client.rpc('create_worker_contract_draft', { p_shop_id: shopD, p_worker_id: worker.id, p_template_version_id: ownerD.templateVersionId,
    p_classification_key: 'employee', p_start_date: manilaToday }).single()
  await save(ownerD, offerD.data?.id)
  const sentD = await send(ownerD, offerD.data?.id)
  const declinedD = await worker.client.rpc('decline_worker_contract_version', { p_contract_id: offerD.data?.id, p_version_id: sentD.data?.id, p_note: 'Not now.' }).single()
  const afterDecline = await progress()
  check('worker_declines_offer_below_minimum_no_relationship_row', !declinedD.error && declinedD.data?.status !== 'active' && afterDecline?.qualifying_owner_count === 2
    && (await mine()).every((row) => !row.owner_name?.includes('owner-d')), declinedD.error?.message ?? sentD.error?.message)

  const restored = await setPolicy(superAdmin.client, 3)
  policyRaised = Boolean(restored.error)
  const policyAuditCount = (await rows(superAdmin.client.from('workforce_audit_events').select('id').eq('action', 'workforce_policy.changed').eq('subject_id', policyBefore?.id))).length
  check('policy_restored_to_three_and_audited_again', !restored.error && (await policy())?.integer_value === 3 && policyAuditCount >= 2, restored.error?.message ?? `${policyAuditCount} audit rows`)

  // Privacy (fix cycle 1): an owner has no direct table read (D-38) and sees only its own row through the RPC, with no
  // progress; only a super_admin selects workforce_policies (P61); everybody else sees nothing.
  const ownerAOwn = await rows(ownerA.client.from('worker_owner_relationships').select('*'))
  const policyLeaks = []
  for (const client of [ownerA.client, worker.client, customer.client]) policyLeaks.push(...await rows(client.from('workforce_policies').select('*')))
  check('only_super_admin_selects_workforce_policies', policyLeaks.length === 0, `${policyLeaks.length} rows`)
  const ownerKeys = Object.keys(ownerASide[0] ?? {}).join(',')
  const ownerProgress = await rows(ownerA.client.rpc('my_owner_relationship_progress'))
  const ownerMine = await rows(ownerA.client.rpc('my_owner_relationships'))
  check('owner_sees_only_own_relationship_no_count_no_other_owners', ownerAOwn.length === 0 && ownerASide.length === 1
    && ownerProgress.length === 0 && ownerMine.length === 0
    && ownerKeys === 'relationship_id,worker_id,worker_name,status,status_reason,contracts_with_you_count,first_accepted_at,status_changed_at', `${ownerAOwn.length} / ${ownerKeys}`)
  for (const [label, client] of [['other_worker', otherWorker.client], ['owner_d', ownerD.client], ['super_admin', superAdmin.client], ['customer', customer.client], ['anon', anon]]) {
    const leaks = []
    for (const query of [client.from('worker_owner_relationships').select('id'), client.rpc('my_owner_relationships'), client.rpc('owner_worker_relationships')]) {
      leaks.push(...((await query).data ?? []))
    }
    check(`${label}_reads_no_relationships`, leaks.length === 0, `${leaks.length} rows`)
  }
  const otherProgress = await one(otherWorker.client.rpc('my_owner_relationship_progress'))
  const nonWorkerProgress = []
  for (const client of [superAdmin.client, customer.client, anon]) nonWorkerProgress.push(...await rows(client.rpc('my_owner_relationship_progress')))
  check('other_worker_progress_is_own_zero_and_non_workers_get_none', otherProgress?.qualifying_owner_count === 0 && otherProgress?.remaining_owner_count === 3 && nonWorkerProgress.length === 0,
    JSON.stringify(otherProgress ?? null))

  // Internal functions are not callable by any client role.
  const internal = []
  for (const client of [ownerA.client, worker.client, admin, anon]) {
    const results = await Promise.all([client.rpc('refresh_worker_owner_relationships', { p_as_of: manilaToday }),
      client.rpc('refresh_worker_owner_relationship', { p_worker: worker.id, p_owner: ownerA.id }),
      client.rpc('worker_owner_relationship_derive', { p_worker: worker.id, p_owner: ownerA.id, p_as_of: manilaToday }),
      client.rpc('worker_contract_qualifies', { p_contract_id: contractA.id, p_as_of: manilaToday }),
      client.rpc('worker_distinct_qualifying_owner_count', { p_worker: worker.id, p_as_of: manilaToday }),
      client.rpc('set_config', { setting_name: 'washlink.owner_relationship_write', new_value: `${worker.id}:${ownerA.id}`, is_local: false })])
    internal.push(...results.map((result) => result.error?.code ?? 'callable'))
  }
  check('refresh_derive_count_and_set_config_not_callable', internal.every((code) => code !== 'callable'), internal.join(','))
  const stillThree = await mine()
  check('relationships_unchanged_after_internal_attempts', stillThree.length === 3, `${stillThree.length} rows`)

  // deleteUser: an owner removed keeps the worker's row as owner_removed; a worker removed deletes the rows and audits.
  if (await deleteUserChecked('owner_b_with_active_contract_through_gotrue', ownerB.id)) {
    const afterOwnerDelete = await progress()
    const removed = (await mine()).find((row) => row.status === 'owner_removed')
    check('owner_delete_keeps_row_as_owner_removed_count_one', afterOwnerDelete?.qualifying_owner_count === 1 && removed?.owner_removed === true && removed?.counts_toward_goal === false
      && removed?.owner_name?.includes('owner-b'), JSON.stringify({ count: afterOwnerDelete?.qualifying_owner_count, removed: removed?.status }))
    const removedEvents = await rows(superAdmin.client.from('workforce_audit_events').select('action').eq('subject_profile_id', worker.id).eq('action', 'worker_owner_relationship.owner_removed'))
    check('owner_removed_audited', removedEvents.length === 1, `${removedEvents.length} events`)
  }
  if (await deleteUserChecked('worker_with_relationships_through_gotrue', worker.id)) {
    const left = await rows(ownerA.client.rpc('owner_worker_relationships'))
    const deletedEvents = await rows(superAdmin.client.from('workforce_audit_events').select('action, payload').eq('subject_profile_id', worker.id).eq('action', 'worker_owner_relationship.deleted'))
    check('worker_delete_removes_relationships_and_audits', left.length === 0 && deletedEvents.length >= 3, `${left.length} rows, ${deletedEvents.length} events`)
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  if (policyRaised && superAdminClient) {
    const current = await superAdminClient.from('workforce_policies').select('revision, integer_value').eq('policy_key', 'minimum_distinct_owners').single()
    if (current.data?.integer_value !== 3) {
      await superAdminClient.rpc('set_workforce_policy_value', { p_policy_key: 'minimum_distinct_owners', p_new_value: 3, p_expected_revision: current.data?.revision,
        p_change_reason: 'Smoke cleanup restores the default.' })
    }
  }
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
}
console.log(`w10-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
