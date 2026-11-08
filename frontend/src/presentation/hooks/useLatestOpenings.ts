import { useCallback } from 'react'
import type { WorkforceDashboardService } from '../../application/services/WorkforceDashboardService'
import type { MarketplaceJobOpening } from '../../domain/models/MarketplaceJobOpening'
import { useLatestResource } from './useLatestResource'

const noOpenings: readonly MarketplaceJobOpening[] = []

export interface UseLatestOpeningsResult {
  readonly openings: readonly MarketplaceJobOpening[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
}

/** D-43: the newest few openings from the normal search (newest first); no ranking or matching. */
export function useLatestOpenings(workforceDashboardService: WorkforceDashboardService): UseLatestOpeningsResult {
  const loadOpenings = useCallback(
    async (): Promise<readonly MarketplaceJobOpening[]> => workforceDashboardService.loadLatestOpenings(),
    [workforceDashboardService],
  )
  const openingsResource = useLatestResource({
    load: loadOpenings,
    initialResource: noOpenings,
    loadFailedMessage: 'Could not load the latest openings.',
    isPolling: true,
  })
  return {
    openings: openingsResource.resource,
    isLoading: openingsResource.isLoading,
    errorMessage: openingsResource.errorMessage,
    isEmpty: !openingsResource.isLoading && openingsResource.errorMessage === null && openingsResource.resource.length === 0,
    reload: openingsResource.reload,
  }
}
