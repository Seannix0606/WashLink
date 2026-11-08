import type { WorkforceScheduledJob } from '../../domain/models/WorkforceScheduledJob'
import type { ScheduledJobRepository } from '../../domain/repositories/ScheduledJobRepository'
import { callRpcRows } from './supabaseRpcCalls'

/** One row of `admin_workforce_scheduled_jobs()` (w12e). */
export interface SupabaseScheduledJobRow {
  job_key: string
  enabled: boolean
  batch_size: number
  last_started_at: string | null
  last_finished_at: string | null
  last_outcome: string | null
  last_processed_count: number | null
  last_changed_count: number | null
  last_skipped_locked_count: number | null
  last_pass_completed_at: string | null
  /** bigint: PostgREST may send it as a number or as text. */
  run_count: number | string
  pending_count: number | null
  /** Fix cycle 1 N4 columns; absent from an older read, so mapped to null rather than defaulted. */
  last_skipped_failed_count?: number | null
  last_failed_sqlstates?: string[] | null
}

function toRunCount(rawRunCount: number | string): number {
  return typeof rawRunCount === 'number' ? rawRunCount : Number(rawRunCount)
}

export function mapScheduledJobRow(jobRow: SupabaseScheduledJobRow): WorkforceScheduledJob {
  return {
    jobKey: jobRow.job_key,
    isEnabled: jobRow.enabled,
    batchSize: jobRow.batch_size,
    lastStartedAt: jobRow.last_started_at,
    lastFinishedAt: jobRow.last_finished_at,
    lastOutcome: jobRow.last_outcome,
    lastProcessedCount: jobRow.last_processed_count,
    lastChangedCount: jobRow.last_changed_count,
    lastSkippedLockedCount: jobRow.last_skipped_locked_count,
    lastSkippedFailedCount: jobRow.last_skipped_failed_count ?? null,
    lastFailedSqlstates: jobRow.last_failed_sqlstates ?? null,
    lastPassCompletedAt: jobRow.last_pass_completed_at,
    runCount: toRunCount(jobRow.run_count),
    pendingCount: jobRow.pending_count,
  }
}

/**
 * W12: the read-only super_admin RPC. The internal runner and batch functions are revoked from every
 * client role and are never called from the app.
 */
export class SupabaseScheduledJobRepository implements ScheduledJobRepository {
  public async listScheduledJobs(): Promise<WorkforceScheduledJob[]> {
    const jobRows = await callRpcRows<SupabaseScheduledJobRow>(
      'admin_workforce_scheduled_jobs',
      undefined,
      'Could not load the scheduled jobs.',
    )
    return jobRows.map(mapScheduledJobRow)
  }
}
