import { B2cRequestError, genericB2cFailure, nullableStr, num, rows, str, type B2cSupabaseClient, type Row, type StorageFailure } from './b2cRequest'

/**
 * Washer verification documents, shared by web and mobile. No DOM and no React: bytes are ArrayBuffer or Uint8Array only.
 * These checks only give a friendly refusal early. The bucket's limits, its two storage policies and the database functions are
 * the real controls. The Storage service doesn't read bytes, so a lying file can still reach the bucket; the admin screen shows it as
 * an image only, and an admin sees it as broken and rejects it.
 */

/** Must match the bucket in 2026_11_06_b2cl_worker_documents_schema.sql. A test reads that file and compares them. */
export const WORKER_DOCUMENT_BUCKET = 'worker-verification-documents'
export const WORKER_DOCUMENT_MAX_BYTES = 10485760
export const WORKER_DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const
/** How long admin_open_worker_document's read window lasts, which the download must fall inside. No link to a file is signed (D-118). */
export const WORKER_DOCUMENT_READ_SECONDS = 60
export const WORKER_DOCUMENT_REASON_MIN = 10
export const WORKER_DOCUMENT_REASON_MAX = 500

export type WorkerDocumentContentType = (typeof WORKER_DOCUMENT_CONTENT_TYPES)[number]
export type WorkerDocumentStatus = 'awaiting_upload' | 'submitted' | 'approved' | 'rejected' | 'superseded' | 'abandoned'
export type WorkerVerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended'
export type WorkerDocumentBytes = ArrayBuffer | Uint8Array

export const workerDocumentTooLargeMessage = 'That photo is over 10 MB. Choose a smaller one.'
export const workerDocumentWrongTypeMessage = 'Upload a JPEG or PNG photo.'
export const workerDocumentHeicMessage = 'This photo is in HEIC format, which WashLink can\'t accept. Choose a JPEG or PNG photo instead.'
export const workerDocumentEmptyMessage = 'That file is empty. Choose another photo.'

/** Who sees the files and why. It says nothing about law, because no legal requirement has been established (B2C7-L1). */
export const WORKER_DOCUMENT_NOTICE = 'WashLink asks for these photos so an admin can review your washer account. Only WashLink\'s admin screen opens them for review, and each of those openings is recorded. People who run WashLink\'s systems could also reach the files. You can\'t view a photo again after uploading it. A photo can hold details such as where it was taken, and WashLink doesn\'t remove them. WashLink has not set a time limit for keeping these photos. They stay in private storage while your account is open. A replaced photo, or your photos after you delete your account, stay there until WashLink runs its removal job, which has no fixed date yet.'

/** One row per document type, as the washer sees it. It holds no path and no reviewer. */
export interface WorkerDocumentSlot {
  readonly documentType: string
  readonly label: string
  readonly instructions: string
  readonly isRequired: boolean
  readonly documentId: string | null
  readonly status: WorkerDocumentStatus | null
  readonly submittedAt: string | null
  readonly reviewedAt: string | null
  readonly reviewReason: string | null
  readonly hasApprovedCopy: boolean
}

export interface SubmittedWorkerDocument {
  readonly documentId: string
  readonly documentType: string
  readonly status: WorkerDocumentStatus
}

export interface AdminWorkerDocument {
  readonly documentId: string
  readonly workerId: string
  readonly workerName: string
  readonly documentType: string
  readonly label: string
  readonly isRequired: boolean
  readonly status: WorkerDocumentStatus
  readonly contentType: string | null
  readonly sizeBytes: number | null
  readonly createdAt: string
  readonly submittedAt: string | null
  readonly reviewedAt: string | null
  readonly reviewReason: string | null
  /** This admin opened the file, which approving needs (D-113). It proves the file was opened, not that it was examined. */
  readonly openedByMe: boolean
}

export interface WorkerDocumentOverview {
  readonly documentsToReview: number
  readonly filesWaitingForRemoval: number
  readonly oldestFileWaitingSince: string | null
}

/** The file itself, in memory. contentType is what the server read at submit, so use it rather than the blob's own type. */
export interface OpenedWorkerDocument {
  readonly blob: Blob
  readonly contentType: string | null
  readonly readOpenUntil: string
}

export interface WorkerDocumentBlocker {
  readonly documentType: string
  readonly label: string
  readonly detail: string
}

const asBytes = (bytes: WorkerDocumentBytes): Uint8Array => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean => signature.every((value, index) => bytes[index] === value)
const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])

function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') {
    return false
  }
  return heicBrands.has(String.fromCharCode(...bytes.subarray(8, 12)))
}

/** The content type comes from these bytes, never from a filename or a picker's report. Null means neither JPEG nor PNG. */
export function workerDocumentTypeFromBytes(bytes: WorkerDocumentBytes): WorkerDocumentContentType | null {
  const view = asBytes(bytes)
  if (view.length >= 3 && startsWith(view, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg'
  }
  if (view.length >= 8 && startsWith(view, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  return null
}

/** For checking a known size before reading a whole file into memory. */
export function workerDocumentSizeProblem(sizeBytes: number): string | null {
  if (sizeBytes <= 0) {
    return workerDocumentEmptyMessage
  }
  return sizeBytes > WORKER_DOCUMENT_MAX_BYTES ? workerDocumentTooLargeMessage : null
}

export function workerDocumentBytesProblem(bytes: WorkerDocumentBytes): string | null {
  const view = asBytes(bytes)
  const sizeProblem = workerDocumentSizeProblem(view.length)
  if (sizeProblem !== null) {
    return sizeProblem
  }
  if (isHeic(view)) {
    return workerDocumentHeicMessage
  }
  return workerDocumentTypeFromBytes(view) === null ? workerDocumentWrongTypeMessage : null
}

/** Counts as the database does, in characters and not UTF-16 units. Send the trimmed text. */
export function workerReviewReasonProblem(reason: string): string | null {
  const length = Array.from(reason.trim()).length
  return length < WORKER_DOCUMENT_REASON_MIN || length > WORKER_DOCUMENT_REASON_MAX ? 'Give a reason of 10 to 500 characters.' : null
}

const statusLabels: Readonly<Record<WorkerDocumentStatus, string>> = {
  awaiting_upload: 'Upload not finished',
  submitted: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  superseded: 'Replaced',
  abandoned: 'Upload not finished',
}

export function workerDocumentStatusLabel(status: WorkerDocumentStatus | null): string {
  return status === null ? 'Not uploaded' : statusLabels[status]
}

/** The admin screen shows a file only if it is one of these, and only in an image element. */
export function isWorkerDocumentImageType(contentType: string | null): boolean {
  return contentType === 'image/jpeg' || contentType === 'image/png'
}

/** A screen hint only: the storage policy and begin_worker_document_upload decide (D-111). Null means no profile has been saved. */
export function workerCanUploadDocuments(status: WorkerVerificationStatus | null): boolean {
  return status !== null && status !== 'suspended'
}

/** The washer stays verified on an approved copy while a replacement is reviewed or refused (D-110). */
export function workerDocumentApprovedCopyNote(slot: Pick<WorkerDocumentSlot, 'status' | 'hasApprovedCopy'>): string | null {
  return slot.hasApprovedCopy && slot.status !== 'approved' ? 'Your earlier approved photo still counts until a new one is approved.' : null
}

/**
 * admin_worker_documents lists only rows that exist and no RPC lists types to an admin, so a type with no row is known only from
 * this copy of the seed (D-109). A type added later by SQL may be missing here. Verify then stays enabled and the database refuses
 * it, which fails closed.
 */
const seededRequiredDocuments: readonly { readonly documentType: string; readonly label: string }[] = [
  { documentType: 'government_id', label: 'Government ID' },
  { documentType: 'selfie', label: 'Selfie' },
]

const blockerDetail = (latest: AdminWorkerDocument | undefined): string => {
  if (latest?.status === 'submitted') {
    return 'under review'
  }
  return latest?.status === 'rejected' ? 'rejected' : 'not uploaded'
}

/** Which required documents stop this washer being verified. For display: the database decides. Expects the newest row first. */
export function workerDocumentVerificationBlockers(documents: readonly AdminWorkerDocument[]): readonly WorkerDocumentBlocker[] {
  const required = new Map(seededRequiredDocuments.map((seed) => [seed.documentType, seed.label]))
  for (const row of documents) {
    if (row.isRequired) {
      required.set(row.documentType, row.label)
    } else {
      required.delete(row.documentType)
    }
  }
  return Array.from(required, ([documentType, label]) => {
    const ofType = documents.filter((row) => row.documentType === documentType)
    return { documentType, label, ofType }
  })
    .filter(({ ofType }) => !ofType.some((row) => row.status === 'approved'))
    .map(({ documentType, label, ofType }) => ({
      documentType,
      label,
      detail: blockerDetail(ofType.find((row) => row.status === 'submitted' || row.status === 'rejected')),
    }))
}

/** Exported so a smoke can feed it the real Storage service's errors. */
export function workerDocumentUploadFailureMessage(error: StorageFailure): string {
  const codes = [String(error.status ?? ''), String(error.statusCode ?? '')]
  if (codes.includes('413') || /maximum allowed size/i.test(error.message)) {
    return workerDocumentTooLargeMessage
  }
  if (codes.includes('415') || /mime type/i.test(error.message)) {
    return workerDocumentWrongTypeMessage
  }
  // No policy allows this slot any more: it expired, was replaced, or the account was paused meanwhile.
  if (codes.includes('401') || codes.includes('403') || codes.includes('409')) {
    return 'This upload is no longer open. Start again.'
  }
  return genericB2cFailure
}

const toAdminDocument = (r: Row): AdminWorkerDocument => ({
  documentId: str(r.document_id), workerId: str(r.worker_id), workerName: str(r.worker_name), documentType: str(r.document_type),
  label: str(r.label), isRequired: r.is_required === true, status: str(r.status) as WorkerDocumentStatus,
  contentType: nullableStr(r.content_type), sizeBytes: r.size_bytes === null || r.size_bytes === undefined ? null : num(r.size_bytes),
  createdAt: str(r.created_at), submittedAt: nullableStr(r.submitted_at), reviewedAt: nullableStr(r.reviewed_at),
  reviewReason: nullableStr(r.review_reason), openedByMe: r.opened_by_me === true,
})

export function createWorkerDocumentsApi(client: B2cSupabaseClient) {
  return {
    async myWorkerDocuments(): Promise<readonly WorkerDocumentSlot[]> {
      const result = await rows(client.rpc('my_worker_documents'))
      return result.map((r) => ({
        documentType: str(r.document_type), label: str(r.label), instructions: str(r.instructions), isRequired: r.is_required === true,
        documentId: nullableStr(r.document_id), status: nullableStr(r.status) as WorkerDocumentStatus | null,
        submittedAt: nullableStr(r.submitted_at), reviewedAt: nullableStr(r.reviewed_at), reviewReason: nullableStr(r.review_reason),
        hasApprovedCopy: r.has_approved_copy === true,
      }))
    },
    /**
     * Checks first, because each started upload counts towards the daily cap. There is no filename parameter: the server builds the
     * path, and the content type comes from the bytes. If this stops part way, the next attempt for that type closes the old slot.
     * cache-control: no-store is stored with the file and sent back on the admin's download, telling a browser not to keep a copy. It is the client's request: the database doesn't check it, so a custom client could send something else.
     */
    async uploadWorkerDocument(documentType: string, bytes: WorkerDocumentBytes): Promise<SubmittedWorkerDocument> {
      const problem = workerDocumentBytesProblem(bytes)
      const contentType = workerDocumentTypeFromBytes(bytes)
      if (problem !== null || contentType === null) {
        throw new B2cRequestError(problem ?? workerDocumentWrongTypeMessage)
      }
      const [slot] = await rows(client.rpc('begin_worker_document_upload', { p_document_type: documentType }))
      const { error } = await client.storage.from(WORKER_DOCUMENT_BUCKET).upload(str(slot?.object_name), bytes, { contentType, upsert: false, headers: { 'cache-control': 'no-store' } })
      if (error) {
        throw new B2cRequestError(workerDocumentUploadFailureMessage(error))
      }
      const [row] = await rows(client.rpc('submit_worker_document_upload', { p_document: slot?.document_id }))
      return { documentId: str(row?.document_id), documentType: str(row?.document_type), status: str(row?.status) as WorkerDocumentStatus }
    },
    async adminWorkerDocumentOverview(): Promise<WorkerDocumentOverview> {
      const [r] = await rows(client.rpc('admin_worker_document_overview'))
      return {
        documentsToReview: num(r?.documents_to_review), filesWaitingForRemoval: num(r?.files_waiting_for_removal),
        oldestFileWaitingSince: nullableStr(r?.oldest_file_waiting_since),
      }
    },
    /** Metadata only, so no file is read and nothing is audited. Null lists every document waiting for review. */
    async adminWorkerDocuments(workerId: string | null): Promise<readonly AdminWorkerDocument[]> {
      return (await rows(client.rpc('admin_worker_documents', { p_worker: workerId }))).map(toAdminDocument)
    },
    /**
     * The RPC writes the audit row and opens the read window, then the bytes are downloaded inside it. The storage policy allows only
     * this route, so no link to the file is signed. Show the file only in an image element, and drop it when the view closes.
     */
    async adminOpenWorkerDocument(documentId: string): Promise<OpenedWorkerDocument> {
      const [opened] = await rows(client.rpc('admin_open_worker_document', { p_document: documentId }))
      const { data, error } = await client.storage.from(WORKER_DOCUMENT_BUCKET).download(str(opened?.object_name))
      if (error || !data) {
        throw new B2cRequestError('This document could not be opened. Try again.')
      }
      return { blob: data, contentType: nullableStr(opened?.content_type), readOpenUntil: str(opened?.read_open_until) }
    },
    /** Approving never verifies the washer (D-112). A revoke is a rejection of an approved document, and the database handles the rest. */
    async adminReviewWorkerDocument(documentId: string, decision: 'approved' | 'rejected', reason?: string): Promise<{ readonly status: WorkerDocumentStatus; readonly verificationStatus: WorkerVerificationStatus }> {
      const [r] = await rows(client.rpc('admin_review_worker_document', { p_document: documentId, p_decision: decision, p_reason: reason?.trim() ?? null }))
      return { status: str(r?.status) as WorkerDocumentStatus, verificationStatus: str(r?.verification_status) as WorkerVerificationStatus }
    },
  }
}
