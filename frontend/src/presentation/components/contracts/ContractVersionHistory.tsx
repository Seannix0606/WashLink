import type { ReactElement } from 'react'
import { History } from 'lucide-react'
import type { ContractVersionSummary } from '../../../domain/models/WorkerContract'
import { Badge, Button, Skeleton } from '../../design/ui'
import type { UseLatestResourceResult } from '../../hooks/useLatestResource'
import type { WorkerContractHistory } from '../../hooks/useWorkerContractVersionHistory'
import { shortContentHash } from '../../utilities/contractTemplateDisplay'
import { describeContractDates, describeVersion, versionStateLabel } from '../../utilities/workerContractDisplay'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { ContractAcceptanceRecords } from './ContractAcceptanceRecords'

interface ContractVersionHistoryProps {
  /** From useWorkerContractVersionHistory (the parent also uses it, for example for the pending version). */
  readonly history: UseLatestResourceResult<WorkerContractHistory>
  readonly onOpenVersion: (version: ContractVersionSummary) => void
}

/** Every version of a contract, newest first, with its acceptance records. Earlier versions never change. */
export function ContractVersionHistory({ history, onOpenVersion }: ContractVersionHistoryProps): ReactElement {
  if (history.isLoading) {
    return <Skeleton heightClassName="h-24" />
  }
  if (history.errorMessage !== null) {
    return (
      <LoadErrorNotice
        title="The contract versions could not be loaded"
        errorMessage={history.errorMessage}
        onRetry={(): void => {
          void history.reload()
        }}
      />
    )
  }
  return (
    <div className="space-y-4">
      <section aria-label="Contract versions" className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
          <History className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          Versions
        </h4>
        {history.resource.versions.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-500)]">No versions to show.</p>
        ) : (
          <ul className="space-y-2">
            {history.resource.versions.map((version) => (
              <li
                key={version.versionId}
                aria-label={describeVersion(version.versionNumber, version.kind)}
                className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-ink-900)]">{describeVersion(version.versionNumber, version.kind)}</span>
                    <Badge tone="neutral">{versionStateLabel[version.state]}</Badge>
                    {version.isCurrent ? <Badge tone="success">In force</Badge> : null}
                    {version.isPending ? <Badge tone="warning">Waiting for the worker</Badge> : null}
                  </div>
                  <p className="text-xs text-[var(--color-ink-500)]">
                    {`${version.classificationLabel} · ${describeContractDates(version.startDate, version.endDate)}`}
                    {version.contentHash === null ? '' : ` · fingerprint ${shortContentHash(version.contentHash)}`}
                  </p>
                  {version.declineNote !== null ? (
                    <p className="text-xs text-[var(--color-ink-700)]">{`Decline note: ${version.declineNote}`}</p>
                  ) : null}
                </div>
                {version.contentHash !== null ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Open ${describeVersion(version.versionNumber, version.kind)}`}
                    onClick={(): void => {
                      onOpenVersion(version)
                    }}
                  >
                    Open
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <ContractAcceptanceRecords acceptances={history.resource.acceptances} />
    </div>
  )
}
