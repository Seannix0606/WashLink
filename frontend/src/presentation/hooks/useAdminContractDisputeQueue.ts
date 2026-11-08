import { useCallback } from 'react'
import type { ContractDisputeService } from '../../application/services/ContractDisputeService'
import type { AdminContractDisputeQueueItem, ContractDisputeStatus } from '../../domain/models/ContractDispute'
import { useLatestResource } from './useLatestResource'

const noQueueItems: readonly AdminContractDisputeQueueItem[] = []

export interface UseAdminContractDisputeQueueResult {
  readonly items: readonly AdminContractDisputeQueueItem[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/** Super_admin: reported contract problems in one status, oldest first (the queue carries no contract details). */
export function useAdminContractDisputeQueue(
  contractDisputeService: ContractDisputeService,
  status: ContractDisputeStatus,
): UseAdminContractDisputeQueueResult {
  const loadQueue = useCallback(
    async (): Promise<readonly AdminContractDisputeQueueItem[]> => contractDisputeService.listAdminQueue(status),
    [contractDisputeService, status],
  )
  const queueResource = useLatestResource({
    load: loadQueue,
    initialResource: noQueueItems,
    loadFailedMessage: 'Could not load the reported problems.',
    isPolling: true,
  })
  return {
    items: queueResource.resource,
    isLoading: queueResource.isLoading,
    errorMessage: queueResource.errorMessage,
    isEmpty: !queueResource.isLoading && queueResource.errorMessage === null && queueResource.resource.length === 0,
    reload: queueResource.reload,
    refresh: queueResource.refresh,
  }
}
