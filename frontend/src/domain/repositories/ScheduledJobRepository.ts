import type { WorkforceScheduledJob } from '../models/WorkforceScheduledJob'

/**
 * W12 super_admin read of the scheduled workforce jobs (RPC `admin_workforce_scheduled_jobs` only).
 * The database returns no rows for any other role. Jobs are never run, enabled or resized from the
 * app: that is trusted SQL only (runbook).
 */
export interface ScheduledJobRepository {
  listScheduledJobs(): Promise<WorkforceScheduledJob[]>
}
