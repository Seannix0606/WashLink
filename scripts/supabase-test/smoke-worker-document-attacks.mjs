// B2C-7: guessed paths, invented names, traversal, wrong types and sizes, overwrites, and refusals by role. Called by b2c7-api-smoke, which owns
// the stack settings and the checks. Local stack only; every file is synthetic. D-118 and D-124 mean each of these fails at a storage policy.

import { beginWorkerDocument, SMOKE_JPEG, SMOKE_PNG, submitWorkerDocument, uploadWorkerDocument, WORKER_DOCUMENT_BUCKET as BUCKET } from './smoke-worker-documents.mjs'

const encoder = new TextEncoder()
const HTML_BYTES = encoder.encode('<html><script>document.title="SMOKE"</script></html>')
const SVG_BYTES = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')
const PDF_BYTES = encoder.encode('%PDF-1.7 synthetic')

export async function pathAndTypeAttacks(ctx, { check, trusted, shared, service, newClient, anonKey, open, objectExists, docStatus, signedUrl, statusOf, newName, bucketOf }) {
  // Storage answers a policy refusal with this status and message. Any other failure, such as a bad path, is not the refusal under test.
  const refusedByPolicy = (error) => statusOf(error) === '403' && /row-level security/.test(error?.message ?? '')
  const { admin, w1, w2, customer } = ctx
  const victim = await uploadWorkerDocument(w2.client, 'government_id')
  const stranger = bucketOf(w1.client)
  const guessDownload = await stranger.download(victim.objectName)
  check('guessed_path_download_refused', guessDownload.error !== null && guessDownload.data === null, statusOf(guessDownload.error))
  check('guessed_path_signed_url_refused', (await signedUrl(w1, victim.objectName)).error !== null)
  const upload = (client, name, bytes = SMOKE_JPEG, contentType = 'image/jpeg', options = {}) => bucketOf(client).upload(name, bytes, { contentType, upsert: false, ...options })
  const otherFolder = newName(w2.id)
  const otherFolderUpload = await upload(w1.client, otherFolder)
  check('upload_to_other_washers_folder_refused', refusedByPolicy(otherFolderUpload.error) && !objectExists(otherFolder), `${statusOf(otherFolderUpload.error)} ${otherFolderUpload.error?.message}`)
  const invented = newName(w1.id)
  check('upload_to_invented_name_in_own_folder_refused', (await upload(w1.client, invented)).error !== null && !objectExists(invented))
  const targets = [newName(w2.id), `${w1.id}/x/${crypto.randomUUID()}`]
  const traversal = [await upload(w1.client, `${w1.id}/../${targets[0]}`), await upload(w1.client, `${w1.id}/%2e%2e/${targets[0]}`), await upload(w1.client, targets[1])]
  check('traversal_path_refused', traversal.every((r) => r.error !== null) && !objectExists(targets[0])
    && trusted(`select count(*) from storage.objects where bucket_id = '${BUCKET}' and name like :id || '/x/%'`, { id: w1.id }) === '0', traversal.map((r) => statusOf(r.error)).join(','))

  const slot = await beginWorkerDocument(w2.client, 'selfie')
  const oversize = await upload(w2.client, slot.objectName, new Uint8Array(11 * 1024 * 1024).fill(0xff))
  check('oversize_refused_413', statusOf(oversize.error) === '413', `${statusOf(oversize.error)} ${oversize.error?.message}`)
  check('shared_client_words_real_413', shared.workerDocumentUploadFailureMessage(oversize.error) === shared.workerDocumentTooLargeMessage, oversize.error?.message)
  for (const [name, bytes, type] of [['svg', SVG_BYTES, 'image/svg+xml'], ['html', HTML_BYTES, 'text/html'], ['pdf', PDF_BYTES, 'application/pdf']]) {
    const refused = await upload(w2.client, slot.objectName, bytes, type)
    check(`${name}_refused_415`, statusOf(refused.error) === '415' && !objectExists(slot.objectName), `${statusOf(refused.error)} ${refused.error?.message}`)
    check(`shared_client_words_real_415_${name}`, shared.workerDocumentUploadFailureMessage(refused.error) === shared.workerDocumentWrongTypeMessage, refused.error?.message)
  }

  // F5: Storage does not read bytes. The bucket list is the real control, and the type stays an image type on the way back.
  const lying = await upload(w2.client, slot.objectName, HTML_BYTES, 'image/jpeg')
  await submitWorkerDocument(w2.client, slot.documentId)
  await open(admin, slot.documentId)
  ctx.expiring = { objectName: slot.objectName, openedAt: Date.now() }
  const lyingServed = await bucketOf(admin.client).download(slot.objectName)
  check('lying_bytes_served_only_as_jpeg', lying.error === null && lyingServed.error === null && lyingServed.data.type.startsWith('image/jpeg'), lyingServed.data?.type ?? lyingServed.error?.message)

  const before = trusted(`select version from storage.objects where bucket_id = '${BUCKET}' and name = :name`, { name: victim.objectName })
  const unchanged = () => trusted(`select version from storage.objects where bucket_id = '${BUCKET}' and name = :name`, { name: victim.objectName }) === before
  check('upsert_over_submitted_refused', (await upload(w2.client, victim.objectName, SMOKE_PNG, 'image/png', { upsert: true })).error !== null && unchanged())
  check('update_over_submitted_refused', (await bucketOf(w2.client).update(victim.objectName, SMOKE_PNG, { contentType: 'image/png' })).error !== null && unchanged())
  const openSlot = await beginWorkerDocument(w2.client, 'government_id')
  check('upsert_signed_upload_url_refused', (await bucketOf(w2.client).createSignedUploadUrl(openSlot.objectName, { upsert: true })).error !== null)
  const removal = await bucketOf(w2.client).remove([victim.objectName])
  check('washer_remove_removes_nothing', (removal.data ?? []).length === 0 && objectExists(victim.objectName), removal.error?.message)

  check('non_admin_signed_url_refused', (await signedUrl(customer, victim.objectName)).error !== null && (await signedUrl(w2, victim.objectName)).error !== null)
  check('admin_signed_url_refused_without_open', (await signedUrl(admin, victim.objectName)).error !== null)
  const customerFolder = newName(customer.id)
  const customerUploads = [await upload(customer.client, customerFolder), await upload(customer.client, openSlot.objectName)]
  check('customer_upload_refused', customerUploads.every((r) => refusedByPolicy(r.error)) && !objectExists(customerFolder) && !objectExists(openSlot.objectName), customerUploads.map((r) => `${statusOf(r.error)} ${r.error?.message}`).join(' | '))
  check('customer_read_refused', (await bucketOf(customer.client).download(victim.objectName)).error !== null && ((await bucketOf(customer.client).list(w2.id)).data ?? []).length === 0)
  const anon = newClient(anonKey)
  const anonUpload = await upload(anon, openSlot.objectName)
  const anonDownload = await bucketOf(anon).download(victim.objectName)
  const anonRead = await anon.rpc('my_worker_documents')
  const anonBegin = await anon.rpc('begin_worker_document_upload', { p_document_type: 'selfie' })
  check('anon_refused', refusedByPolicy(anonUpload.error) && !objectExists(openSlot.objectName) && statusOf(anonDownload.error) === '404' && anonDownload.data === null
    && anonRead.error?.code === '42501' && anonBegin.error?.code === '42501', `upload=${statusOf(anonUpload.error)} ${anonUpload.error?.message} download=${statusOf(anonDownload.error)} read=${anonRead.error?.code} begin=${anonBegin.error?.code}`)
  const viaRest = await w2.client.schema('storage').from('objects').select('name').limit(1)
  check('storage_schema_refused_through_postgrest', viaRest.error !== null, viaRest.error?.message)
  const write = (client) => client.from('independent_worker_documents').update({ status: 'approved' }).eq('id', victim.documentId).select('id')
  check('direct_table_write_refused', (await write(w2.client)).error !== null && (await write(admin.client)).error !== null && docStatus(victim.documentId) === 'submitted')
  check('service_role_table_write_refused', (await write(service)).error !== null && docStatus(victim.documentId) === 'submitted')
  check('job_functions_refused_for_admin_client', (await admin.client.rpc('worker_document_files_claim', { p_limit: 1 })).error?.code === '42501')
}
