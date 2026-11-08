#!/usr/bin/env node
// W2 local-only API smoke test (closes R4 and the PostgREST/supabase-js gap).
//
//   node scripts/supabase-test/w2-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Talks ONLY to the local Supabase stack of the staged `.local-supabase-test` workdir. The local
// API URL and keys come from `npx supabase status -o env --workdir .local-supabase-test` and are
// held in memory: never printed, never written. Refuses any non-loopback API URL. Reads no .env.
// Test users are synthetic (@local.test, random suffix) and are deleted at the end.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'
import fs from 'node:fs'

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
    console.error('w2-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w2-api-smoke: could not read local API settings')
    process.exit(2)
  }
  const host = new URL(apiUrl).hostname
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    console.error('w2-api-smoke: refusing non-loopback API URL')
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

async function signUpHttp(label, metadata) {
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `smoke-${label}-${runId}@local.test`,
      password,
      data: metadata,
    }),
  })
  const body = await response.json()
  const id = body.user?.id ?? body.id
  if (id) createdUserIds.push(id)
  return { status: response.status, id, accessToken: body.access_token, email: `smoke-${label}-${runId}@local.test` }
}

async function profileRole(userId) {
  const { data, error } = await admin.from('profiles').select('role').eq('id', userId).single()
  return error ? `error:${error.code}` : data.role
}

async function signedIn(email) {
  const client = newClient(anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return client
}

async function main() {
  // (a) R4 - signup metadata through the real GoTrue HTTP API.
  const expected = { super_admin: 'customer', owner: 'owner', worker: 'worker', customer: 'customer' }
  const users = {}
  for (const [requested, wanted] of Object.entries(expected)) {
    const signup = await signUpHttp(`role-${requested.replace('_', '')}`, { role: requested, full_name: 'Smoke Test' })
    const role = signup.id ? await profileRole(signup.id) : 'no user'
    check(`r4_signup_metadata_role_${requested}_gives_${wanted}`, signup.status === 200 && role === wanted, `status ${signup.status}, role ${role}`)
    check(`r4_signup_metadata_role_${requested}_is_never_super_admin`, role !== 'super_admin')
    users[requested] = signup
  }

  // (a) R4 - auth.updateUser metadata, for every account type.
  for (const [requested, signup] of Object.entries(users)) {
    const before = await profileRole(signup.id)
    const client = await signedIn(signup.email)
    const { error } = await client.auth.updateUser({ data: { role: 'super_admin' } })
    const after = await profileRole(signup.id)
    check(`r4_update_user_metadata_cannot_make_${requested}_super_admin`, !error && after === before && after !== 'super_admin', `before ${before}, after ${after}, error ${error?.code ?? 'none'}`)
  }

  // (b) direct PostgREST update of profiles.role is rejected.
  const customerClient = await signedIn(users.customer.email)
  const update = await customerClient.from('profiles').update({ role: 'super_admin' }).eq('id', users.customer.id).select()
  check('r4_postgrest_update_profile_role_rejected', update.error?.code === '42501', `code ${update.error?.code}, rows ${update.data?.length}`)
  check('r4_role_unchanged_after_rejected_update', (await profileRole(users.customer.id)) === 'customer')

  // (b) owner and worker RPCs through PostgREST.
  const ownerClient = await signedIn(users.owner.email)
  const workerClient = await signedIn(users.worker.email)

  const shopInsert = await ownerClient.from('shops').insert({ owner_id: users.owner.id, name: 'Smoke Wash', address: '1 Test Street' }).select('id, verification_status').single()
  check('owner_can_register_shop_via_postgrest', !shopInsert.error && shopInsert.data?.verification_status === 'pending', shopInsert.error?.message)
  const shopId = shopInsert.data?.id

  const submit = await ownerClient.rpc('submit_shop_for_verification', { p_shop_id: shopId }).select('id, verification_status, verification_submitted_at').single()
  check('submit_shop_for_verification_via_rpc', !submit.error && submit.data?.verification_status === 'pending' && Boolean(submit.data?.verification_submitted_at), submit.error?.message)
  const foreignSubmit = await workerClient.rpc('submit_shop_for_verification', { p_shop_id: shopId })
  check('submit_shop_for_verification_rejects_non_owner', foreignSubmit.error?.code === '42501', foreignSubmit.error?.code)

  const rosterInsert = await ownerClient.from('workers').insert({ owner_id: users.owner.id, name: 'Smoke Roster' }).select('id').single()
  check('owner_can_add_unlinked_roster_worker_via_postgrest', !rosterInsert.error, rosterInsert.error?.message)
  const rosterId = rosterInsert.data?.id

  const issued = await ownerClient.rpc('create_roster_link_code', { p_worker_row_id: rosterId })
  const code = issued.data?.[0]?.link_code
  check('create_roster_link_code_via_rpc', !issued.error && /^[0-9A-F]{12}$/.test(code ?? ''), issued.error?.message)
  const wrongRole = await workerClient.rpc('create_roster_link_code', { p_worker_row_id: rosterId })
  check('create_roster_link_code_rejects_worker_role', wrongRole.error?.code === '42501', wrongRole.error?.code)

  const preview = await workerClient.rpc('preview_roster_link_code', { p_code: code })
  check('preview_roster_link_code_valid', !preview.error && preview.data?.[0]?.result === 'valid' && preview.data[0].roster_display_name === 'Smoke Roster', preview.error?.message)
  const badPreview = await workerClient.rpc('preview_roster_link_code', { p_code: 'AAAAAAAAAAAA' })
  check('preview_roster_link_code_bad_code_is_invalid_or_expired', badPreview.data?.[0]?.result === 'invalid_or_expired', badPreview.error?.message)

  const accept = await workerClient.rpc('accept_roster_link_code', { p_code: code })
  check('accept_roster_link_code_links', !accept.error && accept.data?.[0]?.result === 'linked', accept.error?.message)
  const reuse = await workerClient.rpc('accept_roster_link_code', { p_code: code })
  check('accept_roster_link_code_is_single_use', reuse.data?.[0]?.result !== 'linked', reuse.data?.[0]?.result)

  const roster = await workerClient.rpc('list_my_roster_links')
  check('list_my_roster_links_returns_entry', !roster.error && roster.data?.length === 1 && roster.data[0].worker_row_id === rosterId, roster.error?.message)

  const directLink = await ownerClient.from('workers').update({ user_id: users.customer.id }).eq('id', rosterId).select()
  check('owner_cannot_set_worker_user_id_via_postgrest', directLink.error?.code === '42501', directLink.error?.code)

  const unlink = await workerClient.rpc('unlink_my_roster_entry', { p_worker_row_id: rosterId })
  check('unlink_my_roster_entry_via_rpc', !unlink.error, unlink.error?.message)
  const afterUnlink = await workerClient.rpc('list_my_roster_links')
  check('list_my_roster_links_empty_after_unlink', !afterUnlink.error && afterUnlink.data?.length === 0)

  const anonCall = await newClient(anonKey).rpc('list_my_roster_links')
  check('anon_cannot_call_list_my_roster_links', Boolean(anonCall.error), 'no error')

  await fixCycleOneChecks({ users, ownerClient, workerClient, customerClient, shopId, rosterId })
}

// Raw PostgREST call with the anon apikey and NO Authorization header (no JWT).
async function restWithoutJwt(pathname, body) {
  const response = await fetch(`${apiUrl}/rest/v1/${pathname}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  return { status: response.status, payload }
}

async function serviceRow(table, id) {
  const { data, error } = await admin.from(table).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`service read ${table} failed: ${error.code}`)
  return data
}

function sameExcept(before, after, changedKey) {
  if (!before || !after) return false
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  keys.delete(changedKey)
  return [...keys].every((key) => JSON.stringify(before[key]) === JSON.stringify(after[key]))
}

async function deleteUserChecked(label, id) {
  const { error } = await admin.auth.admin.deleteUser(id)
  check(`delete_user_${label}`, !error, error?.message)
  if (!error && createdUserIds.includes(id)) createdUserIds.splice(createdUserIds.indexOf(id), 1)
  return !error
}

// Fix cycle 1 (DB): trusted-session fail-open, server-side review stamping, and FK
// `on delete set null` cascades through the real GoTrue admin API (session supabase_auth_admin).
async function fixCycleOneChecks({ users, ownerClient, workerClient, customerClient, shopId, rosterId }) {
  // Anon PostgREST without a JWT is NOT a trusted session: the booking insert guard runs (its
  // message) instead of being skipped (then the quote trigger's "Choose a shop" message appears).
  const noJwt = await restWithoutJwt('bookings', {
    customer_name: 'Smoke anon', vehicle_type: 'Sedan', service_type: 'Basic Wash',
    address: '1 Test Street', time: new Date(Date.now() + 86400000).toISOString(), booking_status: 'completed',
  })
  check('anon_no_jwt_postgrest_request_is_not_trusted',
    noJwt.status >= 400 && noJwt.payload?.message === 'New bookings start as pending, unassigned and unrated.',
    `status ${noJwt.status}, message ${noJwt.payload?.message}`)

  // Super admin (promoted with the service_role key = trusted session) approves the shop and
  // sends forged review fields, which the server ignores.
  const reviewer = await signUpHttp('reviewer', { role: 'customer', full_name: 'Smoke Reviewer' })
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  check('service_role_postgrest_request_is_trusted', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)
  const reviewerClient = await signedIn(reviewer.email)
  const approve = await reviewerClient.from('shops')
    .update({ verification_status: 'approved', verification_reviewed_by: users.owner.id, verification_reviewed_at: '2000-01-01T00:00:00Z' })
    .eq('id', shopId).select('verification_status, verification_reviewed_by, verification_reviewed_at').single()
  check('super_admin_review_stamps_reviewer_server_side',
    !approve.error && approve.data?.verification_status === 'approved' && approve.data?.verification_reviewed_by === reviewer.id
      && new Date(approve.data?.verification_reviewed_at).getFullYear() >= 2026,
    approve.error?.message ?? JSON.stringify(approve.data))
  const gate = await ownerClient.rpc('is_verified_shop_owner', { p_shop_id: shopId })
  check('is_verified_shop_owner_true_after_real_review', gate.data === true, gate.error?.message ?? String(gate.data))

  // History: booking A completed by a linked roster worker, booking B accepted (plain roster row).
  const price = await ownerClient.from('shop_pricing').insert({ shop_id: shopId, vehicle_type: 'Sedan', service_type: 'Basic Wash', price: 250 })
  check('owner_can_price_shop_via_postgrest', !price.error, price.error?.message)
  const roster2 = await ownerClient.from('workers').insert({ owner_id: users.owner.id, name: 'Smoke Roster Linked' }).select('id').single()
  const rosterLinkedId = roster2.data?.id
  const code2 = (await ownerClient.rpc('create_roster_link_code', { p_worker_row_id: rosterLinkedId })).data?.[0]?.link_code
  const accept2 = await workerClient.rpc('accept_roster_link_code', { p_code: code2 })
  check('worker_links_second_roster_row', accept2.data?.[0]?.result === 'linked', accept2.error?.message ?? accept2.data?.[0]?.result)

  const bookingPayload = {
    customer_name: 'Smoke Customer', customer_id: users.customer.id, vehicle_type: 'Sedan', service_type: 'Basic Wash',
    address: '1 Test Street', time: new Date(Date.now() + 86400000).toISOString(), shop_id: shopId,
  }
  const bookingA = await customerClient.from('bookings').insert(bookingPayload).select('id').single()
  const bookingB = await customerClient.from('bookings').insert(bookingPayload).select('id').single()
  check('customer_can_book_via_postgrest', !bookingA.error && !bookingB.error, bookingA.error?.message ?? bookingB.error?.message)
  const bookingAId = bookingA.data?.id
  const bookingBId = bookingB.data?.id
  const steps = [
    await ownerClient.from('bookings').update({ booking_status: 'accepted', assigned_worker_id: rosterLinkedId }).eq('id', bookingAId),
    await ownerClient.from('bookings').update({ booking_status: 'accepted', assigned_worker_id: rosterId }).eq('id', bookingBId),
    await workerClient.from('bookings').update({ booking_status: 'in_progress' }).eq('id', bookingAId),
    await workerClient.from('bookings').update({ booking_status: 'completed' }).eq('id', bookingAId),
  ]
  const stepError = steps.find((step) => step.error)?.error
  check('booking_history_created_via_postgrest', !stepError && (await serviceRow('bookings', bookingAId))?.booking_status === 'completed', stepError?.message)

  // 1) Linked worker account deleted through GoTrue: workers.user_id -> null, nothing else.
  const rosterBefore = await serviceRow('workers', rosterLinkedId)
  if (await deleteUserChecked('linked_worker_account_with_booking_history', users.worker.id)) {
    const rosterAfter = await serviceRow('workers', rosterLinkedId)
    check('linked_worker_delete_nulls_user_id_only', rosterAfter?.user_id === null && sameExcept(rosterBefore, rosterAfter, 'user_id'))
  }

  // 2) Roster row of a COMPLETED booking deleted by its owner: assigned_worker_id -> null only.
  const bookingABefore = await serviceRow('bookings', bookingAId)
  const rosterDelete = await ownerClient.from('workers').delete().eq('id', rosterLinkedId).select('id')
  check('owner_can_delete_roster_worker_with_completed_booking', !rosterDelete.error && rosterDelete.data?.length === 1, rosterDelete.error?.message)
  const bookingAAfter = await serviceRow('bookings', bookingAId)
  check('roster_delete_nulls_assigned_worker_only', bookingAAfter?.assigned_worker_id === null && sameExcept(bookingABefore, bookingAAfter, 'assigned_worker_id'))

  // 3) Customer with bookings deleted through GoTrue: bookings.customer_id -> null only.
  const bookingBBefore = await serviceRow('bookings', bookingBId)
  if (await deleteUserChecked('customer_with_bookings', users.customer.id)) {
    const bookingBAfter = await serviceRow('bookings', bookingBId)
    check('customer_delete_nulls_customer_id_only', bookingBAfter?.customer_id === null && sameExcept(bookingBBefore, bookingBAfter, 'customer_id'))
  }

  // 4) Reviewing super admin deleted through GoTrue: shops.verification_reviewed_by -> null only.
  const shopBefore = await serviceRow('shops', shopId)
  if (await deleteUserChecked('reviewing_super_admin', reviewer.id)) {
    const shopAfter = await serviceRow('shops', shopId)
    check('reviewer_delete_nulls_reviewed_by_only', shopAfter?.verification_reviewed_by === null && sameExcept(shopBefore, shopAfter, 'verification_reviewed_by'))
  }

  // 5) Owner deleted through GoTrue: shops cascade away, bookings.shop_id -> null.
  if (await deleteUserChecked('owner_with_shop_and_bookings', users.owner.id)) {
    const bookingAfterOwner = await serviceRow('bookings', bookingBId)
    check('owner_delete_keeps_booking_with_null_shop', bookingAfterOwner !== null && bookingAfterOwner.shop_id === null)
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`NOT OK unexpected error -> ${error.message}`)
} finally {
  // Every remaining synthetic user is deleted and the result asserted (was unchecked before).
  for (const id of [...createdUserIds]) await deleteUserChecked('cleanup', id)
}
console.log(`w2-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
