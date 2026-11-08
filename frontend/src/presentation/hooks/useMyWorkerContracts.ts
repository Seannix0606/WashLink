import { useCallback } from 'react'
import type { ContractReviewSupport, WorkerContractResponseService } from '../../application/services/WorkerContractResponseService'
import type { MyWorkerContract } from '../../domain/models/WorkerContract'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

const noContracts: readonly MyWorkerContract[] = []

export interface UseMyWorkerContractsResult {
  readonly contracts: readonly MyWorkerContract[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly findContract: (contractId: string) => MyWorkerContract | undefined
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/** The worker's contracts once sent (never an unsent draft). Polled while visible. */
export function useMyWorkerContracts(workerContractResponseService: WorkerContractResponseService): UseMyWorkerContractsResult {
  const loadContracts = useCallback(
    async (): Promise<readonly MyWorkerContract[]> => workerContractResponseService.loadMyContracts(),
    [workerContractResponseService],
  )
  const contractsResource = useLatestResource({
    load: loadContracts,
    initialResource: noContracts,
    loadFailedMessage: 'Could not load your contracts.',
    isPolling: true,
  })
  const contracts = contractsResource.resource
  const findContract = useCallback(
    (contractId: string): MyWorkerContract | undefined => contracts.find((contract) => contract.contractId === contractId),
    [contracts],
  )
  return {
    contracts,
    isLoading: contractsResource.isLoading,
    errorMessage: contractsResource.errorMessage,
    isEmpty: !contractsResource.isLoading && contractsResource.errorMessage === null && contracts.length === 0,
    findContract,
    reload: contractsResource.reload,
    refresh: contractsResource.refresh,
  }
}

const noReviewSupport: ContractReviewSupport = { classificationOptions: [], acknowledgementTexts: [] }

/** The relationship types and statement texts the accept form needs (always read from the server). */
export function useContractReviewSupport(
  workerContractResponseService: WorkerContractResponseService,
): UseLatestResourceResult<ContractReviewSupport> {
  const loadSupport = useCallback(
    async (): Promise<ContractReviewSupport> => workerContractResponseService.loadReviewSupport(),
    [workerContractResponseService],
  )
  return useLatestResource({ load: loadSupport, initialResource: noReviewSupport, loadFailedMessage: 'Could not load the contract statements.' })
}
