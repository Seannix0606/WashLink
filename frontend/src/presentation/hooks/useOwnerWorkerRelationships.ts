import { useCallback } from 'react'
import type { OwnerRelationshipService } from '../../application/services/OwnerRelationshipService'
import type { OwnerSideWorkerRelationship } from '../../domain/models/OwnerRelationship'
import { useLatestResource } from './useLatestResource'

const noRelationships: readonly OwnerSideWorkerRelationship[] = []

export interface UseOwnerWorkerRelationshipsResult {
  readonly relationships: readonly OwnerSideWorkerRelationship[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
}

/** The owner's own relationship rows with workers. Polled while visible. */
export function useOwnerWorkerRelationships(ownerRelationshipService: OwnerRelationshipService): UseOwnerWorkerRelationshipsResult {
  const loadRelationships = useCallback(
    async (): Promise<readonly OwnerSideWorkerRelationship[]> => ownerRelationshipService.loadOwnerWorkerRelationships(),
    [ownerRelationshipService],
  )
  const relationshipsResource = useLatestResource({
    load: loadRelationships,
    initialResource: noRelationships,
    loadFailedMessage: 'Could not load your worker relationships.',
    isPolling: true,
  })
  return {
    relationships: relationshipsResource.resource,
    isLoading: relationshipsResource.isLoading,
    errorMessage: relationshipsResource.errorMessage,
    isEmpty:
      !relationshipsResource.isLoading && relationshipsResource.errorMessage === null && relationshipsResource.resource.length === 0,
    reload: relationshipsResource.reload,
  }
}
