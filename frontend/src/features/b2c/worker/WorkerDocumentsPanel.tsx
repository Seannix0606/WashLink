import type { ChangeEvent, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { WorkerDocumentSlot, WorkerVerificationStatus } from '@washlink/shared'
import {
  WORKER_DOCUMENT_NOTICE,
  formatManilaDateTime,
  workerCanUploadDocuments,
  workerDocumentApprovedCopyNote,
  workerDocumentSizeProblem,
  workerDocumentStatusLabel,
} from '@washlink/shared'
import { Badge, Button, Card, Skeleton } from '../../../presentation/design/ui'
import type { BadgeTone } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'

const statusTone = (status: WorkerDocumentSlot['status']): BadgeTone => {
  if (status === 'approved') {
    return 'success'
  }
  if (status === 'rejected') {
    return 'danger'
  }
  return status === 'submitted' ? 'info' : 'neutral'
}

interface DocumentRowProps {
  readonly slot: WorkerDocumentSlot
  readonly canUpload: boolean
  readonly onChanged: () => Promise<void>
}

function DocumentRow({ slot, canUpload, onChanged }: DocumentRowProps): ReactElement {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = `worker-document-${slot.documentType}`
  const approvedCopyNote = workerDocumentApprovedCopyNote(slot)

  const choose = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    // Cleared so that choosing the same file again still fires a change.
    event.target.value = ''
    if (file === undefined) {
      return
    }
    // Checked before the file is read into memory. The shared upload checks the bytes.
    const sizeProblem = workerDocumentSizeProblem(file.size)
    if (sizeProblem !== null) {
      setError(sizeProblem)
      return
    }
    setIsUploading(true)
    setError(null)
    try {
      await getB2cApi().uploadWorkerDocument(slot.documentType, await file.arrayBuffer())
      toast.success(`${slot.label} sent for review`)
      await onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-[var(--color-ink-900)]">{slot.label}</h3>
        <Badge tone={statusTone(slot.status)}>{workerDocumentStatusLabel(slot.status)}</Badge>
      </div>
      <p className="text-[var(--color-ink-700)]">{slot.instructions}</p>
      {slot.isRequired ? <p className="text-xs text-[var(--color-ink-500)]">WashLink needs this before it can verify your account.</p> : null}
      {slot.submittedAt !== null ? <p className="text-xs text-[var(--color-ink-500)]">Sent {formatManilaDateTime(slot.submittedAt)}</p> : null}
      {slot.status === 'rejected' && slot.reviewReason !== null ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-2 text-[var(--color-ink-900)]">WashLink&apos;s reason: {slot.reviewReason}</p>
      ) : null}
      {approvedCopyNote !== null ? <p className="text-xs text-[var(--color-ink-700)]">{approvedCopyNote}</p> : null}
      {canUpload ? (
        <div className="space-y-1">
          <label htmlFor={inputId} className="block font-medium text-[var(--color-ink-900)]">
            <Upload aria-hidden className="mr-1 inline size-4" />
            {slot.status === null ? `Choose a photo of your ${slot.label}` : `Send a new photo of your ${slot.label}`}
          </label>
          <input id={inputId} type="file" accept="image/jpeg,image/png" disabled={isUploading} aria-describedby={`${inputId}-help`}
            className="block w-full text-sm text-[var(--color-ink-700)] file:mr-3 file:min-h-11 file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-brand-50)] file:px-3 file:font-medium file:text-[var(--color-brand-800)]"
            onChange={(event): void => void choose(event)} />
          <p id={`${inputId}-help`} className="text-xs text-[var(--color-ink-500)]">{isUploading ? 'Uploading…' : 'JPEG or PNG, up to 10 MB.'}</p>
        </div>
      ) : null}
      {error !== null ? <p role="alert" className="text-[var(--color-danger-600)]">{error}</p> : null}
    </Card>
  )
}

interface WorkerDocumentsPanelProps {
  /** Null until the washer has saved a profile. */
  readonly verificationStatus: WorkerVerificationStatus | null
}

/** Shows status only and never the file: a washer can't read an upload back (D-119). The server decides who can upload (D-111). */
export function WorkerDocumentsPanel({ verificationStatus }: WorkerDocumentsPanelProps): ReactElement {
  const [slots, setSlots] = useState<readonly WorkerDocumentSlot[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setSlots(await getB2cApi().myWorkerDocuments())
      setLoadError(null)
    } catch (caught) {
      setLoadError(errorMessage(caught))
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return (): void => { window.clearTimeout(timer) }
  }, [load])

  const canUpload = workerCanUploadDocuments(verificationStatus)

  return (
    <section aria-labelledby="worker-documents-title" className="space-y-3">
      <h2 id="worker-documents-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Verification photos</h2>
      <p className="text-sm text-[var(--color-ink-700)]">{WORKER_DOCUMENT_NOTICE}</p>
      {verificationStatus === null ? <p role="status" className="text-sm font-medium text-[var(--color-ink-900)]">Save your washer profile below first. You can upload these photos after that.</p> : null}
      {verificationStatus === 'suspended' ? <p role="status" className="text-sm font-medium text-[var(--color-ink-900)]">WashLink has paused your account, so you can&apos;t upload photos right now.</p> : null}
      {slots === null && loadError === null ? <Skeleton heightClassName="h-32" /> : null}
      {loadError !== null ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-[var(--color-danger-600)]">{loadError}</p>
          <Button size="sm" variant="secondary" onClick={(): void => void load()}>Try again</Button>
        </div>
      ) : null}
      {slots !== null && slots.length === 0 ? <p className="text-sm text-[var(--color-ink-700)]">WashLink isn&apos;t asking for any photos right now.</p> : null}
      {slots?.map((slot) => <DocumentRow key={slot.documentType} slot={slot} canUpload={canUpload} onChanged={load} />)}
    </section>
  )
}
