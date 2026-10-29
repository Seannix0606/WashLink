import type { ReactElement } from 'react'
import { Flag } from 'lucide-react'
import type { JobOpeningModerationService } from '../../../../application/services/JobOpeningModerationService'
import { Badge, Button, EmptyState, Skeleton } from '../../../design/ui'
import { useMyJobOpeningReports } from '../../../hooks/useMyJobOpeningReports'
import { formatCertificationDate } from '../../../utilities/certificationDisplay'
import {
  myReportsEmptyText,
  myReportsEmptyTitle,
  myReportsHeading,
  reportCategoryLabel,
  reportOutcomeLabel,
  reportStatusLabel,
  withdrawReportLabel,
} from '../../../utilities/jobOpeningModerationCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface MyOpeningReportsListProps {
  readonly moderationService: JobOpeningModerationService
}

/** The worker's own reports: reason, statement, status and the outcome kind only (never owner data). */
export function MyOpeningReportsList({ moderationService }: MyOpeningReportsListProps): ReactElement {
  const reportsState = useMyJobOpeningReports(moderationService)

  if (reportsState.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading your reports" className="space-y-2">
        <Skeleton heightClassName="h-16" />
      </div>
    )
  }
  if (reportsState.errorMessage !== null) {
    return (
      <LoadErrorNotice
        title="Your reports could not be loaded"
        errorMessage={reportsState.errorMessage}
        onRetry={(): void => {
          void reportsState.reload()
        }}
      />
    )
  }
  if (reportsState.isEmpty) {
    return <EmptyState icon={<Flag className="h-5 w-5" />} title={myReportsEmptyTitle} description={myReportsEmptyText} />
  }
  return (
    <ul aria-label={myReportsHeading} className="space-y-2">
      {reportsState.reports.map((report) => (
        <li key={report.reportId} className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-3 text-xs text-[var(--color-ink-700)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">
              {`${report.openingTitleSnapshot ?? 'Job opening'} · ${report.shopNameSnapshot ?? 'Shop name not recorded'}`}
            </span>
            <Badge tone={report.status === 'open' ? 'warning' : 'neutral'}>{reportStatusLabel[report.status]}</Badge>
          </div>
          <p>{`${reportCategoryLabel[report.category]} · reported ${formatCertificationDate(report.createdAt)}`}</p>
          <p className="whitespace-pre-line break-words">{report.statement}</p>
          {report.outcome !== null ? <p className="font-medium text-[var(--color-ink-900)]">{reportOutcomeLabel[report.outcome]}</p> : null}
          {report.canWithdraw ? (
            <Button
              size="sm"
              variant="ghost"
              isLoading={reportsState.pendingActionKey === `withdraw:${report.reportId}`}
              disabled={reportsState.pendingActionKey !== null}
              onClick={(): void => {
                void reportsState.withdraw(report)
              }}
            >
              {withdrawReportLabel}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
