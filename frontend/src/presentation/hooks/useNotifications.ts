import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NotificationService } from '../../application/services/NotificationService'
import type { AppNotification } from '../../domain/models/AppNotification'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

/** Notifications are not on Realtime (W3 decision); the inbox is polled instead. */
export const notificationPollIntervalMilliseconds = 60_000

const loadFailedMessage = 'Could not load your notifications.'
const markReadFailedMessage = 'Could not mark notifications as read.'

interface NotificationInboxState {
  /** The account this state belongs to; state of another account is never shown. */
  readonly recipientIdentifier: string | null
  readonly notifications: readonly AppNotification[]
  readonly unreadCount: number
  readonly hasLoaded: boolean
  readonly errorMessage: string | null
}

const emptyInboxState: NotificationInboxState = {
  recipientIdentifier: null,
  notifications: [],
  unreadCount: 0,
  hasLoaded: false,
  errorMessage: null,
}

export interface UseNotificationsResult {
  readonly notifications: readonly AppNotification[]
  readonly unreadCount: number
  readonly isLoadingNotifications: boolean
  readonly notificationsErrorMessage: string | null
  readonly isMarkingAllRead: boolean
  readonly reloadNotifications: () => Promise<void>
  readonly markRead: (notificationIdentifier: string) => Promise<void>
  readonly markAllRead: () => Promise<void>
}

function setReadState(
  notifications: readonly AppNotification[],
  notificationIdentifiers: ReadonlySet<string>,
  isRead: boolean,
): AppNotification[] {
  return notifications.map((notification) =>
    notificationIdentifiers.has(notification.identifier)
      ? { ...notification, isRead }
      : notification,
  )
}

/**
 * The signed-in account's inbox and unread count. Polls every 60 s while the tab is visible and
 * refreshes on window focus. Pass `null` when signed out: polling stops, in-flight responses are
 * discarded and nothing is shown.
 */
export function useNotifications(
  notificationService: NotificationService,
  recipientIdentifier: string | null,
): UseNotificationsResult {
  const [inboxState, setInboxState] = useState<NotificationInboxState>(emptyInboxState)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState<boolean>(false)
  // Bumped whenever the account changes or the hook unmounts, so stale responses are ignored.
  const requestGenerationReference = useRef<number>(0)

  const fetchInbox = useCallback(
    async (requestGeneration: number, forRecipientIdentifier: string): Promise<void> => {
      try {
        const [loadedNotifications, loadedUnreadCount] = await Promise.all([
          notificationService.listMyNotifications(),
          notificationService.countMyUnread(),
        ])
        if (requestGeneration !== requestGenerationReference.current) {
          return
        }
        setInboxState({
          recipientIdentifier: forRecipientIdentifier,
          notifications: loadedNotifications,
          unreadCount: loadedUnreadCount,
          hasLoaded: true,
          errorMessage: null,
        })
      } catch (loadError) {
        if (requestGeneration !== requestGenerationReference.current) {
          return
        }
        setInboxState((previousState) => ({
          ...(previousState.recipientIdentifier === forRecipientIdentifier
            ? previousState
            : { ...emptyInboxState, recipientIdentifier: forRecipientIdentifier }),
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
      void fetchInbox(effectGeneration, recipientIdentifier)
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
  }, [fetchInbox, recipientIdentifier])

  const isCurrentRecipient =
    recipientIdentifier !== null && inboxState.recipientIdentifier === recipientIdentifier
  const visibleNotifications = useMemo<readonly AppNotification[]>(
    () => (isCurrentRecipient ? inboxState.notifications : []),
    [isCurrentRecipient, inboxState.notifications],
  )
  const visibleUnreadCount = isCurrentRecipient ? inboxState.unreadCount : 0

  const reloadNotifications = useCallback(async (): Promise<void> => {
    if (recipientIdentifier === null) {
      return
    }
    setInboxState((previousState) => ({ ...previousState, hasLoaded: false, errorMessage: null }))
    await fetchInbox(requestGenerationReference.current, recipientIdentifier)
  }, [fetchInbox, recipientIdentifier])

  const markRead = useCallback(
    async (notificationIdentifier: string): Promise<void> => {
      const targetNotification = visibleNotifications.find(
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
    [notificationService, visibleNotifications],
  )

  const markAllRead = useCallback(async (): Promise<void> => {
    if (visibleUnreadCount === 0) {
      return
    }
    const previousUnreadCount = visibleUnreadCount
    const unreadIdentifiers = new Set(
      visibleNotifications
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
  }, [notificationService, visibleNotifications, visibleUnreadCount])

  return {
    notifications: visibleNotifications,
    unreadCount: visibleUnreadCount,
    isLoadingNotifications:
      recipientIdentifier !== null && !(isCurrentRecipient && inboxState.hasLoaded),
    notificationsErrorMessage: isCurrentRecipient ? inboxState.errorMessage : null,
    isMarkingAllRead,
    reloadNotifications,
    markRead,
    markAllRead,
  }
}
