import type { ReactElement } from 'react'
import { CheckCircle2, Users } from 'lucide-react'
import type { OwnerDashboardSummary } from '../../../../domain/models/WorkforceDashboardSummary'
import { ownerNextActions, type OwnerNextActionTarget } from '../../../../domain/utilities/workforceNextActions'
import { Card, EmptyState, Skeleton } from '../../../design/ui'
import type { UseWorkforceDashboardSummaryResult } from '../../../hooks/useWorkforceDashboardSummary'
import {
  nextActionsEmptyTitle,
  nextActionsHeading,
  overviewCountsHeading,
  overviewUnavailableTitle,
  ownerNextActionText,
  ownerWorkforceHeading,
  ownerWorkforceIntroText,
  ownerWorkforceUnavailableText,
} from '../../../utilities/workforceDashboardCopy'
import { ownerCountGroups } from '../../../utilities/workforceDashboardDisplay'
import { DashboardCountGrid } from '../../shared/DashboardCountGrid'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { NextActionList } from '../../shared/NextActionList'

interface OwnerWorkforceOverviewPanelProps {
  readonly summaryState: UseWorkforceDashboardSummaryResult<OwnerDashboardSummary>
  readonly onActionSelected: (target: OwnerNextActionTarget) => void
}

/** Owner "Workforce" tab: next actions and counts for the owner's own shops, from owner_dashboard_summary(). */
export function OwnerWorkforceOverviewPanel({ summaryState, onActionSelected }: OwnerWorkforceOverviewPanelProps): ReactElement {
  const renderBody = (): ReactElement => {
    if (summaryState.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading your workforce overview" className="space-y-2">
          <Skeleton heightClassName="h-12" />
          <Skeleton heightClassName="h-32" />
        </div>
      )
    }
    if (summaryState.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="Your workforce overview could not be loaded"
          errorMessage={summaryState.errorMessage}
          onRetry={(): void => {
            void summaryState.reload()
          }}
        />
      )
    }
    if (summaryState.summary === null) {
      return <EmptyState icon={<Users className="h-5 w-5" />} title={overviewUnavailableTitle} description={ownerWorkforceUnavailableText} />
    }
    const summary = summaryState.summary
    return (
      <div className="space-y-5">
        <section aria-labelledby="owner-workforce-actions-heading" className="space-y-2">
          <h3 id="owner-workforce-actions-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
            {nextActionsHeading}
          </h3>
          <NextActionList
            accessibleLabel={`${nextActionsHeading} for your shops`}
            items={ownerNextActions(summary).map((nextAction) => ({
              key: nextAction.key,
              count: nextAction.count,
              label: ownerNextActionText[nextAction.key](nextAction.count),
              onSelect: (): void => {
                onActionSelected(nextAction.target)
              },
            }))}
            emptyContent={<EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title={nextActionsEmptyTitle} />}
          />
        </section>
        <section aria-labelledby="owner-workforce-counts-heading" className="space-y-2">
          <h3 id="owner-workforce-counts-heading" className="text-sm font-semibold text-[var(--color-ink-900)]">
            {overviewCountsHeading}
          </h3>
          <DashboardCountGrid groups={ownerCountGroups(summary)} />
        </section>
      </div>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="owner-workforce-heading" className="space-y-4">
      <header>
        <h2 id="owner-workforce-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <Users className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {ownerWorkforceHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{ownerWorkforceIntroText}</p>
      </header>
      {renderBody()}
    </Card>
  )
}
