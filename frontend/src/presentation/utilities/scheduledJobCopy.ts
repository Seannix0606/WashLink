import { scheduledJobNotRunRecentlyThresholdMilliseconds } from '../../application/services/ScheduledJobService'
import type { KnownScheduledJobKey } from '../../domain/models/WorkforceScheduledJob'

const notRunRecentlyThresholdHours = scheduledJobNotRunRecentlyThresholdMilliseconds / (60 * 60 * 1000)
const notRunRecentlyWindowText = `the last ${String(notRunRecentlyThresholdHours)} ${notRunRecentlyThresholdHours === 1 ? 'hour' : 'hours'}`

/**
 * W12 super_admin scheduled-job wording (D-61, D-63, W12-L2, W12-L4). Notices are in-app only.
 * Nothing here says a worker was warned or notified by any other channel, or that a contract
 * legally ended: an `expired` record follows the stored end date only.
 */
export const scheduledJobsHeading = 'Scheduled jobs'
export const scheduledJobsIntroText =
  'Read only. Jobs are registered, paused and resized by a person through the reviewed database runbook, never from this page.'
export const scheduledJobsNotRunningText =
  'Scheduled jobs are not running yet. A person must approve and register them.'
export const scheduledJobsRegistrationNoteText =
  'Enabled in WashLink only means the job may run when called. Registering it with the database cron scheduler is a separate step done by a person, and that registration is not visible here.'
export const scheduledJobsNotRunningDetailText =
  'Until then, no in-app certificate expiry notices are created on a schedule and expired contracts are not recorded as expired by a job.'
export const contractExpiryDisplayText =
  'Expired contracts are shown from their end date even before this job records them.'
export const scheduledJobsEmptyTitle = 'No scheduled job status to show'
export const scheduledJobsEmptyText =
  'Only a platform administrator can see scheduled job status, and none was returned for this account.'
export const scheduledJobsErrorTitle = 'The scheduled jobs could not be loaded'

export const scheduledJobLabel: Readonly<Record<KnownScheduledJobKey, string>> = {
  certification_expiry_notices: 'Certificate expiry notices',
  worker_contract_expiry: 'Worker contract expiry',
  owner_relationship_refresh: 'Owner relationship refresh',
}

export const scheduledJobDescription: Readonly<Record<KnownScheduledJobKey, string>> = {
  certification_expiry_notices:
    'Creates in-app notices for shop-issued certificates that expire within 30 days or have expired, once each.',
  worker_contract_expiry:
    'Records accepted or active worker contracts as expired after their end date (Asia/Manila), in small batches.',
  owner_relationship_refresh:
    'Recounts the informational worker and owner relationships, a few pairs at a time.',
}

export const lastOutcomeLabel: Readonly<Partial<Record<string, string>>> = {
  completed: 'Completed',
  disabled: 'Paused (job disabled)',
}

export const neverRanLabel = 'Never ran'
export const enabledLabel = 'Enabled in WashLink'
export const notRunRecentlyLabel = 'Not run recently'
export const notRunRecentlyNeverRanText =
  'This job has never run. A person must approve and register it.'
export const notRunRecentlyStaleText =
  `This job has not started in ${notRunRecentlyWindowText}. Its cron registration may be missing or stopped; a person must check it.`

/** "2 of 3 scheduled jobs have not run in the last 2 hours." (window from the service threshold) */
export function someScheduledJobsNotRunRecentlyText(notRunRecentlyCount: number, jobCount: number): string {
  const jobWord = jobCount === 1 ? 'job has' : 'jobs have'
  return `${String(notRunRecentlyCount)} of ${String(jobCount)} scheduled ${jobWord} not run in ${notRunRecentlyWindowText}.`
}
export const disabledLabel = 'Paused'
export const notCountedLabel = 'Not counted for this job'
export const noTimeRecordedLabel = 'None recorded'

export const scheduledJobFieldLabel = {
  status: 'Status',
  lastOutcome: 'Last run',
  lastStartedAt: 'Last started',
  lastFinishedAt: 'Last finished',
  lastCounts: 'Last run counts',
  lastFailedSqlstates: 'Error codes in the last run',
  lastPassCompletedAt: 'Last full pass',
  runCount: 'Runs recorded',
  pendingCount: 'Still due',
  batchSize: 'Batch size',
} as const

/**
 * "processed 3, changed 2, skipped while busy 1, skipped after an error 0"; a missing count is said,
 * not shown as zero. Skipped items are retried on a later run.
 */
export function lastRunCountsText(
  processedCount: number | null,
  changedCount: number | null,
  skippedLockedCount: number | null,
  skippedFailedCount: number | null,
): string {
  const countText = (count: number | null): string => (count === null ? 'not recorded' : String(count))
  return `processed ${countText(processedCount)}, changed ${countText(changedCount)}, skipped while busy ${countText(skippedLockedCount)}, skipped after an error ${countText(skippedFailedCount)}`
}

/** The stored SQLSTATE codes as plain text ("23514, 40001"), "None" for an empty list, "Not recorded" when not returned. */
export function failedSqlstatesText(failedSqlstates: readonly string[] | null): string {
  if (failedSqlstates === null) {
    return 'Not recorded'
  }
  return failedSqlstates.length === 0 ? 'None' : failedSqlstates.join(', ')
}
