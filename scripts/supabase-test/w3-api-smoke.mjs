#!/usr/bin/env node
// W3 local-only API smoke test: audit events and notifications through PostgREST / GoTrue.
//
//   node scripts/supabase-test/w3-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as w2-api-smoke.mjs: talks ONLY to the local Supabase stack of the staged
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
    console.error('w3-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('w3-api-smoke: could not read local API settings')
    process.exit(2)
  }
  const host = new URL(apiUrl).hostname
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    console.error('w3-api-smoke: refusing non-loopback API URL')
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
const NOTIFICATION_COLUMNS = 'id, category, title, body, created_at, read_at'

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
  const email = `smoke3-${label}-${runId}@local.test`
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

async function main() {
  const owner = await signUp('owner', 'owner')
  const worker = await signUp('worker', 'worker')
  const customer = await signUp('customer', 'customer')
  const reviewer = await signUp('reviewer', 'customer')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', reviewer.id).select('role').single()
  check('service_role_can_promote_reviewer', !promote.error && promote.data?.role === 'super_admin', promote.error?.message)

  const shop = await owner.client.from('shops').insert({ owner_id: owner.id, name: 'Smoke W3 Wash', address: '1 Test Street' }).select('id').single()
  check('owner_can_register_shop', !shop.error, shop.error?.message)
  const shopId = shop.data?.id

  // Direct writes and internal RPCs are closed to every client.
  const auditInsert = await owner.client.from('workforce_audit_events').insert({ actor_kind: 'system', action: 'smoke.forged', subject_type: 'shop' })
  check('postgrest_insert_into_audit_events_rejected', isPermissionError(auditInsert.error), auditInsert.error?.code)
  const notificationInsert = await owner.client.from('notifications').insert({
    recipient_id: owner.id, category: 'smoke.forged', title: 'T', body: 'B', idempotency_key: 'smoke:forged',
  })
  check('postgrest_insert_into_notifications_rejected', isPermissionError(notificationInsert.error), notificationInsert.error?.code)
  const recordRpc = await owner.client.rpc('record_workforce_audit_event', {
    p_action: 'smoke.forged', p_subject_type: 'shop', p_subject_id: shopId, p_subject_profile_id: owner.id, p_payload: {},
  })
  check('rpc_record_workforce_audit_event_permission_denied', isPermissionError(recordRpc.error), recordRpc.error?.code)
  const enqueueRpc = await owner.client.rpc('enqueue_notification', {
    p_recipient_id: owner.id, p_category: 'smoke.forged', p_title: 'T', p_body: 'B', p_idempotency_key: 'smoke:forged',
  })
  check('rpc_enqueue_notification_permission_denied', isPermissionError(enqueueRpc.error), enqueueRpc.error?.code)
  const serviceEnqueue = await admin.rpc('enqueue_notification', {
    p_recipient_id: owner.id, p_category: 'smoke.forged', p_title: 'T', p_body: 'B', p_idempotency_key: 'smoke:forged',
  })
  check('rpc_enqueue_notification_denied_for_service_role', isPermissionError(serviceEnqueue.error), serviceEnqueue.error?.code)
  const setConfig = await owner.client.rpc('set_config', { setting_name: 'washlink.audit_writer', new_value: 'on', is_local: false })
  check('rpc_set_config_not_exposed', Boolean(setConfig.error) && setConfig.data === null, setConfig.error?.code ?? 'no error')

  const ownerAudit = await owner.client.from('workforce_audit_events').select('id')
  check('non_admin_audit_select_returns_zero_rows', !ownerAudit.error && ownerAudit.data?.length === 0, ownerAudit.error?.message ?? `${ownerAudit.data?.length} rows`)
  const anonNotifications = await newClient(anonKey).from('notifications').select('id')
  check('anon_cannot_read_notifications', Boolean(anonNotifications.error), 'no error')

  // A real producer: super admin approves the shop, the owner sees exactly one notification.
  const approve = await reviewer.client.from('shops').update({ verification_status: 'approved' }).eq('id', shopId).select('verification_status').single()
  check('super_admin_can_approve_shop', !approve.error && approve.data?.verification_status === 'approved', approve.error?.message)
  const inbox = await owner.client.from('notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).limit(20)
  check('owner_lists_exactly_one_notification_after_approval',
    !inbox.error && inbox.data?.length === 1 && inbox.data[0].category === 'shop_verification.status_changed'
      && inbox.data[0].body === 'Smoke W3 Wash is now Approved.' && inbox.data[0].read_at === null,
    inbox.error?.message ?? JSON.stringify(inbox.data))
  const unread = await owner.client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  check('owner_unread_count_is_one', !unread.error && unread.count === 1, unread.error?.message ?? String(unread.count))
  const notificationId = inbox.data?.[0]?.id
  const markOnce = await owner.client.rpc('mark_notifications_read', { p_notification_ids: [notificationId] })
  check('mark_notifications_read_returns_1', !markOnce.error && markOnce.data === 1, markOnce.error?.message ?? String(markOnce.data))
  const markAgain = await owner.client.rpc('mark_notifications_read', { p_notification_ids: [notificationId] })
  check('mark_notifications_read_then_returns_0', !markAgain.error && markAgain.data === 0, markAgain.error?.message ?? String(markAgain.data))
  const foreignMark = await customer.client.rpc('mark_notifications_read', {})
  check('mark_notifications_read_all_for_other_user_returns_0', !foreignMark.error && foreignMark.data === 0, foreignMark.error?.message ?? String(foreignMark.data))
  const directRead = await owner.client.from('notifications').update({ title: 'Edited' }).eq('id', notificationId).select()
  check('recipient_cannot_edit_notification', isPermissionError(directRead.error), directRead.error?.code)

  // Super admin read; the review log; other roles see nothing.
  const adminAudit = await reviewer.client.from('workforce_audit_events').select('id, action, actor_id, actor_kind').eq('subject_id', shopId)
  check('super_admin_reads_shop_audit_events',
    !adminAudit.error && adminAudit.data?.some((row) => row.action === 'shop.verification_decided' && row.actor_id === reviewer.id && row.actor_kind === 'user'),
    adminAudit.error?.message ?? JSON.stringify(adminAudit.data))
  const reviewLog = await reviewer.client.from('shop_verification_review_log').select('shop_id, to_status, reviewed_by').eq('shop_id', shopId)
  check('super_admin_reads_review_log',
    !reviewLog.error && reviewLog.data?.length === 1 && reviewLog.data[0].reviewed_by === reviewer.id && reviewLog.data[0].to_status === 'approved',
    reviewLog.error?.message ?? JSON.stringify(reviewLog.data))
  const customerLog = await customer.client.from('shop_verification_review_log').select('event_id')
  check('customer_review_log_returns_zero_rows', !customerLog.error && customerLog.data?.length === 0, customerLog.error?.message)

  // The service_role key cannot touch audit rows either.
  const eventId = adminAudit.data?.[0]?.id
  const serviceUpdate = await admin.from('workforce_audit_events').update({ action: 'smoke.tampered' }).eq('id', eventId).select()
  check('service_role_cannot_update_audit_rows', isPermissionError(serviceUpdate.error), serviceUpdate.error?.code)
  const serviceDelete = await admin.from('workforce_audit_events').delete().eq('id', eventId).select()
  check('service_role_cannot_delete_audit_rows', isPermissionError(serviceDelete.error), serviceDelete.error?.code)
  const serviceInsert = await admin.from('workforce_audit_events').insert({ actor_kind: 'system', action: 'smoke.forged', subject_type: 'shop' })
  check('service_role_cannot_insert_audit_rows', isPermissionError(serviceInsert.error), serviceInsert.error?.code)
  const stillThere = await reviewer.client.from('workforce_audit_events').select('action').eq('id', eventId).single()
  check('audit_row_unchanged_after_service_role_attempts', stillThere.data?.action === 'shop.verification_decided', stillThere.error?.message)

  // Roster link producer, then a GoTrue account delete through the AFTER triggers.
  const roster = await owner.client.from('workers').insert({ owner_id: owner.id, name: 'Smoke W3 Roster' }).select('id').single()
  const rosterId = roster.data?.id
  const code = (await owner.client.rpc('create_roster_link_code', { p_worker_row_id: rosterId })).data?.[0]?.link_code
  const accept = await worker.client.rpc('accept_roster_link_code', { p_code: code })
  check('worker_links_roster_row', accept.data?.[0]?.result === 'linked', accept.error?.message ?? accept.data?.[0]?.result)
  const linkedNotice = await owner.client.from('notifications').select(NOTIFICATION_COLUMNS).eq('category', 'roster.linked')
  check('owner_notified_once_of_roster_link',
    !linkedNotice.error && linkedNotice.data?.length === 1 && linkedNotice.data[0].body === 'Smoke W3 Roster is now linked to a worker account.',
    linkedNotice.error?.message ?? JSON.stringify(linkedNotice.data))
  const workerInbox = await worker.client.from('notifications').select('id')
  check('worker_does_not_see_owner_notifications', !workerInbox.error && workerInbox.data?.length === 0)

  if (await deleteUserChecked('linked_worker_through_gotrue', worker.id)) {
    const unlinkEvent = await reviewer.client.from('workforce_audit_events').select('action, actor_kind, payload')
      .eq('subject_id', rosterId).eq('action', 'roster.unlinked')
    check('gotrue_worker_delete_writes_account_deleted_unlink_event',
      !unlinkEvent.error && unlinkEvent.data?.length === 1 && unlinkEvent.data[0].payload?.unlinked_by === 'account_deleted'
        && unlinkEvent.data[0].actor_kind === 'system',
      unlinkEvent.error?.message ?? JSON.stringify(unlinkEvent.data))
  }
  if (await deleteUserChecked('owner_with_shop_and_roster_through_gotrue', owner.id)) {
    const history = await reviewer.client.from('shop_verification_review_log').select('event_id').eq('shop_id', shopId)
    check('review_log_survives_owner_and_shop_deletion', !history.error && history.data?.length === 1, history.error?.message)
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
console.log(`w3-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
