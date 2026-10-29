import { ScheduledJobService } from '../../application/services/ScheduledJobService'
import { SupabaseScheduledJobRepository } from '../../infrastructure/repositories/SupabaseScheduledJobRepository'

/** W12: super_admin scheduled-job status (the database returns rows to a super_admin only). */
export interface ScheduledJobDependencies {
  readonly scheduledJobService: ScheduledJobService
}

export function createScheduledJobDependencies(): ScheduledJobDependencies {
  return { scheduledJobService: new ScheduledJobService(new SupabaseScheduledJobRepository()) }
}
