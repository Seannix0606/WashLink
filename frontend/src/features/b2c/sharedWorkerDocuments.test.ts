import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  B2cRequestError,
  WORKER_DOCUMENT_BUCKET,
  WORKER_DOCUMENT_CONTENT_TYPES,
  WORKER_DOCUMENT_MAX_BYTES,
  WORKER_DOCUMENT_READ_SECONDS,
  createB2cApi,
  workerCanUploadDocuments,
  workerDocumentApprovedCopyNote,
  workerDocumentBytesProblem,
  workerDocumentEmptyMessage,
  workerDocumentHeicMessage,
  workerDocumentSizeProblem,
  workerDocumentStatusLabel,
  workerDocumentTooLargeMessage,
  workerDocumentTypeFromBytes,
  workerDocumentUploadFailureMessage,
  workerDocumentVerificationBlockers,
  workerDocumentWrongTypeMessage,
  workerReviewReasonProblem,
  type AdminWorkerDocument,
  type B2cSupabaseClient,
} from '@washlink/shared'

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const text = (value: string): Uint8Array => new TextEncoder().encode(value)
const heic = Uint8Array.from([0, 0, 0, 24, ...text('ftypheic'), 0, 0, 0, 0])
const avif = Uint8Array.from([0, 0, 0, 24, ...text('ftypavif'), 0, 0, 0, 0])
const sized = (length: number, head: Uint8Array = jpeg): Uint8Array => {
  const bytes = new Uint8Array(length)
  bytes.set(head)
  return bytes
}

describe('worker document type from bytes', () => {
  it.each([
    ['JPEG', jpeg, 'image/jpeg'],
    ['PNG', png, 'image/png'],
    ['HTML', text('<html><script>1</script></html>'), null],
    ['SVG', text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), null],
    ['HEIC', heic, null],
    ['PDF', text('%PDF-1.7'), null],
    ['empty', new Uint8Array(0), null],
    ['two bytes of a JPEG signature', Uint8Array.from([0xff, 0xd8]), null],
    ['seven bytes of a PNG signature', png.subarray(0, 7), null],
  ])('reads %s', (_name, bytes, expected) => {
    expect(workerDocumentTypeFromBytes(bytes)).toBe(expected)
  })

  it('reads an ArrayBuffer as well as a Uint8Array', () => {
    expect(workerDocumentTypeFromBytes(Uint8Array.from(png).buffer)).toBe('image/png')
  })
})

describe('worker document checks', () => {
  it('allows exactly 10 MiB and refuses one byte more', () => {
    expect(WORKER_DOCUMENT_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(workerDocumentSizeProblem(WORKER_DOCUMENT_MAX_BYTES)).toBeNull()
    expect(workerDocumentSizeProblem(WORKER_DOCUMENT_MAX_BYTES + 1)).toBe(workerDocumentTooLargeMessage)
    expect(workerDocumentBytesProblem(sized(WORKER_DOCUMENT_MAX_BYTES))).toBeNull()
    expect(workerDocumentBytesProblem(sized(WORKER_DOCUMENT_MAX_BYTES + 1))).toBe(workerDocumentTooLargeMessage)
  })

  it('refuses nothing, and allows the smallest real signature', () => {
    expect(workerDocumentSizeProblem(0)).toBe(workerDocumentEmptyMessage)
    expect(workerDocumentBytesProblem(new Uint8Array(0))).toBe(workerDocumentEmptyMessage)
    expect(workerDocumentBytesProblem(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull()
  })

  it('names HEIC, and refuses every other format with the same sentence', () => {
    expect(workerDocumentBytesProblem(heic)).toBe(workerDocumentHeicMessage)
    for (const bytes of [avif, text('<html></html>'), text('<svg></svg>'), text('%PDF-1.7')]) {
      expect(workerDocumentBytesProblem(bytes)).toBe(workerDocumentWrongTypeMessage)
    }
  })

  it('matches the bucket the migration creates', () => {
    const migration = readFileSync('../supabase/migrations/2026_11_06_b2cl_worker_documents_schema.sql', 'utf8')
    const types = WORKER_DOCUMENT_CONTENT_TYPES.map((type) => `'${type}'`).join(', ')
    expect(migration).toContain(`values ('${WORKER_DOCUMENT_BUCKET}', '${WORKER_DOCUMENT_BUCKET}', false, ${String(WORKER_DOCUMENT_MAX_BYTES)}, array[${types}])`)
  })

  it.each([
    ['nine characters', '123456789', false],
    ['ten characters', '1234567890', true],
    ['500 characters', 'x'.repeat(500), true],
    ['501 characters', 'x'.repeat(501), false],
    ['spaces around too few', '   123456789   ', false],
    ['spaces around enough', '   1234567890   ', true],
    ['five emoji, which is ten UTF-16 units', '😀'.repeat(5), false],
    ['500 emoji, counted as the database counts', '😀'.repeat(500), true],
  ])('checks a reason of %s', (_name, reason, isFine) => {
    expect(workerReviewReasonProblem(reason) === null).toBe(isFine)
  })

  it('stops only a suspended washer or one with no profile from uploading', () => {
    expect(['pending', 'rejected', 'verified', 'suspended', null].map((status) => workerCanUploadDocuments(status as 'pending' | null)))
      .toEqual([true, true, true, false, false])
  })

  it('labels every status, and says an approved copy still counts only when one exists', () => {
    expect(workerDocumentStatusLabel(null)).toBe('Not uploaded')
    expect(workerDocumentStatusLabel('submitted')).toBe('Under review')
    expect(workerDocumentApprovedCopyNote({ status: 'rejected', hasApprovedCopy: true })).toMatch(/still counts/)
    expect(workerDocumentApprovedCopyNote({ status: 'rejected', hasApprovedCopy: false })).toBeNull()
    expect(workerDocumentApprovedCopyNote({ status: 'approved', hasApprovedCopy: true })).toBeNull()
  })

  it('stays free of the DOM and React', () => {
    for (const file of ['workerDocuments.ts', 'b2cRequest.ts']) {
      expect(readFileSync(`../packages/shared/src/${file}`, 'utf8')).not.toMatch(/from .react|document\.|window\./)
    }
  })
})

interface FakeClient {
  readonly client: B2cSupabaseClient
  readonly calls: string[]
  readonly rpc: ReturnType<typeof vi.fn>
  readonly upload: ReturnType<typeof vi.fn>
  readonly from: ReturnType<typeof vi.fn>
  readonly download: ReturnType<typeof vi.fn>
}

const fileBlob = new Blob([Uint8Array.from([0x89, 0x50])], { type: 'application/octet-stream' })

function fakeClient(options: { uploadError?: { message: string; status?: number; statusCode?: string }; downloadError?: boolean } = {}): FakeClient {
  const calls: string[] = []
  const rpc = vi.fn((name: string, args?: Record<string, unknown>) => {
    calls.push(name)
    if (name === 'begin_worker_document_upload') {
      return Promise.resolve({ data: [{ document_id: 'doc-1', object_name: 'worker-1/doc-1' }], error: null })
    }
    if (name === 'submit_worker_document_upload') {
      return Promise.resolve({ data: [{ document_id: args?.p_document, document_type: 'selfie', status: 'submitted' }], error: null })
    }
    if (name === 'admin_open_worker_document') {
      return Promise.resolve({ data: [{ object_name: 'worker-1/doc-1', content_type: 'image/png', read_open_until: '2026-11-06T00:01:00Z' }], error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })
  const upload = vi.fn(() => {
    calls.push('upload')
    return Promise.resolve({ data: {}, error: options.uploadError ?? null })
  })
  const download = vi.fn(() => {
    calls.push('download')
    return Promise.resolve(options.downloadError === true ? { data: null, error: { message: 'no' } } : { data: fileBlob, error: null })
  })
  const from = vi.fn(() => ({ upload, download }))
  return { client: { rpc, from: vi.fn(), storage: { from } } as unknown as B2cSupabaseClient, calls, rpc, upload, from, download }
}

describe('uploading a worker document', () => {
  it('begins, uploads to the server-built name with the sniffed type, then submits', async () => {
    const fake = fakeClient()
    const result = await createB2cApi(fake.client).uploadWorkerDocument('selfie', png)
    expect(fake.calls).toEqual(['begin_worker_document_upload', 'upload', 'submit_worker_document_upload'])
    expect(fake.rpc).toHaveBeenNthCalledWith(1, 'begin_worker_document_upload', { p_document_type: 'selfie' })
    expect(fake.from).toHaveBeenCalledWith(WORKER_DOCUMENT_BUCKET)
    expect(fake.upload).toHaveBeenCalledWith('worker-1/doc-1', png, { contentType: 'image/png', upsert: false, headers: { 'cache-control': 'no-store' } })
    expect(fake.rpc).toHaveBeenNthCalledWith(2, 'submit_worker_document_upload', { p_document: 'doc-1' })
    expect(result).toEqual({ documentId: 'doc-1', documentType: 'selfie', status: 'submitted' })
  })

  it('takes no filename', () => {
    expect(createB2cApi(fakeClient().client).uploadWorkerDocument.length).toBe(2)
  })

  it.each([
    ['HEIC', heic, workerDocumentHeicMessage],
    ['HTML named anything', text('<html></html>'), workerDocumentWrongTypeMessage],
    ['oversize', sized(WORKER_DOCUMENT_MAX_BYTES + 1), workerDocumentTooLargeMessage],
    ['empty', new Uint8Array(0), workerDocumentEmptyMessage],
  ])('refuses %s before starting a slot, because slots count towards the daily cap', async (_name, bytes, message) => {
    const fake = fakeClient()
    await expect(createB2cApi(fake.client).uploadWorkerDocument('selfie', bytes)).rejects.toThrow(message)
    expect(fake.calls).toEqual([])
  })

  it.each([
    ['413 on the HTTP status', { message: 'x', status: 413 }, workerDocumentTooLargeMessage],
    ['413 in the service code', { message: 'x', status: 400, statusCode: '413' }, workerDocumentTooLargeMessage],
    ['415 on the HTTP status', { message: 'x', status: 415 }, workerDocumentWrongTypeMessage],
    ['415 in the service code', { message: 'x', status: 400, statusCode: '415' }, workerDocumentWrongTypeMessage],
    ['a closed slot', { message: 'new row violates row-level security policy', status: 400, statusCode: '403' }, 'This upload is no longer open. Start again.'],
  ])('words %s and does not submit', async (_name, uploadError, message) => {
    const fake = fakeClient({ uploadError })
    const failure = createB2cApi(fake.client).uploadWorkerDocument('selfie', jpeg)
    await expect(failure).rejects.toBeInstanceOf(B2cRequestError)
    await expect(failure).rejects.toThrow(message)
    expect(fake.calls).not.toContain('submit_worker_document_upload')
  })

  it('never shows an unknown storage message', () => {
    expect(workerDocumentUploadFailureMessage({ message: 'internal table storage.objects exploded', status: 500 })).not.toMatch(/storage\.objects/)
  })

  it('passes a written database refusal through', async () => {
    const fake = fakeClient()
    const refusal = 'WashLink has paused your account, so you can\'t upload documents right now.'
    fake.rpc.mockReturnValueOnce(Promise.resolve({ data: null, error: { message: refusal, code: '23514' } }) as never)
    await expect(createB2cApi(fake.client).uploadWorkerDocument('selfie', jpeg)).rejects.toThrow(refusal)
    expect(fake.upload).not.toHaveBeenCalled()
  })
})

describe('opening a worker document', () => {
  it('runs the audited RPC first, then downloads, and takes the type from the RPC', async () => {
    const fake = fakeClient()
    const opened = await createB2cApi(fake.client).adminOpenWorkerDocument('doc-1')
    expect(fake.calls).toEqual(['admin_open_worker_document', 'download'])
    expect(fake.from).toHaveBeenCalledWith(WORKER_DOCUMENT_BUCKET)
    expect(fake.download).toHaveBeenCalledWith('worker-1/doc-1')
    expect(opened).toEqual({ blob: fileBlob, contentType: 'image/png', readOpenUntil: '2026-11-06T00:01:00Z' })
    expect(opened).not.toHaveProperty('url')
  })

  it('matches the read window the migration opens', () => {
    expect(WORKER_DOCUMENT_READ_SECONDS).toBe(60)
    expect(readFileSync('../supabase/migrations/2026_11_06_b2cm_worker_document_rpcs.sql', 'utf8')).toContain("window_end timestamptz := now() + interval '60 seconds'")
  })

  it('says so when the download fails', async () => {
    await expect(createB2cApi(fakeClient({ downloadError: true }).client).adminOpenWorkerDocument('doc-1')).rejects.toThrow('could not be opened')
  })

  it('sends a trimmed reason, and null when approving', async () => {
    const fake = fakeClient()
    const api = createB2cApi(fake.client)
    await api.adminReviewWorkerDocument('doc-1', 'rejected', '  Too dark to read  ')
    await api.adminReviewWorkerDocument('doc-1', 'approved')
    expect(fake.rpc).toHaveBeenNthCalledWith(1, 'admin_review_worker_document', { p_document: 'doc-1', p_decision: 'rejected', p_reason: 'Too dark to read' })
    expect(fake.rpc).toHaveBeenNthCalledWith(2, 'admin_review_worker_document', { p_document: 'doc-1', p_decision: 'approved', p_reason: null })
  })
})

describe('database refusals', () => {
  const migrations = ['b2cm_worker_document_rpcs', 'b2cn_worker_verification_gate'].map((name) => readFileSync(`../supabase/migrations/2026_11_06_${name}.sql`, 'utf8')).join('\n')
  const refuses = (message: string, code = '23514'): B2cSupabaseClient => ({
    rpc: () => Promise.resolve({ data: null, error: { message, code } }), from: vi.fn(), storage: { from: vi.fn() },
  }) as unknown as B2cSupabaseClient

  it.each<[string, (api: ReturnType<typeof createB2cApi>) => Promise<unknown>]>([
    ["WashLink isn't accepting verification documents yet. Try again later.", (api): Promise<unknown> => api.uploadWorkerDocument('selfie', jpeg)],
    ['You have opened 60 documents in the last hour. Try again later.', (api): Promise<unknown> => api.adminOpenWorkerDocument('d1')],
    ["You can't open or review your own documents.", (api): Promise<unknown> => api.adminOpenWorkerDocument('d1')],
    ["You can't open or review your own documents.", (api): Promise<unknown> => api.adminReviewWorkerDocument('d1', 'approved')],
    ["You can't review your own washer account.", (api): Promise<unknown> => api.adminReviewWorker('w1', 'verified', '')],
    ['This file changed after it was uploaded. Reject it and ask for a new one.', (api): Promise<unknown> => api.adminOpenWorkerDocument('d1')],
    ['This file changed after it was uploaded. Reject it and ask for a new one.', (api): Promise<unknown> => api.adminReviewWorkerDocument('d1', 'approved')],
    ['A document file changed after it was approved. Revoke it and ask for a new one before verifying this washer.', (api): Promise<unknown> => api.adminReviewWorker('w1', 'verified', '')],
  ])('shows as written: %s', async (message, call) => {
    expect(migrations).toContain(message.split("'").join("''"))
    await expect(call(createB2cApi(refuses(message)))).rejects.toMatchObject({ name: 'B2cRequestError', message })
  })
})

describe('what blocks verifying a washer', () => {
  const row = (documentType: string, status: AdminWorkerDocument['status'], isRequired = true): AdminWorkerDocument => ({
    documentId: `${documentType}-${status}`, workerId: 'w1', workerName: 'Wes', documentType, label: documentType, isRequired, status, contentType: 'image/jpeg',
    sizeBytes: 1, createdAt: '', submittedAt: null, reviewedAt: null, reviewReason: null, openedByMe: false,
  })
  const details = (documents: readonly AdminWorkerDocument[]): readonly string[] =>
    workerDocumentVerificationBlockers(documents).map((blocker) => `${blocker.documentType}:${blocker.detail}`)

  it('lists both seeded types when there are no rows', () => {
    expect(details([])).toEqual(['government_id:not uploaded', 'selfie:not uploaded'])
  })

  it('needs an approved row of each', () => {
    expect(details([row('government_id', 'approved'), row('selfie', 'submitted')])).toEqual(['selfie:under review'])
    expect(details([row('government_id', 'approved'), row('selfie', 'rejected')])).toEqual(['selfie:rejected'])
    expect(details([row('government_id', 'approved'), row('selfie', 'approved')])).toEqual([])
  })

  it('counts an approved copy even when a newer replacement was refused', () => {
    expect(details([row('selfie', 'rejected'), row('selfie', 'approved'), row('government_id', 'approved')])).toEqual([])
  })

  it('does not count unfinished or replaced rows', () => {
    expect(details([row('government_id', 'approved'), row('selfie', 'awaiting_upload'), row('selfie', 'superseded'), row('selfie', 'abandoned')])).toEqual(['selfie:not uploaded'])
  })

  it('follows what the rows say is required', () => {
    expect(details([row('police_clearance', 'submitted'), row('government_id', 'approved'), row('selfie', 'approved')])).toEqual(['police_clearance:under review'])
    expect(details([row('selfie', 'submitted', false), row('government_id', 'approved')])).toEqual([])
  })
})
