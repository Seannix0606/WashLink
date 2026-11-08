import { useCallback } from 'react'
import type { CertificationPlatformReviewService } from '../../application/services/CertificationPlatformReviewService'
import type { AdminPlatformReviewQueueItem, PlatformReviewStatus } from '../../domain/models/CertificationPlatformReview'
import { useLatestResource } from './useLatestResource'

const noQueueItems: readonly AdminPlatformReviewQueueItem[] = []

export interface UseAdminCertificationReviewQueueResult {
  readonly items: readonly AdminPlatformReviewQueueItem[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/** Super_admin: WashLink reviews in one status, oldest first (the queue read is not audited; polled). */
export function useAdminCertificationReviewQueue(
  platformReviewService: CertificationPlatformReviewService,
  status: PlatformReviewStatus,
): UseAdminCertificationReviewQueueResult {
  const loadQueue = useCallback(
    async (): Promise<readonly AdminPlatformReviewQueueItem[]> => platformReviewService.listAdminQueue(status),
    [platformReviewService, status],
  )
  const queueResource = useLatestResource({
    load: loadQueue,
    initialResource: noQueueItems,
    loadFailedMessage: 'Could not load the WashLink review queue.',
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
