#!/usr/bin/env node
// B2C local-only API smoke: the whole marketplace flow through the shared client (@washlink/shared createB2cApi), the same code
// the web and mobile apps call, against PostgREST / GoTrue.
//
//   node scripts/supabase-test/b2c-api-smoke.mjs      (after run-db-tests.mjs left the stack running)
//
// Same safety rules as the w*-api-smoke.mjs files: talks ONLY to the local Supabase stack of the staged `.local-supabase-test`
// workdir, keys come from `npx supabase status` and stay in memory, non-loopback URLs are refused, no .env is read. Users are
// synthetic and deleted at the end. Every write goes through real RPCs; there is no time shift and no trusted write except the
// promotion of the synthetic super admin. Bookings are closed again at the end; prices stay until the next run-db-tests reset.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertLocalTestProjectId, STAGED_DIRECTORY_NAME } from './stage-local-workdir.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workdir = path.join(repoRoot, STAGED_DIRECTORY_NAME)
const require = createRequire(path.join(repoRoot, 'frontend', 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const ts = require('typescript')
assertLocalTestProjectId(fs.readFileSync(path.join(workdir, 'supabase', 'config.toml'), 'utf8'), 'staged config.toml')

/** Compiles the dependency-free shared package to a temp folder, so this script runs the source the apps run. */
function loadSharedPackage() {
  const source = path.join(repoRoot, 'packages', 'shared', 'src')
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'washlink-shared-'))
  for (const file of fs.readdirSync(source).filter((name) => name.endsWith('.ts'))) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join(source, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    fs.writeFileSync(path.join(target, file.replace(/\.ts$/, '.js')), outputText)
  }
  return createRequire(path.join(target, 'index.js'))('./index.js')
}

function readLocalStackConfig() {
  const result = spawnSync(`npx supabase status -o env --workdir "${workdir}"`, { cwd: repoRoot, encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    console.error('b2c-api-smoke: local stack is not running (run run-db-tests.mjs first)')
    process.exit(2)
  }
  const values = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/)
    if (match) values[match[1]] = match[2]
  }
  const { API_URL: apiUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = values
  if (!apiUrl || !anonKey || !serviceKey || !['127.0.0.1', 'localhost'].includes(new URL(apiUrl).hostname)) {
    console.error('b2c-api-smoke: could not read loopback API settings')
    process.exit(2)
  }
  return { apiUrl, anonKey, serviceKey }
}

const shared = loadSharedPackage()
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

async function refused(call) {
  try {
    await call()
    return null
  } catch (error) {
    return error
  }
}

async function signUp(label, role) {
  const email = `smokeb2c-${label}-${runId}@local.test`
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: { role, full_name: `Smoke ${label}` } }),
  })
  const body = await response.json()
  const id = body.user?.id ?? body.id
  if (!id) throw new Error(`signup failed for ${label}: status ${response.status}`)
  createdUserIds.push(id)
  const client = newClient(anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${label}: ${error.message}`)
  return { id, client, api: shared.createB2cApi(client) }
}

const BASE = { latitude: 14.5547, longitude: 121.0244 }
const CUSTOMER_ADDRESS = '12 Ayala Avenue SMOKEADDRESS, Makati City'

async function readyWorker(label, adminApi, serviceIds) {
  const worker = await signUp(label, 'worker')
  await worker.api.saveWorkerProfile({ bio: 'Smoke washer', skills: ['Exterior'], ...BASE, radiusKm: 25 })
  for (let weekday = 0; weekday < 7; weekday += 1) {
    await worker.api.saveWorkerDay(worker.id, weekday, { startMinute: 0, endMinute: 1440 })
  }
  for (const serviceId of serviceIds) {
    await worker.api.setWorkerService(worker.id, serviceId, true)
  }
  const early = await refused(() => worker.api.setOnline(true))
  check(`${label}_cannot_go_online_before_verification`, early !== null)
  await adminApi.adminReviewWorker(worker.id, 'verified', '')
  await worker.api.setOnline(true)
  return worker
}

function bookingInput(service, startsAt, submissionKey) {
  return {
    serviceId: service.id, vehicleCategory: 'sedan', vehicleMake: 'Toyota', vehicleModel: 'Vios', vehicleYear: null, addonIds: [],
    address: CUSTOMER_ADDRESS, ...BASE, landmark: 'Near the lobby', instructions: 'Gate code 1234', isImmediate: false,
    scheduledAt: startsAt, submissionKey,
  }
}

async function main() {
  const anonApi = shared.createB2cApi(newClient(anonKey))
  check('anon_reads_public_status', (await anonApi.bookingsAreOpen()) === false)
  const publicServices = await anonApi.listServices()
  check('anon_reads_catalog', publicServices.length > 0)
  check('catalog_starts_as_draft', publicServices.every((service) => service.priceIsDraft))

  const superAdmin = await signUp('admin', 'customer')
  const promote = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', superAdmin.id).select('role').single()
  if (promote.error) throw new Error(`promotion failed: ${promote.error.message}`)
  const customer = await signUp('customer', 'customer')
  const otherCustomer = await signUp('other', 'customer')

  // Administration gates.
  check('customer_cannot_use_admin_rpcs', (await refused(() => customer.api.adminSummary())) !== null)
  const opening = await refused(() => superAdmin.api.adminUpdateRules({ bookingsOpen: true, commissionBps: 0, requestTtlSeconds: 300, searchWindowMinutes: 30, travelBufferMinutes: 20 }))
  check('bookings_cannot_open_with_draft_prices', opening !== null)

  const catalog = await superAdmin.api.adminCatalog()
  for (const service of catalog.services) {
    await superAdmin.api.adminSaveService({
      p_id: service.id, p_key: service.key, p_category: service.category, p_name: service.name, p_description: service.description, p_image_url: service.image_url,
      p_requirements: service.requirements, p_base_price_cents: 50000, p_duration_minutes: service.duration_minutes, p_is_active: service.is_active, p_price_is_draft: false, p_sort_order: service.sort_order,
    })
  }
  for (const addon of catalog.addons) {
    await superAdmin.api.adminSaveAddon({
      p_id: addon.id, p_key: addon.key, p_name: addon.name, p_description: addon.description, p_price_cents: 10000, p_duration_minutes: addon.duration_minutes,
      p_is_active: addon.is_active, p_price_is_draft: false, p_sort_order: addon.sort_order,
    })
  }
  const services = await customer.api.listServices()
  const service = services.find((candidate) => candidate.supportedVehicles.includes('sedan'))
  check('final_prices_visible_to_customer', service !== undefined && !service.priceIsDraft)
  const closed = await refused(() => customer.api.createBooking(bookingInput(service, new Date(Date.now() + 864e5).toISOString(), shared.createBookingSubmissionKey(`closed-${runId}`))))
  check('booking_refused_while_closed', closed !== null)
  await superAdmin.api.adminUpdateRules({ bookingsOpen: true, commissionBps: 1000, requestTtlSeconds: 300, searchWindowMinutes: 30, travelBufferMinutes: 20 })
  check('bookings_open', (await anonApi.bookingsAreOpen()) === true)

  // Workers.
  const serviceIds = services.map((candidate) => candidate.id)
  const workerA = await readyWorker('workera', superAdmin.api, serviceIds)
  const workerB = await readyWorker('workerb', superAdmin.api, serviceIds)
  const account = await workerA.api.workerAccount(workerA.id)
  check('worker_account_reads_back', account?.verificationStatus === 'verified' && account.isOnline === true)
  check('worker_hours_read_back', (await workerA.api.workerHours()).length === 7)

  // Customer booking.
  const quote = await customer.api.quote(service.id, 'sedan', [])
  check('quote_is_server_price', quote.customerTotalCents >= 50000 && quote.priceIsDraft === false)
  const date = shared.upcomingManilaDates(3)[1]
  const slots = await customer.api.availableSlots({ date, serviceId: service.id, category: 'sedan', addonIds: [], ...BASE })
  const slot = slots.find((candidate) => candidate.isAvailable)
  check('slots_available_from_worker_hours', slot !== undefined, `${slots.length} slots`)
  const key = shared.createBookingSubmissionKey(`first-${runId}`)
  const booking = await customer.api.createBooking(bookingInput(service, slot.startsAt, key))
  check('booking_searching_for_worker', booking.status === 'searching_for_worker', booking.status)
  const repeat = await customer.api.createBooking(bookingInput(service, slot.startsAt, key))
  check('repeat_submission_returns_same_booking', repeat.id === booking.id)
  const mine = await customer.api.myBookings()
  check('customer_sees_one_booking_with_server_total', mine.length === 1 && mine[0].customerTotalCents === quote.customerTotalCents)
  check('other_customer_sees_none', (await otherCustomer.api.myBookings()).length === 0)
  const direct = await customer.client.from('service_bookings').insert({ customer_id: customer.id, customer_total_cents: 1 })
  check('direct_booking_insert_denied', direct.error !== null)

  // Dispatch privacy and atomic acceptance.
  const requestsA = await workerA.api.dispatchRequests()
  const requestsB = await workerB.api.dispatchRequests()
  check('both_workers_get_request', requestsA.length === 1 && requestsB.length === 1, `${requestsA.length}/${requestsB.length}`)
  const rawRequest = await workerA.client.rpc('my_dispatch_requests')
  check('request_hides_address_and_customer', !JSON.stringify(rawRequest.data).includes('SMOKEADDRESS') && !JSON.stringify(rawRequest.data).includes('Gate code') && !JSON.stringify(rawRequest.data).includes('Smoke customer'))
  check('worker_earnings_after_commission', requestsA[0].workerEarningsCents === Math.round(quote.customerTotalCents * 0.9), String(requestsA[0].workerEarningsCents))
  check('address_hidden_before_accept', !JSON.stringify(await workerA.api.assignedBookings()).includes('SMOKEADDRESS'))
  const race = await Promise.allSettled([workerA.api.acceptRequest(requestsA[0].id), workerB.api.acceptRequest(requestsB[0].id)])
  const winners = race.map((outcome, index) => (outcome.status === 'fulfilled' ? index : -1)).filter((index) => index >= 0)
  check('exactly_one_worker_wins_acceptance', winners.length === 1, race.map((outcome) => outcome.status).join(','))
  const winner = winners[0] === 0 ? workerA : workerB
  const loser = winners[0] === 0 ? workerB : workerA
  check('loser_request_closed', (await loser.api.dispatchRequests()).length === 0)
  check('loser_never_sees_address', !JSON.stringify(await loser.api.assignedBookings()).includes('SMOKEADDRESS'))
  const jobs = await winner.api.assignedBookings()
  check('winner_sees_address_after_accept', jobs.length === 1 && jobs[0].address === CUSTOMER_ADDRESS && jobs[0].instructions === 'Gate code 1234')
  const assignedView = (await customer.api.myBookings())[0]
  check('customer_sees_accepted_and_worker', assignedView.status === 'accepted' && assignedView.workerName !== '', `${assignedView.status}/${assignedView.workerName}`)

  // Status machine.
  check('loser_cannot_advance', (await refused(() => loser.api.advanceBooking(booking.id, 'accepted'))) !== null)
  check('customer_cannot_advance', (await refused(() => customer.api.advanceBooking(booking.id, 'accepted'))) !== null)
  check('stale_expected_status_refused', (await refused(() => winner.api.advanceBooking(booking.id, 'arrived'))) !== null)
  const reviewEarly = await refused(() => customer.api.reviewBooking(booking.id, 5, ''))
  check('review_refused_before_completion', reviewEarly !== null)
  let status = 'accepted'
  while (shared.nextWorkerStatus(status) !== null && shared.nextWorkerStatus(status) !== undefined) {
    await winner.api.advanceBooking(booking.id, status)
    status = shared.nextWorkerStatus(status)
  }
  const finished = (await customer.api.myBookings())[0]
  check('customer_sees_completed', finished.status === 'completed', finished.status)
  check('completed_cannot_be_cancelled', (await refused(() => customer.api.cancelBooking(booking.id))) !== null)
  await customer.api.reviewBooking(booking.id, 5, 'Great job')
  check('duplicate_review_refused', (await refused(() => customer.api.reviewBooking(booking.id, 1, ''))) !== null)
  check('review_recorded', (await customer.api.myBookings())[0].hasReview === true)
  const summary = await winner.api.workerSummary()
  check('worker_summary_counts_job', summary.completedCount === 1 && summary.earningsCents === Math.round(quote.customerTotalCents * 0.9), JSON.stringify(summary))

  // Cancellation, then the case view.
  const secondSlot = slots.filter((candidate) => candidate.isAvailable)[8] ?? slot
  const second = await customer.api.createBooking(bookingInput(service, secondSlot.startsAt, shared.createBookingSubmissionKey(`second-${runId}`)))
  await customer.api.cancelBooking(second.id)
  check('customer_cancelled_search', (await customer.api.myBookings()).find((item) => item.id === second.id)?.status === 'cancelled')
  check('offers_close_on_cancel', (await workerA.api.dispatchRequests()).length === 0)
  const adminSummary = await superAdmin.api.adminSummary()
  check('admin_summary_counts_completed', Number(adminSummary.bookings_completed) >= 1, JSON.stringify(adminSummary))
  const adminBookings = await superAdmin.api.adminBookings(null)
  check('admin_monitor_lists_bookings', adminBookings.some((row) => row.booking_id === booking.id))
  const caseFile = await superAdmin.api.adminBookingCase(booking.id)
  check('admin_case_has_history', Array.isArray(caseFile.events) && caseFile.events.length >= 5)
  check('admin_workers_lists_workers', (await superAdmin.api.adminWorkers()).some((row) => row.profile_id === workerA.id))

  // Account deletion: refused while work is active, then past bookings stay as anonymous records.
  const thirdSlot = slots.filter((candidate) => candidate.isAvailable)[12] ?? slot
  const third = await customer.api.createBooking(bookingInput(service, thirdSlot.startsAt, shared.createBookingSubmissionKey(`third-${runId}`)))
  check('customer_with_open_booking_cannot_delete', (await refused(() => customer.api.deleteMyAccount())) !== null)
  const [thirdRequest] = await winner.api.dispatchRequests()
  await winner.api.acceptRequest(thirdRequest.id)
  check('worker_with_active_job_cannot_delete', (await refused(() => winner.api.deleteMyAccount())) !== null)
  await customer.api.cancelBooking(third.id)
  await customer.api.deleteMyAccount()
  createdUserIds.splice(createdUserIds.indexOf(customer.id), 1)
  check('deleted_customer_sign_in_is_gone', (await admin.auth.admin.getUserById(customer.id)).error !== null)
  const retained = await superAdmin.api.adminBookingCase(booking.id)
  check('deleted_customer_booking_is_kept_with_its_price', retained.booking.customer_total_cents === quote.customerTotalCents && retained.booking.status === 'completed')
  check('deleted_customer_link_location_and_vehicle_are_gone', retained.booking.customer_id === null && retained.booking.address === 'Removed at customer request'
    && retained.booking.latitude === 0 && retained.booking.instructions === '' && retained.booking.vehicle_make === 'Removed', JSON.stringify(retained.booking))
  check('deleted_customer_review_keeps_rating_not_words', retained.review.comment === '' && retained.review.rating === 5)
  check('worker_history_no_longer_shows_customer_address', !JSON.stringify(await winner.api.assignedBookings()).includes('SMOKEADDRESS'))
  await winner.api.deleteMyAccount()
  createdUserIds.splice(createdUserIds.indexOf(winner.id), 1)
  const afterWorker = await superAdmin.api.adminBookingCase(booking.id)
  check('deleted_worker_link_is_gone_and_record_kept', afterWorker.booking.worker_id === null && afterWorker.booking.customer_total_cents === quote.customerTotalCents)
  check('deleted_worker_profile_is_gone', !(await superAdmin.api.adminWorkers()).some((row) => row.profile_id === winner.id))
  const serviceTokens = await admin.from('device_push_tokens').select('token').limit(1)
  const serviceBookings = await admin.from('service_bookings').select('id').limit(1)
  check('service_role_reaches_push_tokens_but_not_bookings', serviceTokens.error === null && serviceBookings.error !== null, serviceTokens.error?.message)

  await superAdmin.api.adminUpdateRules({ bookingsOpen: false, commissionBps: 0, requestTtlSeconds: 300, searchWindowMinutes: 30, travelBufferMinutes: 20 })
  check('bookings_closed_again', (await anonApi.bookingsAreOpen()) === false)
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
  const { error } = await admin.auth.admin.deleteUser(id)
  check('delete_synthetic_user', !error, error?.message)
}
console.log(`b2c-api-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 && crashed === null ? 0 : 1)
