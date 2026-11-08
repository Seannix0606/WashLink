import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import {
  appendUniqueQueueItems,
  moderationQueuePageLimits,
  nextModerationQueueCursor,
  type AdminModerationQueueItem,
  type ModerationQueueFilter,
} from '../../domain/models/JobOpeningModeration'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { usePollWhileVisible } from './usePollWhileVisible'

const loadFailedMessage = 'Could not load the posting reports.'
const loadMoreFailedMessage = 'Could not load more posting reports.'

interface QueueState {
  readonly items: readonly AdminModerationQueueItem[]
  /** Cases matching the filter, from the latest non-empty page; null until one is read. */
  readonly totalCount: number | null
  /** The last page was full, so another page may exist; an empty page means the end. */
  readonly hasMore: boolean
  /** More than the first page is shown (polling would collapse it, so it stops). */
  readonly hasLoadedMore: boolean
}

const initialQueueState: QueueState = { items: [], totalCount: null, hasMore: false, hasLoadedMore: false }

export interface UseAdminModerationQueueResult {
  readonly items: readonly AdminModerationQueueItem[]
  readonly totalCount: number | null
  readonly isLoading: boolean
  readonly isLoadingMore: boolean
  readonly errorMessage: string | null
  readonly loadMoreErrorMessage: string | null
  readonly isEmpty: boolean
  readonly hasMore: boolean
  /** Shows the loading state again, then reads the first page. */
  readonly reload: () => Promise<void>
  /** Re-reads the first page without the loading state (after a decision, on poll and on focus). */
  readonly refresh: () => Promise<void>
  /** Reads the next page after the last loaded row (keyset cursor) and appends new cases only. */
  readonly loadMore: () => Promise<void>
}

/**
 * Super_admin: posting report cases in one status, oldest first, 50 per page (W13, D-71; no
 * statements; not audited). Only the latest first-page request may update state; a page that
 * arrives after the filter changed or after a refresh is dropped. The first page polls every 60 s
 * while visible (W14 queue pattern); once "Load more" was used, polling stops so the list does not
 * collapse. The case drawer's audited read is separate and never polled.
 */
export function useAdminModerationQueue(
  moderationService: JobOpeningModerationService,
  filter: ModerationQueueFilter,
  pageSize: number = moderationQueuePageLimits.defaultPageSize,
): UseAdminModerationQueueResult {
  const [queueState, setQueueState] = useState<QueueState>(initialQueueState)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreErrorMessage, setLoadMoreErrorMessage] = useState<string | null>(null)
  const generationRef = useRef<number>(0)
  const queueStateRef = useRef<QueueState>(initialQueueState)
  const isLoadingMoreRef = useRef<boolean>(false)
  const isHookMountedRef = useRef<boolean>(true)

  const applyQueueState = useCallback((nextState: QueueState): void => {
    queueStateRef.current = nextState
    setQueueState(nextState)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    generationRef.current += 1
    const generation = generationRef.current
    const isLatest = (): boolean => isHookMountedRef.current && generation === generationRef.current
    try {
      const firstPage = await moderationService.listAdminQueuePage(filter, null, pageSize)
      if (isLatest()) {
        applyQueueState({
          items: appendUniqueQueueItems([], firstPage.items),
          totalCount: firstPage.totalCount ?? 0,
          hasMore: firstPage.items.length >= pageSize,
          hasLoadedMore: false,
        })
        setErrorMessage(null)
        setLoadMoreErrorMessage(null)
      }
    } catch (loadError) {
      if (isLatest()) {
        setErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isLatest()) {
        setIsLoading(false)
        isLoadingMoreRef.current = false
        setIsLoadingMore(false)
      }
    }
  }, [applyQueueState, filter, moderationService, pageSize])

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setErrorMessage(null)
    setLoadMoreErrorMessage(null)
    applyQueueState(initialQueueState)
    await refresh()
  }, [applyQueueState, refresh])

  useEffect(() => {
    isHookMountedRef.current = true
    void reload()
    return (): void => {
      isHookMountedRef.current = false
    }
  }, [reload])

  const loadMore = useCallback(async (): Promise<void> => {
    const loadedState = queueStateRef.current
    if (isLoadingMoreRef.current || !loadedState.hasMore) {
      return
    }
    const cursor = nextModerationQueueCursor(loadedState.items)
    if (cursor === null) {
      return
    }
    const generation = generationRef.current
    const isLatest = (): boolean => isHookMountedRef.current && generation === generationRef.current
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    setLoadMoreErrorMessage(null)
    try {
      const nextPage = await moderationService.listAdminQueuePage(filter, cursor, pageSize)
      if (isLatest()) {
        const currentState = queueStateRef.current
        applyQueueState({
          items: appendUniqueQueueItems(currentState.items, nextPage.items),
          totalCount: nextPage.totalCount ?? currentState.totalCount,
          hasMore: nextPage.items.length >= pageSize,
          hasLoadedMore: true,
        })
      }
    } catch (loadError) {
      if (isLatest()) {
        setLoadMoreErrorMessage(toDisplayErrorMessage(loadError, loadMoreFailedMessage))
      }
    } finally {
      if (isLatest()) {
        isLoadingMoreRef.current = false
        setIsLoadingMore(false)
      }
    }
  }, [applyQueueState, filter, moderationService, pageSize])

  const refreshInBackground = useCallback((): void => {
    void refresh()
  }, [refresh])
  usePollWhileVisible(refreshInBackground, !queueState.hasLoadedMore)

  return {
    items: queueState.items,
    totalCount: queueState.totalCount,
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMoreErrorMessage,
    isEmpty: !isLoading && errorMessage === null && queueState.items.length === 0,
    hasMore: queueState.hasMore,
    reload,
    refresh,
    loadMore,
  }
}
