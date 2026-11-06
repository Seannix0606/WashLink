import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AdminWorkerDocument } from '@washlink/shared'
import { formatManilaDateTime, isWorkerDocumentImageType, workerDocumentStatusLabel } from '@washlink/shared'
import { Badge, Button, Card } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { ReasonForm } from './ReasonForm'

const revokeWarning = 'Revoking a required document moves a verified washer to pending, closes their open requests and returns their unstarted jobs to search. On a started job, the washer loses customer details and job steps mid-wash, and the job waits until an admin cancels it or it becomes overdue.'
const reviewableStatuses: readonly AdminWorkerDocument['status'][] = ['submitted', 'approved', 'rejected']

interface DocumentRowProps {
  readonly document: AdminWorkerDocument
  readonly onChanged: () => Promise<void>
}

function DocumentRow({ document, onChanged }: DocumentRowProps): ReactElement {
  // imageUrl is a blob: URL over bytes held in this page. Null with isOpen means the file isn't an allowed image type, so it isn't shown.
  const [isOpen, setIsOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isBroken, setIsBroken] = useState(false)
  const isMounted = useRef(false)
  const [isOpening, setIsOpening] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const isUnderReview = document.status === 'submitted'
  const isApproved = document.status === 'approved'
  // Stricter than the server, which only needs this admin to have opened the file at some point (D-113).
  const isShowing = imageUrl !== null && isLoaded && !isBroken

  useEffect(() => {
    isMounted.current = true
    return (): void => { isMounted.current = false }
  }, [])

  // One place to let go of the bytes: on close, on a decision, on opening again, and on unmount.
  useEffect(() => {
    return (): void => {
      if (imageUrl !== null) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  const closeFile = (): void => {
    setIsOpen(false)
    setImageUrl(null)
    setIsLoaded(false)
    setIsBroken(false)
  }

  const open = async (): Promise<void> => {
    setIsOpening(true)
    closeFile()
    try {
      const { blob, contentType } = await getB2cApi().adminOpenWorkerDocument(document.documentId)
      if (isMounted.current) {
        setImageUrl(isWorkerDocumentImageType(contentType) ? URL.createObjectURL(new Blob([blob], { type: contentType ?? undefined })) : null)
        setIsOpen(true)
      }
      await onChanged()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setIsOpening(false)
    }
  }

  const approve = async (): Promise<void> => {
    setIsApproving(true)
    try {
      await getB2cApi().adminReviewWorkerDocument(document.documentId, 'approved')
      toast.success(`${document.label} approved. Verifying the washer is a separate step.`)
      closeFile()
      await onChanged()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setIsApproving(false)
    }
  }

  const reject = async (reason: string): Promise<void> => {
    await getB2cApi().adminReviewWorkerDocument(document.documentId, 'rejected', reason)
    toast.success(isApproved ? `${document.label} approval revoked` : `${document.label} rejected`)
    setIsRejecting(false)
    closeFile()
    await onChanged()
  }

  return (
    <Card className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-[var(--color-ink-900)]">{document.label}</h4>
        <Badge tone={isApproved ? 'success' : document.status === 'rejected' ? 'danger' : 'info'}>{workerDocumentStatusLabel(document.status)}</Badge>
      </div>
      {document.submittedAt !== null ? <p className="text-xs text-[var(--color-ink-500)]">Sent {formatManilaDateTime(document.submittedAt)}</p> : null}
      {document.reviewReason !== null ? <p className="text-[var(--color-ink-700)]">Reason given: {document.reviewReason}</p> : null}

      {!isOpen ? (
        <Button size="sm" variant="secondary" isLoading={isOpening} onClick={(): void => void open()}>Open {document.label}</Button>
      ) : (
        <div className="space-y-2">
          {/* The only place a file is shown, and only in an image element: never an iframe, an object or a new window. */}
          {imageUrl !== null && !isBroken ? (
            <img src={imageUrl} alt={`${document.label} from ${document.workerName || 'this washer'}`}
              className="max-h-96 max-w-full rounded-[var(--radius-control)] border border-[var(--color-ink-200)]"
              onLoad={(): void => { setIsLoaded(true) }}
              onError={(): void => { setIsLoaded(false); setIsBroken(true) }} />
          ) : (
            <p role="alert" className="text-[var(--color-danger-600)]">This file can&apos;t be shown as an image, so it may not be a real photo. Consider rejecting it.</p>
          )}
          <p className="text-xs text-[var(--color-ink-500)]">Opening this file was recorded in the audit log.</p>
          <Button size="sm" variant="ghost" onClick={closeFile}>Close file</Button>
        </div>
      )}

      {isRejecting ? (
        <ReasonForm id={`document-reason-${document.documentId}`} label={isApproved ? 'Reason for revoking' : 'Reason for rejecting'}
          confirmLabel={isApproved ? 'Confirm revoke' : 'Confirm rejection'} cancelLabel="Keep document" warning={isApproved && document.isRequired ? revokeWarning : undefined}
          onConfirm={reject} onCancel={(): void => { setIsRejecting(false) }} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {isUnderReview ? <Button size="sm" isLoading={isApproving} disabled={!isShowing} onClick={(): void => void approve()}>Approve {document.label}</Button> : null}
          {isUnderReview ? <Button size="sm" variant="secondary" onClick={(): void => { setIsRejecting(true) }}>Reject {document.label}</Button> : null}
          {isApproved ? <Button size="sm" variant="secondary" onClick={(): void => { setIsRejecting(true) }}>Revoke {document.label}</Button> : null}
        </div>
      )}
      {isUnderReview && !isOpen ? <p className="text-xs text-[var(--color-ink-500)]">Open this document before approving it.</p> : null}
    </Card>
  )
}

interface WorkerDocumentReviewProps {
  readonly documents: readonly AdminWorkerDocument[]
  readonly onChanged: () => Promise<void>
}

/** The database checks the role, audits each opening and decides each review. Approving never verifies the washer (D-112). */
export function WorkerDocumentReview({ documents, onChanged }: WorkerDocumentReviewProps): ReactElement {
  const reviewable = documents.filter((document) => reviewableStatuses.includes(document.status))
  if (reviewable.length === 0) {
    return <p className="text-sm text-[var(--color-ink-700)]">This washer has no documents to review.</p>
  }
  return (
    <div className="w-full space-y-2">
      {reviewable.map((document) => <DocumentRow key={document.documentId} document={document} onChanged={onChanged} />)}
    </div>
  )
}
