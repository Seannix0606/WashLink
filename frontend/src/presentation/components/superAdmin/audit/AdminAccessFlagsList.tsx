import type { ReactElement } from 'react'
import { Eye } from 'lucide-react'
import type { AdminOversightService } from '../../../../application/services/AdminOversightService'
import { oversightFlagThresholds } from '../../../../domain/models/AdminOversight'
import { EmptyState, Skeleton } from '../../../design/ui'
import { useAdminAccessFlags } from '../../../hooks/useAdminAccessFlags'
import { accessFlagsEmptyText, accessFlagsEmptyTitle, accessFlagsHeading, accessFlagsIntro } from '../../../utilities/adminOversightCopy'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface AdminAccessFlagsListProps {
  readonly adminOversightService: AdminOversightService
}

/** N6: open contract disputes that stayed open long and whose case was read often (counts only). */
export function AdminAccessFlagsList({ adminOversightService }: AdminAccessFlagsListProps): ReactElement {
  const flagsState = useAdminAccessFlags(adminOversightService)

  const renderBody = (): ReactElement => {
    if (flagsState.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the flagged disputes">
          <Skeleton heightClassName="h-12" />
        </div>
      )
    }
    if (flagsState.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The flagged disputes could not be loaded"
          errorMessage={flagsState.errorMessage}
          onRetry={(): void => {
            void flagsState.reload()
          }}
        />
      )
    }
    if (flagsState.isEmpty) {
      return <EmptyState icon={<Eye className="h-5 w-5" />} title={accessFlagsEmptyTitle} description={accessFlagsEmptyText} />
    }
    return (
      <ul aria-label={accessFlagsHeading} className="space-y-2">
        {flagsState.flags.map((flag) => (
          <li key={flag.disputeId} className="space-y-0.5 rounded-[var(--radius-control)] border border-[var(--color-warning-500)] bg-[var(--color-warning-50)] p-3 text-xs text-[var(--color-ink-700)]">
            <p className="font-medium text-[var(--color-ink-900)]">{`Dispute ${flag.disputeId}`}</p>
            <p className="break-all">{`Contract ${flag.contractId}`}</p>
            <p>
              {`Open ${String(flag.openedDays)} days · case opened ${String(flag.caseViewCount)} times by ${String(flag.distinctViewerCount)} ${
                flag.distinctViewerCount === 1 ? 'administrator' : 'administrators'
              } · last read ${flag.lastViewedAt === null ? 'not recorded' : formatShortDateTime(flag.lastViewedAt)}`}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="access-flags-heading" className="space-y-2">
      <h3 id="access-flags-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
        {accessFlagsHeading}
      </h3>
      <p className="text-xs text-[var(--color-ink-500)]">{accessFlagsIntro(oversightFlagThresholds.openDays, oversightFlagThresholds.readCount)}</p>
      {renderBody()}
    </section>
  )
}
