import type { ReactElement } from 'react'
import { AlarmClockOff, CalendarClock, TriangleAlert } from 'lucide-react'
import {
  areScheduledJobsNotRunning,
  type ScheduledJobService,
  type ScheduledJobStatus,
} from '../../../application/services/ScheduledJobService'
import {
  knownScheduledJobKeys,
  type KnownScheduledJobKey,
  type WorkforceScheduledJob,
} from '../../../domain/models/WorkforceScheduledJob'
import { Badge, Card, EmptyState, Skeleton } from '../../design/ui'
import { useWorkforceScheduledJobs } from '../../hooks/useWorkforceScheduledJobs'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
import {
  contractExpiryDisplayText,
  disabledLabel,
  enabledLabel,
  failedSqlstatesText,
  lastOutcomeLabel,
  lastRunCountsText,
  neverRanLabel,
  noTimeRecordedLabel,
  notCountedLabel,
  notRunRecentlyLabel,
  notRunRecentlyNeverRanText,
  notRunRecentlyStaleText,
  scheduledJobDescription,
  scheduledJobFieldLabel,
  scheduledJobLabel,
  scheduledJobsEmptyText,
  scheduledJobsEmptyTitle,
  scheduledJobsErrorTitle,
  scheduledJobsHeading,
  scheduledJobsIntroText,
  scheduledJobsNotRunningDetailText,
  scheduledJobsNotRunningText,
  scheduledJobsRegistrationNoteText,
  someScheduledJobsNotRunRecentlyText,
} from '../../utilities/scheduledJobCopy'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'

interface ScheduledJobsCardProps {
  readonly scheduledJobService: ScheduledJobService
}

function asKnownJobKey(jobKey: string): KnownScheduledJobKey | null {
  return (knownScheduledJobKeys as readonly string[]).includes(jobKey) ? (jobKey as KnownScheduledJobKey) : null
}

function timeText(rawTime: string | null): string {
  return rawTime === null ? noTimeRecordedLabel : formatShortDateTime(rawTime)
}

function outcomeText(scheduledJob: WorkforceScheduledJob, hasNeverRun: boolean): string {
  if (hasNeverRun || scheduledJob.lastOutcome === null) {
    return neverRanLabel
  }
  return lastOutcomeLabel[scheduledJob.lastOutcome] ?? scheduledJob.lastOutcome
}

function JobField({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--color-ink-500)]">{label}</dt>
      <dd className="break-words text-sm text-[var(--color-ink-900)]">{value}</dd>
    </div>
  )
}

function NotRunRecentlyNotice({ hasNeverRun }: { readonly hasNeverRun: boolean }): ReactElement {
  return (
    <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-2">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold text-[var(--color-ink-900)]">{notRunRecentlyLabel}</p>
        <p className="text-xs text-[var(--color-ink-700)]">{hasNeverRun ? notRunRecentlyNeverRanText : notRunRecentlyStaleText}</p>
      </div>
    </div>
  )
}

function ScheduledJobItem({ jobStatus }: { readonly jobStatus: ScheduledJobStatus }): ReactElement {
  const { scheduledJob, hasNeverRun, isNotRunRecently } = jobStatus
  const knownJobKey = asKnownJobKey(scheduledJob.jobKey)
  const jobTitle = knownJobKey === null ? scheduledJob.jobKey : scheduledJobLabel[knownJobKey]
  const headingId = `scheduled-job-${scheduledJob.jobKey}`
  return (
    <li aria-labelledby={headingId} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="text-sm font-semibold text-[var(--color-ink-900)]">
          {jobTitle}
        </h4>
        <Badge tone={scheduledJob.isEnabled ? 'info' : 'warning'}>
          <span className="sr-only">{scheduledJobFieldLabel.status}: </span>
          {scheduledJob.isEnabled ? enabledLabel : disabledLabel}
        </Badge>
      </div>
      {isNotRunRecently ? <NotRunRecentlyNotice hasNeverRun={hasNeverRun} /> : null}
      {knownJobKey === null ? null : <p className="text-xs text-[var(--color-ink-500)]">{scheduledJobDescription[knownJobKey]}</p>}
      {knownJobKey === 'worker_contract_expiry' ? <p className="text-xs text-[var(--color-ink-700)]">{contractExpiryDisplayText}</p> : null}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <JobField label={scheduledJobFieldLabel.lastOutcome} value={outcomeText(scheduledJob, hasNeverRun)} />
        <JobField label={scheduledJobFieldLabel.runCount} value={String(scheduledJob.runCount)} />
        <JobField label={scheduledJobFieldLabel.lastStartedAt} value={timeText(scheduledJob.lastStartedAt)} />
        <JobField label={scheduledJobFieldLabel.lastFinishedAt} value={timeText(scheduledJob.lastFinishedAt)} />
        {hasNeverRun ? null : (
          <JobField
            label={scheduledJobFieldLabel.lastCounts}
            value={lastRunCountsText(
              scheduledJob.lastProcessedCount,
              scheduledJob.lastChangedCount,
              scheduledJob.lastSkippedLockedCount,
              scheduledJob.lastSkippedFailedCount,
            )}
          />
        )}
        {hasNeverRun ? null : (
          <JobField label={scheduledJobFieldLabel.lastFailedSqlstates} value={failedSqlstatesText(scheduledJob.lastFailedSqlstates)} />
        )}
        <JobField
          label={scheduledJobFieldLabel.pendingCount}
          value={scheduledJob.pendingCount === null ? notCountedLabel : String(scheduledJob.pendingCount)}
        />
        {knownJobKey === 'owner_relationship_refresh' ? (
          <JobField label={scheduledJobFieldLabel.lastPassCompletedAt} value={timeText(scheduledJob.lastPassCompletedAt)} />
        ) : null}
        {knownJobKey === 'certification_expiry_notices' ? null : (
          <JobField label={scheduledJobFieldLabel.batchSize} value={String(scheduledJob.batchSize)} />
        )}
      </dl>
    </li>
  )
}

/** W12 super_admin Overview card: scheduled-job status and backlog from `admin_workforce_scheduled_jobs()` (read only). */
export function ScheduledJobsCard({ scheduledJobService }: ScheduledJobsCardProps): ReactElement {
  const scheduledJobsState = useWorkforceScheduledJobs(scheduledJobService)

  const renderBody = (): ReactElement => {
    if (scheduledJobsState.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the scheduled jobs" className="space-y-2">
          <Skeleton heightClassName="h-16" />
          <Skeleton heightClassName="h-16" />
        </div>
      )
    }
    if (scheduledJobsState.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title={scheduledJobsErrorTitle}
          errorMessage={scheduledJobsState.errorMessage}
          onRetry={(): void => {
            void scheduledJobsState.reload()
          }}
        />
      )
    }
    const jobStatuses = scheduledJobsState.resource
    if (jobStatuses.length === 0) {
      return <EmptyState icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />} title={scheduledJobsEmptyTitle} description={scheduledJobsEmptyText} />
    }
    const notRunRecentlyCount = jobStatuses.filter((jobStatus) => jobStatus.isNotRunRecently).length
    return (
      <div className="space-y-3">
        {areScheduledJobsNotRunning(jobStatuses.map((jobStatus) => jobStatus.scheduledJob)) ? (
          <div role="status" className="flex items-start gap-3 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-3">
            <AlarmClockOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--color-ink-900)]">{scheduledJobsNotRunningText}</p>
              <p className="text-xs text-[var(--color-ink-700)]">{scheduledJobsNotRunningDetailText}</p>
            </div>
          </div>
        ) : notRunRecentlyCount > 0 ? (
          <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-3 text-sm font-semibold text-[var(--color-ink-900)]">
            <AlarmClockOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
            {someScheduledJobsNotRunRecentlyText(notRunRecentlyCount, jobStatuses.length)}
          </p>
        ) : null}
        <ul className="space-y-2" aria-label={scheduledJobsHeading}>
          {jobStatuses.map((jobStatus) => (
            <ScheduledJobItem key={jobStatus.scheduledJob.jobKey} jobStatus={jobStatus} />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <Card elevation="flat" role="region" aria-labelledby="admin-scheduled-jobs-heading" className="space-y-3">
      <header>
        <h3 id="admin-scheduled-jobs-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
          <CalendarClock className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {scheduledJobsHeading}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{scheduledJobsIntroText}</p>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{scheduledJobsRegistrationNoteText}</p>
      </header>
      {renderBody()}
    </Card>
  )
}
