import type { ReactElement } from 'react'
import { Briefcase, Search } from 'lucide-react'
import type { WorkforceDashboardService } from '../../../../application/services/WorkforceDashboardService'
import { Button, EmptyState, Skeleton } from '../../../design/ui'
import { useLatestOpenings } from '../../../hooks/useLatestOpenings'
import { formatCalendarDate, formatCompensationAmountLine } from '../../../utilities/jobOpeningDisplay'
import {
  latestOpeningsBrowseLabel,
  latestOpeningsEmptyText,
  latestOpeningsEmptyTitle,
  latestOpeningsHeading,
  latestOpeningsNote,
} from '../../../utilities/workforceDashboardCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface LatestOpeningsListProps {
  readonly workforceDashboardService: WorkforceDashboardService
  readonly onBrowseRequested: () => void
}

/** D-43, W11-L9: the newest openings, never "for you". Pay is shown exactly as the shop stated it. */
export function LatestOpeningsList({ workforceDashboardService, onBrowseRequested }: LatestOpeningsListProps): ReactElement {
  const latestOpenings = useLatestOpenings(workforceDashboardService)

  const renderBody = (): ReactElement => {
    if (latestOpenings.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the latest openings" className="space-y-2">
          <Skeleton heightClassName="h-14" />
          <Skeleton heightClassName="h-14" />
        </div>
      )
    }
    if (latestOpenings.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The latest openings could not be loaded"
          errorMessage={latestOpenings.errorMessage}
          onRetry={(): void => {
            void latestOpenings.reload()
          }}
        />
      )
    }
    if (latestOpenings.isEmpty) {
      return <EmptyState icon={<Briefcase className="h-5 w-5" />} title={latestOpeningsEmptyTitle} description={latestOpeningsEmptyText} />
    }
    return (
      <ul aria-label={latestOpeningsHeading} className="space-y-2">
        {latestOpenings.openings.map((opening) => (
          <li key={opening.jobOpeningId} className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
            <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{opening.title}</p>
            <p className="text-xs break-words text-[var(--color-ink-500)]">{opening.shopName}</p>
            <p className="mt-1 text-xs text-[var(--color-ink-700)]">
              {formatCompensationAmountLine({ ...opening, compensationDetails: null }) ?? 'Pay: see the opening details'}
              {opening.applicationDeadline === null ? '' : ` · Apply by ${formatCalendarDate(opening.applicationDeadline)}`}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="latest-openings-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="latest-openings-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
          {latestOpeningsHeading}
        </h3>
        <Button size="sm" variant="ghost" leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />} onClick={onBrowseRequested}>
          {latestOpeningsBrowseLabel}
        </Button>
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">{latestOpeningsNote}</p>
      {renderBody()}
    </section>
  )
}
