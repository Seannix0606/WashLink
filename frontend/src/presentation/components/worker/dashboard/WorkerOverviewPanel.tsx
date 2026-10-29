import type { ReactElement } from 'react'
import { CheckCircle2, LayoutDashboard } from 'lucide-react'
import type { OwnerRelationshipService } from '../../../../application/services/OwnerRelationshipService'
import type { WorkforceDashboardService } from '../../../../application/services/WorkforceDashboardService'
import { workerNextActions, type WorkerNextActionTarget } from '../../../../domain/utilities/workforceNextActions'
import { Card, EmptyState, Skeleton } from '../../../design/ui'
import { useWorkforceDashboardSummary } from '../../../hooks/useWorkforceDashboardSummary'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  countedAsOfPrefix,
  nextActionsEmptyTitle,
  nextActionsHeading,
  overviewCountsHeading,
  overviewUnavailableText,
  overviewUnavailableTitle,
  workerNextActionsEmptyText,
  workerNextActionText,
  workerOverviewHeading,
  workerOverviewIntroText,
} from '../../../utilities/workforceDashboardCopy'
import { workerCountGroups } from '../../../utilities/workforceDashboardDisplay'
import { DashboardCountGrid } from '../../shared/DashboardCountGrid'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { NextActionList } from '../../shared/NextActionList'
import { OwnerRelationshipProgressCard } from '../contracts/OwnerRelationshipProgressCard'
import { LatestOpeningsList } from './LatestOpeningsList'

export type WorkerOverviewDestination = WorkerNextActionTarget | 'find_work'

interface WorkerOverviewPanelProps {
  readonly workforceDashboardService: WorkforceDashboardService
  /** W10 progress card; hidden when not given. */
  readonly ownerRelationshipService?: OwnerRelationshipService
  /** Opens a workspace section ('profile' opens the profile editor). */
  readonly onNavigate: (destination: WorkerOverviewDestination) => void
}

/** Worker "Overview" (D-42): next action first, then counts from the database, latest openings and progress. */
export function WorkerOverviewPanel({ workforceDashboardService, ownerRelationshipService, onNavigate }: WorkerOverviewPanelProps): ReactElement {
  const summaryState = useWorkforceDashboardSummary(workforceDashboardService, 'worker')

  const renderSummary = (): ReactElement => {
    if (summaryState.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading your overview" className="space-y-2">
          <Skeleton heightClassName="h-12" />
          <Skeleton heightClassName="h-12" />
          <Skeleton heightClassName="h-24" />
        </div>
      )
    }
    if (summaryState.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="Your overview could not be loaded"
          errorMessage={summaryState.errorMessage}
          onRetry={(): void => {
            void summaryState.reload()
          }}
        />
      )
    }
    if (summaryState.summary === null) {
      return <EmptyState icon={<LayoutDashboard className="h-5 w-5" />} title={overviewUnavailableTitle} description={overviewUnavailableText} />
    }
    const summary = summaryState.summary
    const nextActionItems = workerNextActions(summary).map((nextAction) => ({
      key: nextAction.key,
      count: nextAction.count,
      label: workerNextActionText[nextAction.key](nextAction.count),
      onSelect: (): void => {
        onNavigate(nextAction.target)
      },
    }))
    return (
      <div className="space-y-5">
        <section aria-labelledby="worker-next-actions-heading" className="space-y-2">
          <h3 id="worker-next-actions-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
            {nextActionsHeading}
          </h3>
          <NextActionList
            accessibleLabel={nextActionsHeading}
            items={nextActionItems}
            emptyContent={
              <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title={nextActionsEmptyTitle} description={workerNextActionsEmptyText} />
            }
          />
        </section>
        <section aria-labelledby="worker-counts-heading" className="space-y-2">
          <h3 id="worker-counts-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
            {overviewCountsHeading}
          </h3>
          <DashboardCountGrid groups={workerCountGroups(summary)} />
          <p className="text-[11px] text-[var(--color-ink-500)]">{`${countedAsOfPrefix} ${formatShortDateTime(summary.countedAsOf)}`}</p>
        </section>
      </div>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="worker-overview-heading" className="space-y-5">
      <header>
        <h2 id="worker-overview-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <LayoutDashboard className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {workerOverviewHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{workerOverviewIntroText}</p>
      </header>
      {renderSummary()}
      <LatestOpeningsList
        workforceDashboardService={workforceDashboardService}
        onBrowseRequested={(): void => {
          onNavigate('find_work')
        }}
      />
      {ownerRelationshipService !== undefined ? (
        <OwnerRelationshipProgressCard
          ownerRelationshipService={ownerRelationshipService}
          onFindWorkRequested={(): void => {
            onNavigate('find_work')
          }}
        />
      ) : null}
    </Card>
  )
}
