import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AdminWorkerDocument } from '@washlink/shared'
import { workerDocumentVerificationBlockers } from '@washlink/shared'
import { Badge, Button, Card, Skeleton } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { ReasonForm } from './ReasonForm'
import { WorkerDocumentReview } from './WorkerDocumentReview'

type Row = Record<string, unknown>
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')

interface WasherVerificationCardProps {
  readonly worker: Row
  /** A washer account WashLink runs itself: verified without documents (make_platform_operator). */
  readonly isPlatformOperator?: boolean
  /** Runs a status change and reports it, as the rest of the panel does. */
  readonly runAction: (action: () => Promise<void>, success: string) => Promise<void>
  readonly onChanged: () => Promise<void>
}

/** The blockers shown are a guide. The database refuses to verify until every required document is approved, whatever this shows. */
export function WasherVerificationCard({ worker, isPlatformOperator = false, runAction, onChanged }: WasherVerificationCardProps): ReactElement {
  const workerId = text(worker.profile_id)
  const status = text(worker.verification_status)
  const [documents, setDocuments] = useState<readonly AdminWorkerDocument[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isSuspending, setIsSuspending] = useState(false)

  const loadDocuments = useCallback(async (): Promise<void> => {
    try {
      setDocuments(await getB2cApi().adminWorkerDocuments(workerId))
      setLoadError(null)
    } catch (caught) {
      setLoadError(errorMessage(caught))
    }
  }, [workerId])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocuments(), 0)
    return (): void => { window.clearTimeout(timer) }
  }, [loadDocuments, status])

  const reload = async (): Promise<void> => {
    await Promise.all([loadDocuments(), onChanged()])
  }

  const blockers = documents === null ? null : workerDocumentVerificationBlockers(documents)
  const toReview = documents?.filter((document) => document.status === 'submitted').length ?? 0

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-[var(--color-ink-900)]">{text(worker.full_name) || 'Name not set'} <Badge tone={status === 'verified' ? 'success' : 'warning'}>{status}</Badge>{isPlatformOperator ? <> <Badge tone="info">WashLink operator</Badge></> : null}</p>
          <p className="text-[var(--color-ink-700)]">{[text(worker.phone_number), worker.has_service_area === true ? `${text(worker.service_radius_km)} km area` : 'No service area', `${text(worker.completed_count)} completed`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" aria-expanded={isReviewing} onClick={(): void => { setIsReviewing(!isReviewing) }}>
            {isReviewing ? 'Hide documents' : `Documents${toReview > 0 ? ` (${String(toReview)} to review)` : ''}`}
          </Button>
          {status !== 'verified' ? (
            <Button size="sm" disabled={blockers === null || blockers.length > 0} onClick={(): void => void runAction(() => getB2cApi().adminReviewWorker(workerId, 'verified', ''), 'Washer verified')}>Verify</Button>
          ) : null}
          {status === 'suspended' || status === 'rejected' ? (
            <Button size="sm" variant="secondary" onClick={(): void => void runAction(() => getB2cApi().adminReviewWorker(workerId, 'pending', ''), 'Washer moved to pending. They can upload again.')}>Move to pending</Button>
          ) : null}
          {status === 'verified' && !isSuspending ? <Button size="sm" variant="secondary" onClick={(): void => { setIsSuspending(true) }}>Suspend</Button> : null}
        </div>
      </div>

      {documents === null && loadError === null ? <Skeleton heightClassName="h-5" /> : null}
      {loadError !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert" className="text-[var(--color-danger-600)]">{loadError}</p>
          <Button size="sm" variant="ghost" onClick={(): void => void loadDocuments()}>Try again</Button>
        </div>
      ) : null}
      {status !== 'verified' && blockers !== null && blockers.length > 0 ? (
        <div className="text-sm text-[var(--color-ink-700)]">
          <p className="font-medium">Approve these documents before verifying:</p>
          <ul className="list-inside list-disc">
            {blockers.map((blocker) => <li key={blocker.documentType}>{blocker.label}: {blocker.detail}</li>)}
          </ul>
        </div>
      ) : null}

      {isSuspending ? (
        <ReasonForm id={`suspend-reason-${workerId}`} label="Reason for suspending" confirmLabel="Confirm suspend" cancelLabel="Keep active"
          onConfirm={async (reason): Promise<void> => {
            await getB2cApi().adminReviewWorker(workerId, 'suspended', reason)
            setIsSuspending(false)
            toast.success('Washer suspended')
            await onChanged()
          }}
          onCancel={(): void => { setIsSuspending(false) }} />
      ) : null}

      {isReviewing && documents !== null ? <WorkerDocumentReview documents={documents} onChanged={reload} /> : null}
    </Card>
  )
}
