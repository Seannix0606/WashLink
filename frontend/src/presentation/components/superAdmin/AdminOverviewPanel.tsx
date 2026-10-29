import type { ReactElement } from 'react'
import { CheckCircle2, LayoutDashboard } from 'lucide-react'
import type { WorkforceDashboardService } from '../../../application/services/WorkforceDashboardService'
import { adminNextActions, type AdminNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import { Card, EmptyState, Skeleton } from '../../design/ui'
import { useWorkforceDashboardSummary } from '../../hooks/useWorkforceDashboardSummary'
import {
  adminNextActionsEmptyText,
  adminNextActionText,
  adminOverviewHeading,
  adminOverviewIntroText,
  adminOverviewUnavailableText,
  nextActionsEmptyTitle,
  nextActionsHeading,
  overviewCountsHeading,
  overviewUnavailableTitle,
} from '../../utilities/workforceDashboardCopy'
import { adminCountGroups } from '../../utilities/workforceDashboardDisplay'
import { DashboardCountGrid } from '../shared/DashboardCountGrid'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { NextActionList } from '../shared/NextActionList'

interface AdminOverviewPanelProps {
  readonly workforceDashboardService: WorkforceDashboardService
  readonly onNavigate: (target: AdminNextActionTarget) => void
}

/** Super_admin Overview (default tab): what is waiting, then counts from admin_dashboard_summary(). */
export function AdminOverviewPanel({ workforceDashboardService, onNavigate }: AdminOverviewPanelProps): ReactElement {
  const summaryState = useWorkforceDashboardSummary(workforceDashboardService, 'super_admin')

  const renderBody = (): ReactElement => {
    if (summaryState.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the overview" className="space-y-2">
          <Skeleton heightClassName="h-12" />
          <Skeleton heightClassName="h-32" />
        </div>
      )
    }
    if (summaryState.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The overview could not be loaded"
          errorMessage={summaryState.errorMessage}
          onRetry={(): void => {
            void summaryState.reload()
          }}
        />
      )
    }
    if (summaryState.summary === null) {
      return <EmptyState icon={<LayoutDashboard className="h-5 w-5" />} title={overviewUnavailableTitle} description={adminOverviewUnavailableText} />
    }
    const summary = summaryState.summary
    return (
      <div className="space-y-5">
        <section aria-labelledby="admin-next-actions-heading" className="space-y-2">
          <h3 id="admin-next-actions-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
            {nextActionsHeading}
          </h3>
          <NextActionList
            accessibleLabel={nextActionsHeading}
            items={adminNextActions(summary).map((nextAction) => ({
              key: nextAction.key,
              count: nextAction.count,
              label: adminNextActionText[nextAction.key](nextAction.count),
              onSelect: (): void => {
                onNavigate(nextAction.target)
              },
            }))}
            emptyContent={
              <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title={nextActionsEmptyTitle} description={adminNextActionsEmptyText} />
            }
          />
        </section>
        <section aria-labelledby="admin-counts-heading" className="space-y-2">
          <h3 id="admin-counts-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
            {overviewCountsHeading}
          </h3>
          <DashboardCountGrid groups={adminCountGroups(summary)} />
        </section>
      </div>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="admin-overview-heading" className="space-y-4">
      <header>
        <h2 id="admin-overview-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <LayoutDashboard className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {adminOverviewHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{adminOverviewIntroText}</p>
      </header>
      {renderBody()}
    </Card>
  )
}
