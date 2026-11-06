#!/usr/bin/env node
// B2C-7 local-only API smoke: washer verification documents through the real Storage API, PostgREST and GoTrue. pgTAP proves the policies;
// this proves the Storage service applies them, and runs the trusted job's real logic against real files.
//
//   node scripts/supabase-test/b2c7-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as the other smokes: talks ONLY to the local stack of the staged `.local-supabase-test` workdir, keys come from
// `npx supabase status` and stay in memory, non-loopback URLs are refused, no .env is read. Users are synthetic and deleted at the end, and
// file bytes are synthetic, never a real ID. Exceptions to "real RPCs only" are TEST ONLY time shifts, as in W6, through `docker exec
// supabase_db_<staged project_id> psql`: a closed slot and an aged object, for the late token check. Only validated uuids are interpolated.
// Takes over a minute, because admin_window_closes_after_60_seconds really waits. Not proven here: the Deno wrapper, deployment, scheduling.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pathAndTypeAttacks } from './smoke-worker-document-attacks.mjs'
import { routeAttacks } from './smoke-worker-document-routes.mjs'
import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'
import { approveWorkerDocument, beginWorkerDocument, giveWorkerApprovedDocuments, setWorkerDocumentUploads, SMOKE_JPEG, SMOKE_PNG, uploadWorkerDocument, WORKER_DOCUMENT_BUCKET as BUCKET } from './smoke-worker-documents.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const require = createRequire(path.join(repoRoot, 'frontend', 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const ts = require('typescript')
const projectId = assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')
const dbContainer = `supabase_db_${projectId}`

function transpileTo(target, file) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  fs.writeFileSync(path.join(target, path.basename(file).replace(/\.ts$/, '.js')), outputText)
}

/** Compiles the job's logic and the shared package to temp folders, so this runs the source the job and the apps run. */
function loadSources() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'washlink-b2c7-'))
  const sharedSource = path.join(repoRoot, 'packages', 'shared', 'src')
  for (const file of fs.readdirSync(sharedSource).filter((name) => name.endsWith('.ts'))) transpileTo(target, path.join(sharedSource, file))
  transpileTo(target, path.join(repoRoot, 'supabase', 'functions', 'purge-worker-documents', 'purgeWorkerDocumentFiles.ts'))
  const load = createRequire(path.join(target, 'index.js'))
  return { shared: load('./index.js'), purge: load('./purgeWorkerDocumentFiles.js') }
}

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('b2c7-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey || !['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('b2c7-api-smoke: could not read loopback API settings')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** TEST ONLY. Each `:name` is a uuid or an `<uuid>/<uuid>` object name, checked before it is put in the SQL. */
function trusted(sql, values = {}) {
  let text = sql
  for (const [key, value] of Object.entries(values)) {
    if (!value.split('/').every((part) => SAFE_UUID.test(part))) throw new Error('trusted fixture: unsafe value')
    text = text.split(`:${key}`).join(`'${value}'`)
  }
  const result = spawnSync('docker', ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', text], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`trusted fixture failed: ${(result.stderr ?? '').split('\n')[0]}`)
  return result.stdout.trim()
}

const { shared, purge } = loadSources()
const { apiUrl, anonKey, serviceKey } = readLocalStackConfig()
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
const newClient = (key) => createClient(apiUrl, key, clientOptions)
const service = newClient(serviceKey)
const runId = Math.random().toString(36).slice(2, 8)
const password = `Smoke-${runId}-Pw1!`
const createdUserIds = []
const BASE = { latitude: 14.5547, longitude: 121.0244 }
const NOT_ALL_APPROVED = 'Approve every required document before verifying this washer.'
const UPLOADS_OFF = "WashLink isn't accepting verification documents yet. Try again later."

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
  const email = `smokeb2c7-${label}-${runId}@local.test`
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { role, full_name: `Smoke ${label}` } }),
  })
  const body = await response.json()
  const id = body.user?.id ?? body.id
  if (!id) throw new Error(`signup failed for ${label}: status ${response.status}`)
  createdUserIds.push(id)
  const client = newClient(anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${label}: ${error.message}`)
  return { id, email, client, api: shared.createB2cApi(client) }
}

async function washer(label) {
  const person = await signUp(label, 'worker')
  await person.api.saveWorkerProfile({ bio: 'Smoke washer', skills: ['Exterior'], ...BASE, radiusKm: 25 })
  return person
}

const bucketOf = (client) => client.storage.from(BUCKET)
const statusOf = (error) => String(error?.statusCode ?? error?.status ?? '')
const objectExists = (name) => trusted(`select count(*) from storage.objects where bucket_id = '${BUCKET}' and name = :name`, { name }) === '1'
const queueHas = (name) => trusted('select count(*) from public.independent_worker_document_file_queue where object_name = :name', { name }) === '1'
const docStatus = (id) => trusted('select status from public.independent_worker_documents where id = :id', { id })
const myDocs = async (person) => (await person.client.rpc('my_worker_documents')).data ?? []
const newName = (owner) => `${owner}/${crypto.randomUUID()}`
const open = async (person, id) => person.client.rpc('admin_open_worker_document', { p_document: id })
const review = async (person, id, decision, reason) => person.client.rpc('admin_review_worker_document', { p_document: id, p_decision: decision, p_reason: reason })
const signedUrl = async (person, name, seconds = 60) => bucketOf(person.client).createSignedUrl(name, seconds, { download: 'document.jpg' })
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const rowIsGone = (id) => trusted('select count(*) from public.independent_worker_documents where id = :id', { id }) === '0'

async function flow(ctx) {
  const { admin, w1, customer } = ctx
  const gov = await uploadWorkerDocument(w1.client, 'government_id', SMOKE_JPEG)
  const selfie = await uploadWorkerDocument(w1.client, 'selfie', SMOKE_PNG)
  const docs = await myDocs(w1)
  check('washer_uploads_both_documents', docs.length === 2 && docs.every((d) => d.status === 'submitted') && objectExists(gov.objectName) && objectExists(selfie.objectName))
  const storedTypes = trusted('select string_agg(content_type, chr(44) order by content_type) from public.independent_worker_documents where id in (:gov, :selfie)', { gov: gov.documentId, selfie: selfie.documentId })
  check('shared_client_upload_stores_sniffed_types', storedTypes === 'image/jpeg,image/png', storedTypes)
  const download = await bucketOf(w1.client).download(gov.objectName)
  const ownSigned = await signedUrl(w1, gov.objectName)
  const listing = await bucketOf(w1.client).list(w1.id)
  check('washer_sees_status_not_file', !JSON.stringify(docs).includes(gov.objectName) && download.error !== null && ownSigned.error !== null && (listing.data ?? []).length === 0,
    `download=${statusOf(download.error)} signed=${statusOf(ownSigned.error)}`)

  // D-118: the admin's only read is a download inside an open window. Signing is refused even then, so no lasting link can exist.
  const beforeOpen = await bucketOf(admin.client).download(gov.objectName)
  check('admin_download_refused_without_window', beforeOpen.error !== null && beforeOpen.data === null, statusOf(beforeOpen.error))
  const opened = await open(admin, gov.documentId)
  const signing = await signedUrl(admin, gov.objectName)
  const signingMany = await bucketOf(admin.client).createSignedUrls([gov.objectName], 60)
  check('admin_signed_url_refused_with_open_window', signing.error !== null && signing.data === null && (signingMany.error !== null || signingMany.data.every((row) => row.signedUrl === null)), signing.error?.message)
  const served = await bucketOf(admin.client).download(gov.objectName)
  const auditRows = trusted(`select count(*) from public.workforce_audit_events where action = 'independent_worker_document.opened' and subject_id = :id and payload = '{"document_type": "government_id"}'`, { id: gov.documentId })
  check('admin_opens_and_downloads_with_audit', opened.error === null && opened.data?.[0]?.object_name === gov.objectName && served.error === null && auditRows === '1', served.error?.message ?? auditRows)
  const servedBytes = new Uint8Array(await served.data.arrayBuffer())
  check('admin_download_serves_stored_type_and_bytes', served.data.type.startsWith('image/jpeg') && Buffer.compare(Buffer.from(servedBytes), Buffer.from(SMOKE_JPEG)) === 0, served.data.type)

  // WAITS ON THE FRONTEND CHANGE (D-118): the shared client must download, and return the bytes rather than a link.
  let sharedOpen = null
  let sharedOpenError = null
  try {
    sharedOpen = await admin.api.adminOpenWorkerDocument(selfie.documentId)
  } catch (error) {
    sharedOpenError = error
  }
  const sharedBytes = sharedOpen?.blob ? Buffer.from(await sharedOpen.blob.arrayBuffer()) : Buffer.alloc(0)
  check('shared_client_open_downloads_image', sharedOpen?.contentType === 'image/png' && Buffer.compare(sharedBytes, Buffer.from(SMOKE_PNG)) === 0, sharedOpenError?.message ?? 'no blob returned')
  // The header can't be read through download(), so this fetches the same route with the admin's own session.
  const adminToken = (await admin.client.auth.getSession()).data.session?.access_token
  const rawDownload = await fetch(`${apiUrl}/storage/v1/object/authenticated/worker-verification-documents/${selfie.objectName}`, { headers: { Authorization: `Bearer ${adminToken}`, apikey: anonKey } })
  check('shared_client_upload_is_served_no_store', rawDownload.status === 200 && rawDownload.headers.get('cache-control') === 'no-store', `${rawDownload.status} ${rawDownload.headers.get('cache-control')}`)

  const rejection = await review(admin, selfie.documentId, 'rejected', 'SMOKEREASON the photo is too dark')
  const afterReject = (await myDocs(w1)).find((d) => d.document_type === 'selfie')
  check('admin_rejects_with_reason_washer_reads_it', rejection.error === null && afterReject.status === 'rejected' && afterReject.review_reason === 'SMOKEREASON the photo is too dark')
  const again = await uploadWorkerDocument(w1.client, 'selfie', SMOKE_JPEG)
  check('reupload_after_rejection', (await myDocs(w1)).find((d) => d.document_type === 'selfie').status === 'submitted' && docStatus(selfie.documentId) === 'superseded' && queueHas(selfie.objectName))

  await approveWorkerDocument(admin.client, gov.documentId)
  const early = await admin.client.rpc('admin_review_independent_worker', { p_worker: w1.id, p_status: 'verified', p_note: null })
  check('verify_refused_until_all_approved', early.error?.message === NOT_ALL_APPROVED, early.error?.message)
  await approveWorkerDocument(admin.client, again.documentId)
  const verified = await admin.client.rpc('admin_review_independent_worker', { p_worker: w1.id, p_status: 'verified', p_note: null })
  check('verify_succeeds_after_approval', verified.error === null && verified.data?.verification_status === 'verified', verified.error?.message)
  check('customer_cannot_verify', (await customer.client.rpc('admin_review_independent_worker', { p_worker: w1.id, p_status: 'verified', p_note: null })).error?.code === '42501')
  return { gov, again }
}

// F7 was proved in the first B2C-7 build: a token minted while a slot was open landed a file after it closed. D-124 now refuses the token at
// mint (asserted here and in the route attacks), so the file lands through the service key instead. The sweep is the second line of defence.
async function lateToken(ctx) {
  const { w3 } = ctx
  const slot = await beginWorkerDocument(w3.client, 'selfie')
  const minted = await bucketOf(w3.client).createSignedUploadUrl(slot.objectName)
  trusted(`update public.independent_worker_documents set upload_expires_at = now() - interval '1 minute' where id = :id`, { id: slot.documentId })
  const directAfterClose = await bucketOf(w3.client).upload(slot.objectName, SMOKE_JPEG, { contentType: 'image/jpeg' })
  const firstRun = await purge.purgeWorkerDocumentFiles(service)
  const closed = docStatus(slot.documentId) === 'abandoned' && !queueHas(slot.objectName) && firstRun.failedBatches === 0
  const landing = await bucketOf(service).upload(slot.objectName, SMOKE_JPEG, { contentType: 'image/jpeg' })
  const landed = landing.error === null && objectExists(slot.objectName)
  const submit = await w3.client.rpc('submit_worker_document_upload', { p_document: slot.documentId })
  await purge.purgeWorkerDocumentFiles(service)
  const keptWhileRecent = objectExists(slot.objectName)
  trusted(`update storage.objects set created_at = now() - interval '4 hours' where bucket_id = '${BUCKET}' and name = :name`, { name: slot.objectName })
  const swept = await purge.purgeWorkerDocumentFiles(service)
  check('late_file_on_closed_slot_is_swept', minted.error !== null && directAfterClose.error !== null && closed && landed && submit.error?.code === '55000' && keptWhileRecent && swept.confirmed >= 1 && !objectExists(slot.objectName) && !queueHas(slot.objectName),
    JSON.stringify({ direct: directAfterClose.error?.message, closed, landed, landing: landing.error?.message, submit: submit.error?.code, keptWhileRecent, swept }))
}

async function lifecycle(ctx) {
  const { admin, customer, w4, w5, w6 } = ctx
  // Suspended: no new slot, no upload into an old slot, and the reason stays readable (D-111).
  const heldSlot = await beginWorkerDocument(w6.client, 'selfie')
  const suspend = await admin.client.rpc('admin_review_independent_worker', { p_worker: w6.id, p_status: 'suspended', p_note: 'SMOKEREASON account under review' })
  const noSlot = await w6.client.rpc('begin_worker_document_upload', { p_document_type: 'selfie' })
  const noUpload = await bucketOf(w6.client).upload(heldSlot.objectName, SMOKE_JPEG, { contentType: 'image/jpeg' })
  const note = await w6.api.workerAccount(w6.id)
  check('suspended_washer_cannot_upload', suspend.error === null && noSlot.error?.code === '23514' && noUpload.error !== null && note.verificationNote === 'SMOKEREASON account under review' && (await myDocs(w6)).length === 2, noSlot.error?.message)

  // Revoking a required document returns the washer's accepted job to search, and it reaches the next washer (D-92).
  const catalog = await admin.api.adminCatalog()
  for (const s of catalog.services) {
    await admin.api.adminSaveService({ p_id: s.id, p_key: s.key, p_category: s.category, p_name: s.name, p_description: s.description, p_image_url: s.image_url, p_requirements: s.requirements,
      p_base_price_cents: 50000, p_duration_minutes: s.duration_minutes, p_is_active: s.is_active, p_price_is_draft: false, p_sort_order: s.sort_order })
  }
  for (const a of catalog.addons) {
    await admin.api.adminSaveAddon({ p_id: a.id, p_key: a.key, p_name: a.name, p_description: a.description, p_price_cents: 10000, p_duration_minutes: a.duration_minutes, p_is_active: a.is_active, p_price_is_draft: false, p_sort_order: a.sort_order })
  }
  const rules = { commissionBps: 1000, requestTtlSeconds: 300, searchWindowMinutes: 30, travelBufferMinutes: 20 }
  await admin.api.adminUpdateRules({ bookingsOpen: true, ...rules })
  const services = await customer.api.listServices()
  const wash = services.find((candidate) => candidate.supportedVehicles.includes('sedan'))
  const slotsByWasher = new Map()
  for (const person of [w4, w5]) {
    for (let weekday = 0; weekday < 7; weekday += 1) await person.api.saveWorkerDay(person.id, weekday, { startMinute: 0, endMinute: 1440 })
    for (const s of services) await person.api.setWorkerService(person.id, s.id, true)
    slotsByWasher.set(person.id, await giveWorkerApprovedDocuments(person.client, admin.client))
    await admin.api.adminReviewWorker(person.id, 'verified', '')
    await person.api.setOnline(true)
  }
  const job = await customer.api.createBooking({ serviceId: wash.id, vehicleCategory: 'sedan', vehicleMake: 'Toyota', vehicleModel: 'Vios', vehicleYear: null, addonIds: [], address: '12 Smoke Street, Makati City', ...BASE,
    landmark: '', instructions: '', isImmediate: true, scheduledAt: null, submissionKey: shared.createBookingSubmissionKey(`b2c7-${runId}`) })
  const requestFor = async (person) => (await person.api.dispatchRequests()).find((r) => r.bookingId === job.id)
  const firstRequest = await requestFor(w4)
  const [first, next] = firstRequest ? [w4, w5] : [w5, w4]
  await first.api.acceptRequest((firstRequest ?? await requestFor(w5)).id)
  const revoked = await review(admin, slotsByWasher.get(first.id).government_id.documentId, 'rejected', 'SMOKEREASON this ID is not genuine')
  const account = await first.api.workerAccount(first.id)
  const nextRequest = await requestFor(next)
  const nextAccept = nextRequest ? await next.client.rpc('accept_dispatch_request', { p_request: nextRequest.id }) : { error: { message: 'no offer reached the next washer' } }
  const statusNow = (await customer.api.myBookings()).find((b) => b.id === job.id)?.status
  check('revoke_requeues_booking_to_next_washer', revoked.error === null && account.verificationStatus === 'pending' && account.verificationNote === 'SMOKEREASON this ID is not genuine' && nextAccept.error === null && statusNow === 'accepted', nextAccept.error?.message ?? statusNow)
  await customer.api.cancelBooking(job.id)
  await admin.api.adminUpdateRules({ bookingsOpen: false, ...rules, commissionBps: 0 })

  // Deletion queues the file. It stays in storage, readable by nobody but the service role, until the job runs (F10, D-121).
  const leaver = first
  const deleted = await uploadWorkerDocument(leaver.client, 'selfie')
  await leaver.client.auth.signInWithPassword({ email: leaver.email, password })
  const leaving = await leaver.client.rpc('delete_my_account')
  if (leaving.error) throw new Error(`delete_my_account refused: ${leaving.error.message}`)
  createdUserIds.splice(createdUserIds.indexOf(leaver.id), 1)
  const beforeJob = await bucketOf(service).download(deleted.objectName)
  check('deleted_washer_file_still_present_before_job', rowIsGone(deleted.documentId) && queueHas(deleted.objectName) && objectExists(deleted.objectName) && beforeJob.error === null, beforeJob.error?.message)
  check('deleted_washer_file_unreadable_by_admin', (await open(admin, deleted.documentId)).error?.code === '42501' && (await signedUrl(admin, deleted.objectName)).error !== null)
  const overview = (await admin.client.rpc('admin_worker_document_overview')).data?.[0]
  check('admin_overview_counts_waiting_files', overview?.files_waiting_for_removal >= 1 && overview?.oldest_file_waiting_since !== null)

  const run = await purge.purgeWorkerDocumentFiles(service)
  const after = await fetch(`${apiUrl}/storage/v1/object/${BUCKET}/${deleted.objectName}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } })
  const afterBody = await after.json().catch(() => ({}))
  check('job_removes_file_download_404', run.confirmed >= 1 && run.failedBatches === 0 && !objectExists(deleted.objectName) && (after.status === 404 || String(afterBody.statusCode) === '404'), `${after.status} ${JSON.stringify(afterBody)} ${JSON.stringify(run)}`)
  check('job_confirm_clears_queue', !queueHas(deleted.objectName) && trusted('select count(*) from public.independent_worker_document_file_queue') === '0')
  const repeat = await purge.purgeWorkerDocumentFiles(service)
  check('job_is_idempotent', repeat.confirmed === 0 && repeat.claimed === 0 && repeat.failedBatches === 0, JSON.stringify(repeat))
  check('job_reported_removal_is_audited', Number(trusted(`select coalesce(sum((payload ->> 'files_removed')::int), 0) from public.workforce_audit_events where action = 'independent_worker_document.files_removed'`)) >= run.confirmed)
}

async function expiry(ctx) {
  // This is now the server's limit, not the client's: nothing lasts past the window, because nothing can be signed.
  await sleep(Math.max(0, ctx.expiring.openedAt + 62000 - Date.now()))
  const late = await bucketOf(ctx.admin.client).download(ctx.expiring.objectName)
  check('admin_window_closes_after_60_seconds', late.error !== null && late.data === null, statusOf(late.error))
}

async function main() {
  const admin = await signUp('admin', 'customer')
  const promote = await service.from('profiles').update({ role: 'super_admin' }).eq('id', admin.id).select('role').single()
  if (promote.error) throw new Error(`promotion failed: ${promote.error.message}`)
  const ctx = { admin, customer: await signUp('customer', 'customer'), w1: await washer('w1'), w2: await washer('w2'), w3: await washer('w3'), w4: await washer('w4'), w5: await washer('w5'), w6: await washer('w6'), w7: await washer('w7'), w8: await washer('w8') }
  // D-123: off by default, and every path that starts or finishes an upload refuses while it is off.
  setWorkerDocumentUploads(false)
  const off = await ctx.w1.client.rpc('begin_worker_document_upload', { p_document_type: 'selfie' })
  check('uploads_refused_while_flag_off', off.error?.code === '23514' && off.error.message === UPLOADS_OFF, off.error?.message)
  setWorkerDocumentUploads(true)
  await flow(ctx)
  await pathAndTypeAttacks(ctx, { check, trusted, shared, service, newClient, anonKey, open, objectExists, docStatus, signedUrl, statusOf, newName, bucketOf })
  await routeAttacks({ apiUrl, anonKey, check, trusted, storageContainer: `supabase_storage_${projectId}`, admin, washer: ctx.w7, otherWasher: ctx.w8, open, objectExists, sleep })
  await lateToken(ctx)
  await lifecycle(ctx)
  await expiry(ctx)
}

let crashed = null
try {
  await main()
} catch (error) {
  crashed = error
  failed += 1
  console.log(`NOT OK unexpected_error -> ${error?.message ?? String(error)}`)
}
for (const id of [...createdUserIds]) {
  const { error } = await service.auth.admin.deleteUser(id)
  check('delete_synthetic_user', !error, error?.message)
}
setWorkerDocumentUploads(false)
console.log(`b2c7-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 && crashed === null ? 0 : 1)
