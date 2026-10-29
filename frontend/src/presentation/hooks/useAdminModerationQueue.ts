import { useCallback } from 'react'
import type { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import type { AdminModerationQueueItem, ModerationQueueFilter } from '../../domain/models/JobOpeningModeration'
import { useLatestResource } from './useLatestResource'

const noQueueItems: readonly AdminModerationQueueItem[] = []

export interface UseAdminModerationQueueResult {
  readonly items: readonly AdminModerationQueueItem[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/** Super_admin: posting report cases in one status, oldest first (no statements; not audited). */
export function useAdminModerationQueue(moderationService: JobOpeningModerationService, filter: ModerationQueueFilter): UseAdminModerationQueueResult {
  const loadQueue = useCallback(
    async (): Promise<readonly AdminModerationQueueItem[]> => moderationService.listAdminQueue(filter),
    [moderationService, filter],
  )
  const queueResource = useLatestResource({
    load: loadQueue,
    initialResource: noQueueItems,
    loadFailedMessage: 'Could not load the posting reports.',
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
