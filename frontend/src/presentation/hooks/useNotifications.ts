import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  inboxPageSize,
  mergeNotificationPages,
  type NotificationService,
} from '../../application/services/NotificationService'
import type { InboxNotification } from '../../domain/models/AppNotification'
import type { NotificationArea } from '../../domain/utilities/notificationAreas'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

/** Notifications are not on Realtime (W3 decision, D-62); the inbox is polled instead. */
export const notificationPollIntervalMilliseconds = 60_000

const loadFailedMessage = 'Could not load your notifications.'
const loadOlderFailedMessage = 'Could not load older notifications.'
const markReadFailedMessage = 'Could not mark notifications as read.'

/** W12 area filter: one area, or every area. */
export type NotificationAreaFilter = NotificationArea | 'all'

interface NotificationInboxState {
  /** The account this state belongs to; state of another account is never shown. */
  readonly recipientIdentifier: string | null
  /** The read filter the rows were loaded with (W12; the database applies it). */
  readonly isUnreadOnly: boolean
  readonly notifications: readonly InboxNotification[]
  readonly unreadCount: number
  readonly hasLoaded: boolean
  readonly hasOlderNotifications: boolean
  readonly errorMessage: string | null
}

const emptyInboxState: NotificationInboxState = {
  recipientIdentifier: null,
  isUnreadOnly: false,
  notifications: [],
  unreadCount: 0,
  hasLoaded: false,
  hasOlderNotifications: false,
  errorMessage: null,
}

export interface UseNotificationsResult {
  /** The loaded notifications that match the area filter. */
  readonly notifications: readonly InboxNotification[]
  /** How many notifications are loaded before the area filter. */
  readonly loadedNotificationCount: number
  readonly unreadCount: number
  readonly isLoadingNotifications: boolean
  readonly notificationsErrorMessage: string | null
  readonly isMarkingAllRead: boolean
  readonly isUnreadOnly: boolean
  readonly areaFilter: NotificationAreaFilter
  readonly hasOlderNotifications: boolean
  readonly isLoadingOlder: boolean
  readonly loadOlderErrorMessage: string | null
  readonly reloadNotifications: () => Promise<void>
  readonly markRead: (notificationIdentifier: string) => Promise<void>
  readonly markAllRead: () => Promise<void>
  readonly setUnreadOnly: (isUnreadOnly: boolean) => void
  readonly setAreaFilter: (areaFilter: NotificationAreaFilter) => void
  readonly loadOlderNotifications: () => Promise<void>
}

function setReadState(
  notifications: readonly InboxNotification[],
  notificationIdentifiers: ReadonlySet<string>,
  isRead: boolean,
): InboxNotification[] {
  return notifications.map((notification) =>
    notificationIdentifiers.has(notification.identifier)
      ? { ...notification, isRead }
      : notification,
  )
}

/**
 * The signed-in account's inbox and unread count. Polls every 60 s while the tab is visible and
 * refreshes on window focus. Pass `null` when signed out: polling stops, in-flight responses are
 * discarded and nothing is shown. W12: unread-only (database filter), area (client filter over the
 * loaded rows) and "Load older" keyset paging; a refresh keeps the older pages already loaded.
 */
export function useNotifications(
  notificationService: NotificationService,
  recipientIdentifier: string | null,
): UseNotificationsResult {
  const [inboxState, setInboxState] = useState<NotificationInboxState>(emptyInboxState)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState<boolean>(false)
  const [isUnreadOnly, setUnreadOnly] = useState<boolean>(false)
  const [areaFilter, setAreaFilter] = useState<NotificationAreaFilter>('all')
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false)
  const [loadOlderErrorMessage, setLoadOlderErrorMessage] = useState<string | null>(null)
  // Bumped whenever the account or read filter changes or the hook unmounts, so stale responses are ignored.
  const requestGenerationReference = useRef<number>(0)

  const fetchInbox = useCallback(
    async (
      requestGeneration: number,
      forRecipientIdentifier: string,
      forUnreadOnly: boolean,
    ): Promise<void> => {
      try {
        const [firstPage, loadedUnreadCount] = await Promise.all([
          notificationService.listMyInboxPage({ before: null, isUnreadOnly: forUnreadOnly }),
          notificationService.countMyUnread(),
        ])
        if (requestGeneration !== requestGenerationReference.current) {
          return
        }
        setInboxState((previousState) => {
          const isSameView =
            previousState.hasLoaded &&
            previousState.recipientIdentifier === forRecipientIdentifier &&
            previousState.isUnreadOnly === forUnreadOnly
          const mergedNotifications = isSameView
            ? mergeNotificationPages(firstPage, previousState.notifications)
            : firstPage
          return {
            recipientIdentifier: forRecipientIdentifier,
            isUnreadOnly: forUnreadOnly,
            notifications: mergedNotifications,
            unreadCount: loadedUnreadCount,
            hasLoaded: true,
            hasOlderNotifications:
              mergedNotifications.length > firstPage.length
                ? previousState.hasOlderNotifications
                : firstPage.length === inboxPageSize,
            errorMessage: null,
          }
        })
      } catch (loadError) {
        if (requestGeneration !== requestGenerationReference.current) {
          return
        }
        setInboxState((previousState) => ({
          ...(previousState.recipientIdentifier === forRecipientIdentifier &&
          previousState.isUnreadOnly === forUnreadOnly
            ? previousState
            : { ...emptyInboxState, recipientIdentifier: forRecipientIdentifier, isUnreadOnly: forUnreadOnly }),
          hasLoaded: true,
          errorMessage: toDisplayErrorMessage(loadError, loadFailedMessage),
        }))
      }
    },
    [notificationService],
  )

  useEffect(() => {
    if (recipientIdentifier === null) {
      return
    }
    requestGenerationReference.current += 1
    const effectGeneration = requestGenerationReference.current
    const refreshInbox = (): void => {
      void fetchInbox(effectGeneration, recipientIdentifier, isUnreadOnly)
    }
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') {
        refreshInbox()
      }
    }
    refreshInbox()
    const pollIntervalHandle = window.setInterval(
      refreshWhenVisible,
      notificationPollIntervalMilliseconds,
    )
    window.addEventListener('focus', refreshInbox)
    return (): void => {
      requestGenerationReference.current += 1
      window.clearInterval(pollIntervalHandle)
      window.removeEventListener('focus', refreshInbox)
    }
  }, [fetchInbox, recipientIdentifier, isUnreadOnly])

  const isCurrentView =
    recipientIdentifier !== null &&
    inboxState.recipientIdentifier === recipientIdentifier &&
    inboxState.isUnreadOnly === isUnreadOnly
  const loadedNotifications = useMemo<readonly InboxNotification[]>(
    () => (isCurrentView ? inboxState.notifications : []),
    [isCurrentView, inboxState.notifications],
  )
  const filteredNotifications = useMemo<readonly InboxNotification[]>(
    () =>
      areaFilter === 'all'
        ? loadedNotifications
        : loadedNotifications.filter((notification) => notification.area === areaFilter),
    [areaFilter, loadedNotifications],
  )
  const visibleUnreadCount = isCurrentView ? inboxState.unreadCount : 0
  const hasOlderNotifications = isCurrentView && inboxState.hasOlderNotifications

  const reloadNotifications = useCallback(async (): Promise<void> => {
    if (recipientIdentifier === null) {
      return
    }
    // A full reload starts again from the first page.
    setInboxState((previousState) => ({ ...previousState, hasLoaded: false, errorMessage: null }))
    await fetchInbox(requestGenerationReference.current, recipientIdentifier, isUnreadOnly)
  }, [fetchInbox, recipientIdentifier, isUnreadOnly])

  const loadOlderNotifications = useCallback(async (): Promise<void> => {
    const lastLoadedNotification = loadedNotifications.at(-1)
    if (lastLoadedNotification === undefined || !hasOlderNotifications || isLoadingOlder) {
      return
    }
    const requestGeneration = requestGenerationReference.current
    setIsLoadingOlder(true)
    setLoadOlderErrorMessage(null)
    try {
      const olderPage = await notificationService.listMyInboxPage({
        before: {
          createdAt: lastLoadedNotification.createdAt,
          identifier: lastLoadedNotification.identifier,
        },
        isUnreadOnly,
      })
      if (requestGeneration === requestGenerationReference.current) {
        setInboxState((previousState) => ({
          ...previousState,
          notifications: mergeNotificationPages(previousState.notifications, olderPage),
          hasOlderNotifications: olderPage.length === inboxPageSize,
        }))
      }
    } catch (loadError) {
      if (requestGeneration === requestGenerationReference.current) {
        setLoadOlderErrorMessage(toDisplayErrorMessage(loadError, loadOlderFailedMessage))
      }
    } finally {
      setIsLoadingOlder(false)
    }
  }, [hasOlderNotifications, isLoadingOlder, isUnreadOnly, loadedNotifications, notificationService])

  const changeUnreadOnly = useCallback((nextIsUnreadOnly: boolean): void => {
    setLoadOlderErrorMessage(null)
    setUnreadOnly(nextIsUnreadOnly)
  }, [])

  const markRead = useCallback(
    async (notificationIdentifier: string): Promise<void> => {
      const targetNotification = loadedNotifications.find(
        (notification) => notification.identifier === notificationIdentifier,
      )
      if (targetNotification === undefined || targetNotification.isRead) {
        return
      }
      const targetIdentifiers = new Set([notificationIdentifier])
      setInboxState((previousState) => ({
        ...previousState,
        notifications: setReadState(previousState.notifications, targetIdentifiers, true),
        unreadCount: Math.max(0, previousState.unreadCount - 1),
      }))
      const changedRowCount = await runServiceActionWithToast(
        () => notificationService.markRead([notificationIdentifier]),
        { fallbackErrorMessage: markReadFailedMessage, shouldShowSuccessToast: false },
      )
      if (changedRowCount === null) {
        setInboxState((previousState) => ({
          ...previousState,
          notifications: setReadState(previousState.notifications, targetIdentifiers, false),
          unreadCount: previousState.unreadCount + 1,
        }))
      }
    },
    [notificationService, loadedNotifications],
  )

  const markAllRead = useCallback(async (): Promise<void> => {
    if (visibleUnreadCount === 0) {
      return
    }
    const previousUnreadCount = visibleUnreadCount
    const unreadIdentifiers = new Set(
      loadedNotifications
        .filter((notification) => !notification.isRead)
        .map((notification) => notification.identifier),
    )
    setIsMarkingAllRead(true)
    setInboxState((previousState) => ({
      ...previousState,
      notifications: setReadState(previousState.notifications, unreadIdentifiers, true),
      unreadCount: 0,
    }))
    const changedRowCount = await runServiceActionWithToast(
      () => notificationService.markAllRead(),
      {
        successMessage: 'All notifications marked as read.',
        fallbackErrorMessage: markReadFailedMessage,
      },
    )
    if (changedRowCount === null) {
      setInboxState((previousState) => ({
        ...previousState,
        notifications: setReadState(previousState.notifications, unreadIdentifiers, false),
        unreadCount: previousUnreadCount,
      }))
    }
    setIsMarkingAllRead(false)
  }, [notificationService, loadedNotifications, visibleUnreadCount])

  return {
    notifications: filteredNotifications,
    loadedNotificationCount: loadedNotifications.length,
    unreadCount: visibleUnreadCount,
    isLoadingNotifications:
      recipientIdentifier !== null && !(isCurrentView && inboxState.hasLoaded),
    notificationsErrorMessage: isCurrentView ? inboxState.errorMessage : null,
    isMarkingAllRead,
    isUnreadOnly,
    areaFilter,
    hasOlderNotifications,
    isLoadingOlder,
    loadOlderErrorMessage,
    reloadNotifications,
    markRead,
    markAllRead,
    setUnreadOnly: changeUnreadOnly,
    setAreaFilter,
    loadOlderNotifications,
  }
}
