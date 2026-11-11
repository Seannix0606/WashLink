import type { ReactElement } from 'react'
import { History } from 'lucide-react'
import type { CertificationService } from '../../../application/services/CertificationService'
import { Skeleton } from '../../design/ui'
import { useCertificationHistory } from '../../hooks/useOwnerCertifications'
import { describeHistoryEntryTitle, formatCertificationDate } from '../../utilities/certificationDisplay'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'

interface CertificationHistoryListProps {
  readonly certificationService: CertificationService
  readonly certificationId: string
}

/** Status events and review requests, oldest first, with reasons and statements as stored. */
export function CertificationHistoryList({ certificationService, certificationId }: CertificationHistoryListProps): ReactElement {
  const history = useCertificationHistory(certificationService, certificationId)

  return (
    <section aria-label="Certification history" className="space-y-2">
      <h5 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-900)]">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        History
      </h5>
      {history.isLoading ? (
        <div aria-busy="true" aria-label="Loading certification history">
          <Skeleton heightClassName="h-10" />
        </div>
      ) : history.errorMessage !== null ? (
        <LoadErrorNotice
          title="History could not be loaded"
          errorMessage={history.errorMessage}
          onRetry={(): void => {
            void history.reload()
          }}
        />
      ) : history.isEmpty ? (
        <p className="text-xs text-[var(--color-ink-500)]">No history recorded yet.</p>
      ) : (
        <ol className="space-y-2 text-xs text-[var(--color-ink-700)]">
          {history.items.map((historyEntry) => (
            <li key={`${historyEntry.entryKind}-${historyEntry.entryId}`} className="space-y-0.5 border-l-2 border-[var(--color-card-border)] pl-2">
              <p className="font-medium text-[var(--color-ink-900)]">
                {describeHistoryEntryTitle(historyEntry)}, {formatCertificationDate(historyEntry.occurredAt)}
              </p>
              {historyEntry.actorDisplayName !== null ? <p>By {historyEntry.actorDisplayName}</p> : null}
              {historyEntry.reason !== null ? <p className="whitespace-pre-line break-words">Reason: {historyEntry.reason}</p> : null}
              {historyEntry.workerStatement !== null ? (
                <p className="whitespace-pre-line break-words">Worker statement: {historyEntry.workerStatement}</p>
              ) : null}
              {historyEntry.decisionReason !== null ? (
                <p className="whitespace-pre-line break-words">
                  Decision{historyEntry.deciderDisplayName === null ? '' : ` by ${historyEntry.deciderDisplayName}`}
                  {historyEntry.decidedAt === null ? '' : `, ${formatCertificationDate(historyEntry.decidedAt)}`}: {historyEntry.decisionReason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
