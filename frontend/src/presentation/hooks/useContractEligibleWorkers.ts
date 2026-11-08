import { useCallback } from 'react'
import type { NewWorkerContractOptions, WorkerContractService } from '../../application/services/WorkerContractService'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

const noOptions: NewWorkerContractOptions = {
  eligibleWorkers: [],
  templateChoices: [],
  classificationOptions: [],
  acknowledgementTexts: [],
}

/**
 * Everything the "New contract draft" form needs: workers reachable under D-31 (names only),
 * own active template versions plus the current standard, and the relationship types in order.
 */
export function useContractEligibleWorkers(
  workerContractService: WorkerContractService,
): UseLatestResourceResult<NewWorkerContractOptions> {
  const loadOptions = useCallback(
    async (): Promise<NewWorkerContractOptions> => workerContractService.loadNewContractOptions(),
    [workerContractService],
  )
  return useLatestResource({
    load: loadOptions,
    initialResource: noOptions,
    loadFailedMessage: 'Could not load the workers you can draft a contract for.',
  })
}
