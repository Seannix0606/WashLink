import type { ReactElement } from 'react'
import { Archive } from 'lucide-react'
import type { WorkerContractResponseService } from '../../../../application/services/WorkerContractResponseService'
import { Skeleton } from '../../../design/ui'
import { useRetainedApplicationRecords } from '../../../hooks/useRetainedApplicationRecords'
import type { JobApplicationStatus } from '../../../../domain/models/JobApplication'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { describeJobApplicationStatus } from '../../../utilities/jobApplicationDisplay'
import { retainedRecordsEmptyText, retainedRecordsIntroText, retainedRecordsTitle } from '../../../utilities/workerContractCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { ApplicationSnapshotView } from '../marketplace/ApplicationSnapshotView'

interface RetainedApplicationRecordsProps {
  readonly workerContractResponseService: WorkerContractResponseService
}

/** Accepted applications kept for the worker after the shop or owner left WashLink, with the frozen opening. */
export function RetainedApplicationRecords({ workerContractResponseService }: RetainedApplicationRecordsProps): ReactElement {
  const records = useRetainedApplicationRecords(workerContractResponseService)
  return (
    <section aria-label={retainedRecordsTitle} className="space-y-2 border-t border-[var(--color-ink-200)] pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <Archive className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        {retainedRecordsTitle}
      </h3>
      <p className="text-xs text-[var(--color-ink-500)]">{retainedRecordsIntroText}</p>
      {records.isLoading ? (
        <Skeleton heightClassName="h-16" />
      ) : records.errorMessage !== null ? (
        <LoadErrorNotice
          title="Your kept application records could not be loaded"
          errorMessage={records.errorMessage}
          onRetry={(): void => {
            void records.reload()
          }}
        />
      ) : records.resource.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">{retainedRecordsEmptyText}</p>
      ) : (
        <ul aria-label="Kept application records" className="space-y-2">
          {records.resource.map((record) => {
            const title = record.openingSnapshot?.title ?? 'Job opening'
            const statusLabel =
              (describeJobApplicationStatus(record.status as JobApplicationStatus) as { displayLabel: string } | undefined)?.displayLabel ?? record.status
            return (
              <li key={record.recordId} aria-label={title} className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
                <details>
                  <summary className="cursor-pointer space-y-0.5">
                    <span className="text-sm font-medium break-words text-[var(--color-ink-900)]">{title}</span>
                    <span className="block text-xs text-[var(--color-ink-500)]">
                      {`${record.openingSnapshot?.shopName ?? 'The shop'} · ${statusLabel} · kept ${formatShortDateTime(record.removedAt)}`}
                    </span>
                  </summary>
                  <div className="mt-3">
                    {record.openingSnapshot === null ? (
                      <p className="text-sm text-[var(--color-ink-500)]">The opening details were not stored with this record.</p>
                    ) : (
                      <ApplicationSnapshotView openingSnapshot={record.openingSnapshot} snapshotTakenAt={record.submittedAt} currentOpening={null} />
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
