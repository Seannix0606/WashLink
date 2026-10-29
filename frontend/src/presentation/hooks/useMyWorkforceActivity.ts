import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkforceActivityService } from '../../application/services/WorkforceActivityService'
import type { ApplicationUserRole } from '../../domain/models/AuthenticatedUser'
import type { WorkforceActivityEvent } from '../../domain/models/WorkforceActivity'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export interface UseMyWorkforceActivityResult {
  readonly events: readonly WorkforceActivityEvent[]
  readonly isLoading: boolean
  readonly isLoadingOlder: boolean
  readonly errorMessage: string | null
  readonly hasMore: boolean
  readonly isEmpty: boolean
  readonly loadOlder: () => Promise<void>
  readonly reload: () => Promise<void>
}

const loadFailedMessage = 'Could not load your activity.'

/**
 * "Your activity" (P76): the newest page on open, older pages on request. Never polled. Pages by the
 * oldest event the database returned, so a row hidden from this viewer never stalls paging.
 */
export function useMyWorkforceActivity(
  workforceActivityService: WorkforceActivityService,
  viewerRole: ApplicationUserRole | null = null,
): UseMyWorkforceActivityResult {
  const [events, setEvents] = useState<readonly WorkforceActivityEvent[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(false)
  const [oldestEventId, setOldestEventId] = useState<number | null>(null)
  const isMountedRef = useRef<boolean>(true)

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const page = await workforceActivityService.loadPage(null, viewerRole)
      if (isMountedRef.current) {
        setEvents(page.events)
        setHasMore(page.hasMore)
        setOldestEventId(page.oldestEventId)
      }
    } catch (loadError) {
      if (isMountedRef.current) {
        setErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [viewerRole, workforceActivityService])

  useEffect(() => {
    isMountedRef.current = true
    void reload()
    return (): void => {
      isMountedRef.current = false
    }
  }, [reload])

  const loadOlder = useCallback(async (): Promise<void> => {
    if (oldestEventId === null || isLoadingOlder) {
      return
    }
    setIsLoadingOlder(true)
    try {
      const page = await workforceActivityService.loadPage(oldestEventId, viewerRole)
      if (isMountedRef.current) {
        setEvents((currentEvents) => [...currentEvents, ...page.events])
        setHasMore(page.hasMore)
        setOldestEventId(page.oldestEventId ?? oldestEventId)
      }
    } catch (loadError) {
      if (isMountedRef.current) {
        setErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingOlder(false)
      }
    }
  }, [isLoadingOlder, oldestEventId, viewerRole, workforceActivityService])

  return {
    events,
    isLoading,
    isLoadingOlder,
    errorMessage,
    hasMore,
    isEmpty: !isLoading && errorMessage === null && events.length === 0,
    loadOlder,
    reload,
  }
}
