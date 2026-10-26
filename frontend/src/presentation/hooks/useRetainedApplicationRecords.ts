import { useCallback } from 'react'
import type { WorkerContractResponseService } from '../../application/services/WorkerContractResponseService'
import type { RetainedApplicationRecord } from '../../domain/models/WorkerContract'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

const noRecords: readonly RetainedApplicationRecord[] = []

/** Accepted applications kept for the worker after the shop or owner left WashLink (W5-L10). */
export function useRetainedApplicationRecords(
  workerContractResponseService: WorkerContractResponseService,
): UseLatestResourceResult<readonly RetainedApplicationRecord[]> {
  const loadRecords = useCallback(
    async (): Promise<readonly RetainedApplicationRecord[]> => workerContractResponseService.listRetainedApplicationRecords(),
    [workerContractResponseService],
  )
  return useLatestResource({
    load: loadRecords,
    initialResource: noRecords,
    loadFailedMessage: 'Could not load your kept application records.',
  })
}
