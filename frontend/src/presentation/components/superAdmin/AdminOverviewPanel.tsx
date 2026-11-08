import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { CheckCircle2, LayoutDashboard } from 'lucide-react'
import type { AdminOversightService } from '../../../application/services/AdminOversightService'
import type { ScheduledJobService } from '../../../application/services/ScheduledJobService'
import type { WorkforceDashboardService } from '../../../application/services/WorkforceDashboardService'
import type { AdminModerationSummary } from '../../../domain/models/AdminOversight'
import { adminModerationNextActions, adminNextActions, type AdminNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import { Card, EmptyState, Skeleton } from '../../design/ui'
import { createScheduledJobDependencies } from '../../dependencyInjection/createScheduledJobDependencies'
import { useAdminModerationSummary } from '../../hooks/useAdminModerationSummary'
import { useWorkforceDashboardSummary } from '../../hooks/useWorkforceDashboardSummary'
import { adminModerationNextActionText, moderationCountsHeading } from '../../utilities/adminOversightCopy'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
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
import { DashboardCountGrid, type DashboardCountGroup } from '../shared/DashboardCountGrid'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { NextActionList } from '../shared/NextActionList'
import { ScheduledJobsCard } from './ScheduledJobsCard'

interface AdminOverviewPanelProps {
  readonly workforceDashboardService: WorkforceDashboardService
  readonly onNavigate: (target: AdminNextActionTarget) => void
  /** W14: the second summary (`admin_moderation_summary()`); omitted by W11 callers. */
  readonly adminOversightService?: AdminOversightService
  /** W12: scheduled-job status; defaults to the production service in the W14 console. */
  readonly scheduledJobService?: ScheduledJobService
}

/** W12 card in the nine-tab console; the page predates W12, so the service is created here when not given. */
function AdminScheduledJobsSection({ scheduledJobService }: { readonly scheduledJobService?: ScheduledJobService }): ReactElement {
  const effectiveService = useMemo(
    () => scheduledJobService ?? createScheduledJobDependencies().scheduledJobService,
    [scheduledJobService],
  )
  return <ScheduledJobsCard scheduledJobService={effectiveService} />
}

function moderationCountGroup(summary: AdminModerationSummary): DashboardCountGroup {
  return {
    key: 'moderation',
    heading: 'Moderation counts',
    items: [
      { key: 'open_report_cases', label: 'New posting report cases', value: summary.openReportCaseCount },
      { key: 'changes_submitted', label: 'Owners asking for a check', value: summary.changesSubmittedCount },
      { key: 'paused_by_washlink', label: 'Openings paused by WashLink', value: summary.pausedByWashLinkCount },
      { key: 'oldest_open_case', label: 'Oldest new case', value: summary.oldestOpenCaseAt === null ? 'None' : formatShortDateTime(summary.oldestOpenCaseAt) },
      { key: 'unreviewed_shops', label: 'Approved shops without a recorded review', value: summary.unreviewedApprovedShopCount },
      { key: 'oversight_flags', label: 'Long-open disputes read often', value: summary.oversightFlagCount },
      { key: 'lookups', label: 'Relationship lookups in 30 days', value: summary.relationshipLookupsLast30Days },
    ],
  }
}

/** W14 moderation and oversight counts with their next actions (read only; polled like W11). */
function AdminModerationOverview({
  adminOversightService,
  onNavigate,
}: {
  readonly adminOversightService: AdminOversightService
  readonly onNavigate: (target: AdminNextActionTarget) => void
}): ReactElement | null {
  const moderationSummary = useAdminModerationSummary(adminOversightService)
  if (moderationSummary.isLoading) {
    return <Skeleton heightClassName="h-24" />
  }
  if (moderationSummary.errorMessage !== null) {
    return (
      <LoadErrorNotice
        title="The moderation counts could not be loaded"
        errorMessage={moderationSummary.errorMessage}
        onRetry={(): void => {
          void moderationSummary.reload()
        }}
      />
    )
  }
  const summary = moderationSummary.resource
  if (summary === null) {
    return null
  }
  const nextActions = adminModerationNextActions(summary)
  return (
    <section aria-label={moderationCountsHeading} className="space-y-2">
      {nextActions.length > 0 ? (
        <NextActionList
          accessibleLabel={`${moderationCountsHeading}: next actions`}
          items={nextActions.map((nextAction) => ({
            key: nextAction.key,
            count: nextAction.count,
            label: adminModerationNextActionText[nextAction.key](nextAction.count),
            onSelect: (): void => {
              onNavigate(nextAction.target)
            },
          }))}
        />
      ) : null}
      <DashboardCountGrid groups={[moderationCountGroup(summary)]} />
    </section>
  )
}

/** Super_admin Overview (default tab): what is waiting, then counts from admin_dashboard_summary(). */
export function AdminOverviewPanel({ workforceDashboardService, onNavigate, adminOversightService, scheduledJobService }: AdminOverviewPanelProps): ReactElement {
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
        {adminOversightService !== undefined ? <AdminModerationOverview adminOversightService={adminOversightService} onNavigate={onNavigate} /> : null}
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
      {adminOversightService !== undefined || scheduledJobService !== undefined ? <AdminScheduledJobsSection scheduledJobService={scheduledJobService} /> : null}
    </Card>
  )
}
