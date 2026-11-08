import { useCallback, useEffect, useRef } from 'react'
import type { OwnerRelationshipService } from '../../application/services/OwnerRelationshipService'
import type { MyOwnerRelationship, MyOwnerRelationshipOverview, OwnerRelationshipProgress } from '../../domain/models/OwnerRelationship'
import { useLatestResource } from './useLatestResource'

const emptyOverview: MyOwnerRelationshipOverview = { progress: null, relationships: [] }

export interface UseMyOwnerRelationshipProgressResult {
  readonly progress: OwnerRelationshipProgress | null
  readonly relationships: readonly MyOwnerRelationship[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly hasNoRelationships: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/**
 * The worker's informational progress and relationships. Polled while visible; re-read without a
 * loading state whenever `refreshSignal` changes (for example after the contract list changes).
 */
export function useMyOwnerRelationshipProgress(
  ownerRelationshipService: OwnerRelationshipService,
  refreshSignal?: unknown,
): UseMyOwnerRelationshipProgressResult {
  const loadOverview = useCallback(
    async (): Promise<MyOwnerRelationshipOverview> => ownerRelationshipService.loadMyOverview(),
    [ownerRelationshipService],
  )
  const overviewResource = useLatestResource({
    load: loadOverview,
    initialResource: emptyOverview,
    loadFailedMessage: 'Could not load your progress.',
    isPolling: true,
  })
  const { refresh } = overviewResource
  const isFirstSignalRef = useRef<boolean>(true)
  useEffect(() => {
    if (isFirstSignalRef.current) {
      isFirstSignalRef.current = false
      return
    }
    void refresh()
  }, [refreshSignal, refresh])

  const { progress, relationships } = overviewResource.resource
  return {
    progress,
    relationships,
    isLoading: overviewResource.isLoading,
    errorMessage: overviewResource.errorMessage,
    hasNoRelationships: !overviewResource.isLoading && overviewResource.errorMessage === null && relationships.length === 0,
    reload: overviewResource.reload,
    refresh,
  }
}
