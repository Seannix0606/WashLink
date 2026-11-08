// B2C-7 fix cycle 1: the storage routes other than plain upload and download, and an in-flight upload racing a finished one. Each route is
// expected to fail, because each storage policy allows exactly one operation (D-118, D-124). Called by b2c7-api-smoke, which owns the checks.
// Local stack only. The slow upload runs inside the local Storage container, because Kong buffers a request body, so a slow client outside
// would not reach Storage until it had finished sending. The washer's token is passed to that local container's process and nowhere else.

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'

import { beginWorkerDocument, submitWorkerDocument, SMOKE_JPEG, SMOKE_PNG, WORKER_DOCUMENT_BUCKET as BUCKET } from './smoke-worker-documents.mjs'

/** A signed S3 request in the user-session form: access key is the tenant, secret is the anon key, session token is the user's JWT. */
async function s3Request(apiUrl, anonKey, jwt, method, key, body) {
  const url = new URL(`${apiUrl}/storage/v1/s3/${BUCKET}/${key}`)
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = stamp.slice(0, 8)
  const payloadHash = crypto.createHash('sha256').update(body ?? '').digest('hex')
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp, 'x-amz-security-token': jwt, ...(body ? { 'content-type': 'image/jpeg' } : {}) }
  const names = Object.keys(headers).sort()
  const canonical = [method, url.pathname, '', ...names.map((name) => `${name}:${headers[name]}`), '', names.join(';'), payloadHash].join('\n')
  const scope = `${day}/local/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n')
  const hmac = (key_, data) => crypto.createHmac('sha256', key_).update(data).digest()
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${anonKey}`, day), 'local'), 's3'), 'aws4_request')
  const signature = crypto.createHmac('sha256', signingKey).update(toSign).digest('hex')
  const response = await fetch(url, { method, body, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=stub/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` } })
  return { status: response.status, body: await response.text() }
}

async function tusCreate(apiUrl, anonKey, jwt, objectName) {
  const encode = (value) => Buffer.from(value).toString('base64')
  const response = await fetch(`${apiUrl}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Tus-Resumable': '1.0.0', 'Upload-Length': String(SMOKE_JPEG.length),
      'Upload-Metadata': `bucketName ${encode(BUCKET)},objectName ${encode(objectName)},contentType ${encode('image/jpeg')}` },
  })
  return { status: response.status, body: await response.text() }
}

const SLOW_UPLOAD_SCRIPT = `
const http = require('http')
const [name, firstHex, restHex] = process.argv.slice(1)
const first = Buffer.from(firstHex, 'hex'), rest = Buffer.from(restHex, 'hex')
const request = http.request({ host: '127.0.0.1', port: 5000, method: 'POST', path: '/object/${BUCKET}/' + name,
  headers: { authorization: 'Bearer ' + process.env.WL_JWT, 'content-type': 'image/png', 'content-length': first.length + rest.length } }, (response) => {
  let body = ''
  response.on('data', (chunk) => { body += chunk })
  response.on('end', () => { console.log('RESULT ' + response.statusCode + ' ' + body); process.exit(0) })
})
request.on('error', (error) => { console.log('RESULT error ' + error.message); process.exit(0) })
request.write(first, () => console.log('STARTED'))
process.stdin.once('data', () => request.end(rest))
`

/** Starts an upload that sends its first half and waits. `finish()` sends the rest and resolves with Storage's answer. */
function startSlowUpload(storageContainer, jwt, objectName, bytes) {
  const half = Math.floor(bytes.length / 2)
  const child = spawn('docker', ['exec', '-i', '-e', `WL_JWT=${jwt}`, storageContainer, 'node', '-e', SLOW_UPLOAD_SCRIPT, objectName,
    Buffer.from(bytes.subarray(0, half)).toString('hex'), Buffer.from(bytes.subarray(half)).toString('hex')])
  let output = ''
  const waiters = []
  child.stdout.on('data', (chunk) => {
    output += chunk
    for (const waiter of [...waiters]) waiter()
  })
  const lineMatching = (pattern) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`slow upload: no ${pattern} in ${output}`)), 30000)
    const look = () => {
      const match = output.match(pattern)
      if (match) {
        clearTimeout(timer)
        resolve(match[0])
      }
    }
    waiters.push(look)
    look()
  })
  return {
    started: () => lineMatching(/STARTED/),
    finish: async () => {
      child.stdin.write('go\n')
      return lineMatching(/RESULT .*/)
    },
  }
}

export async function routeAttacks({ apiUrl, anonKey, check, trusted, storageContainer, admin, washer, otherWasher, open, objectExists, sleep }) {
  const bucket = (client) => client.storage.from(BUCKET)
  const jwtOf = async (person) => (await person.client.auth.getSession()).data.session.access_token
  const washerJwt = await jwtOf(washer)
  const adminJwt = await jwtOf(admin)
  const versionOf = (name) => trusted(`select coalesce(version, '') from storage.objects where bucket_id = '${BUCKET}' and name = :name`, { name })

  // A slot is open and the file is submitted, so each route has a real target it would otherwise reach.
  const slot = await beginWorkerDocument(washer.client, 'selfie')
  const tus = await tusCreate(apiUrl, anonKey, washerJwt, slot.objectName)
  check('tus_upload_to_own_open_slot_refused', tus.status >= 400 && !objectExists(slot.objectName), `${tus.status} ${tus.body.slice(0, 120)}`)
  console.log(`note   tus create on own open slot: ${tus.status} ${tus.body.slice(0, 120)}`)
  const plainToken = await bucket(washer.client).createSignedUploadUrl(slot.objectName)
  check('signed_upload_token_refused_at_mint', plainToken.error !== null, plainToken.error?.message)

  const s3Put = await s3Request(apiUrl, anonKey, washerJwt, 'PUT', slot.objectName, Buffer.from(SMOKE_JPEG))
  console.log(`note   s3 put on own open slot: ${s3Put.status} ${s3Put.body.replace(/[ \n]+/g, ' ').slice(0, 220)}`)
  // A bad signature would also fail. These two prove the request got as far as the policy, so the refusal is the one this test is about.
  const s3Reached = !/SignatureDoesNotMatch|InvalidAccessKeyId/.test(s3Put.body)
  check('s3_upload_to_own_open_slot_refused', s3Put.status >= 400 && s3Reached && !objectExists(slot.objectName), `${s3Put.status} ${s3Put.body.slice(0, 200)}`)

  const { error: uploadError } = await bucket(washer.client).upload(slot.objectName, SMOKE_JPEG, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw new Error(`plain upload refused: ${uploadError.message}`)
  await submitWorkerDocument(washer.client, slot.documentId)
  const pinned = versionOf(slot.objectName)
  await open(admin, slot.documentId)
  const inWindow = await bucket(admin.client).download(slot.objectName)
  check('admin_window_is_open_for_the_route_checks', inWindow.error === null, inWindow.error?.message)

  const s3Get = await s3Request(apiUrl, anonKey, adminJwt, 'GET', slot.objectName)
  check('s3_read_in_admin_window_refused', s3Get.status >= 400 && !/SignatureDoesNotMatch|InvalidAccessKeyId/.test(s3Get.body), `${s3Get.status} ${s3Get.body.slice(0, 160)}`)
  console.log(`note   s3 get in admin window: ${s3Get.status} ${s3Get.body.replace(/[ \n]+/g, ' ').slice(0, 220)}`)
  const s3Delete = await s3Request(apiUrl, anonKey, washerJwt, 'DELETE', slot.objectName)
  check('s3_delete_removes_nothing', objectExists(slot.objectName), `${s3Delete.status} ${s3Delete.body.slice(0, 160)}`)

  console.log(`note   s3 delete of own file: ${s3Delete.status} ${s3Delete.body.replace(/[ \n]+/g, ' ').slice(0, 160)}`)
  const nextSlot = await beginWorkerDocument(washer.client, 'government_id')
  const copyRefused = async (person, to) => (await bucket(person.client).copy(slot.objectName, to)).error !== null && !objectExists(to)
  check('washer_copy_into_own_open_slot_refused', await copyRefused(washer, nextSlot.objectName))
  check('admin_copy_in_window_refused', await copyRefused(admin, nextSlot.objectName))
  const moveRefused = async (person, to) => (await bucket(person.client).move(slot.objectName, to)).error !== null && !objectExists(to) && versionOf(slot.objectName) === pinned
  check('washer_move_of_own_file_refused', await moveRefused(washer, nextSlot.objectName))
  check('admin_move_in_window_refused', await moveRefused(admin, nextSlot.objectName))

  // The swap the pinned version guards against: a slow upload that passed the policy, then finishes after a fast one was submitted.
  const raceSlot = await beginWorkerDocument(otherWasher.client, 'selfie')
  const slow = startSlowUpload(storageContainer, await jwtOf(otherWasher), raceSlot.objectName, SMOKE_PNG)
  await slow.started()
  await sleep(1500)
  const { error: fastError } = await bucket(otherWasher.client).upload(raceSlot.objectName, SMOKE_JPEG, { contentType: 'image/jpeg', upsert: false })
  await submitWorkerDocument(otherWasher.client, raceSlot.documentId)
  const raceVersion = versionOf(raceSlot.objectName)
  const slowResult = await slow.finish()
  const reopened = await open(admin, raceSlot.documentId)
  const served = await bucket(admin.client).download(raceSlot.objectName)
  const servedBytes = served.data ? Buffer.from(await served.data.arrayBuffer()) : Buffer.alloc(0)
  console.log(`note   concurrent upload: fast error=${fastError?.message ?? 'none'}; slow ${slowResult}`)
  check('concurrent_slow_upload_cannot_swap_submitted_file', fastError === null && !/^RESULT 200/.test(slowResult) && versionOf(raceSlot.objectName) === raceVersion && reopened.error === null
    && Buffer.compare(servedBytes, Buffer.from(SMOKE_JPEG)) === 0, `${slowResult} ${reopened.error?.message ?? ''}`)

  // The same in-flight upload when its slot closes before it finishes: nothing reviewable can come of it, whether or not the bytes land.
  const closingSlot = await beginWorkerDocument(otherWasher.client, 'government_id')
  const stranded = startSlowUpload(storageContainer, await jwtOf(otherWasher), closingSlot.objectName, SMOKE_PNG)
  await stranded.started()
  await sleep(1500)
  await beginWorkerDocument(otherWasher.client, 'government_id')
  const strandedResult = await stranded.finish()
  const landedLate = objectExists(closingSlot.objectName)
  const lateSubmit = await otherWasher.client.rpc('submit_worker_document_upload', { p_document: closingSlot.documentId })
  console.log(`note   slow upload into a slot closed mid-flight: ${strandedResult}; file landed=${landedLate}; submit=${lateSubmit.error?.code ?? 'accepted'}`)
  check('slow_upload_into_closed_slot_refused_403', /^RESULT 400 /.test(strandedResult) && strandedResult.includes('"statusCode":"403"') && strandedResult.includes('row-level security') && !landedLate, `${strandedResult}; landed=${landedLate}`)
  check('slow_upload_into_closed_slot_cannot_be_submitted', lateSubmit.error?.code === '55000', strandedResult)
}
