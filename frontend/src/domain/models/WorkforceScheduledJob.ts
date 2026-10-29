/**
 * W12 status of one scheduled workforce job, exactly as `admin_workforce_scheduled_jobs()` returns
 * it (super_admin only; counts only, no ids, names or contract data). Values are never defaulted.
 */
export interface WorkforceScheduledJob {
  /** `certification_expiry_notices`, `worker_contract_expiry` or `owner_relationship_refresh`; other keys are shown as stored. */
  readonly jobKey: string
  readonly isEnabled: boolean
  /** Rows per run (ignored by the certificate notices job). Changed only through trusted SQL. */
  readonly batchSize: number
  readonly lastStartedAt: string | null
  readonly lastFinishedAt: string | null
  /** Null (never ran), `completed` or `disabled`; any other stored value is shown as stored. */
  readonly lastOutcome: string | null
  readonly lastProcessedCount: number | null
  readonly lastChangedCount: number | null
  readonly lastSkippedLockedCount: number | null
  /** Items skipped because they raised an error in the last run (fix cycle 1 N4); null when not returned. */
  readonly lastSkippedFailedCount: number | null
  /** SQLSTATE codes of those errors, exactly as stored (at most 10, no ids or messages); null when not returned. */
  readonly lastFailedSqlstates: readonly string[] | null
  /** Relationship refresh only: when the last full pass over every pair finished. */
  readonly lastPassCompletedAt: string | null
  readonly runCount: number
  /** Backlog still due; null when the job has no backlog count (relationship refresh). */
  readonly pendingCount: number | null
}

export const knownScheduledJobKeys = [
  'certification_expiry_notices',
  'worker_contract_expiry',
  'owner_relationship_refresh',
] as const

export type KnownScheduledJobKey = (typeof knownScheduledJobKeys)[number]
