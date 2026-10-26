import { useCallback } from 'react'
import type { WorkerContractService } from '../../application/services/WorkerContractService'
import type { OwnerWorkerContract } from '../../domain/models/WorkerContract'
import { useLatestResource } from './useLatestResource'

const noContracts: readonly OwnerWorkerContract[] = []

export interface UseOwnerWorkerContractsResult {
  readonly contracts: readonly OwnerWorkerContract[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly findContract: (contractId: string) => OwnerWorkerContract | undefined
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/** The owner's contracts (drafts included). Polled while visible: W9 tables are not on Realtime. */
export function useOwnerWorkerContracts(workerContractService: WorkerContractService): UseOwnerWorkerContractsResult {
  const loadContracts = useCallback(
    async (): Promise<readonly OwnerWorkerContract[]> => workerContractService.loadOwnerContracts(),
    [workerContractService],
  )
  const contractsResource = useLatestResource({
    load: loadContracts,
    initialResource: noContracts,
    loadFailedMessage: 'Could not load your worker contracts.',
    isPolling: true,
  })
  const contracts = contractsResource.resource
  const findContract = useCallback(
    (contractId: string): OwnerWorkerContract | undefined => contracts.find((contract) => contract.contractId === contractId),
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
