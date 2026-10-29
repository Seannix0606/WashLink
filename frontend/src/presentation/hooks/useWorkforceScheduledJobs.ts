import { useCallback } from 'react'
import type { ScheduledJobService, ScheduledJobStatus } from '../../application/services/ScheduledJobService'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

/** W12 super_admin scheduled-job status (`admin_workforce_scheduled_jobs()`) with derived health; empty for other roles. */
export function useWorkforceScheduledJobs(
  scheduledJobService: ScheduledJobService,
): UseLatestResourceResult<readonly ScheduledJobStatus[]> {
  const loadScheduledJobStatuses = useCallback(
    async (): Promise<readonly ScheduledJobStatus[]> => scheduledJobService.loadScheduledJobStatuses(),
    [scheduledJobService],
  )
  return useLatestResource<readonly ScheduledJobStatus[]>({
    load: loadScheduledJobStatuses,
    initialResource: [],
    loadFailedMessage: 'Could not load the scheduled jobs.',
  })
}
