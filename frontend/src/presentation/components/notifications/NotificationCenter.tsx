import type { ReactElement } from 'react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { NotificationService } from '../../../application/services/NotificationService'
import { useNotifications } from '../../hooks/useNotifications'
import { NotificationBell } from './NotificationBell'
import { NotificationPanel } from './NotificationPanel'

interface NotificationCenterProps {
  readonly notificationService: NotificationService
  /** The signed-in account; null stops polling and hides every notification. */
  readonly recipientIdentifier: string | null
}

/** Bell with unread count plus the notification drawer, for every signed-in role. */
export function NotificationCenter({
  notificationService,
  recipientIdentifier,
}: NotificationCenterProps): ReactElement | null {
  const notificationInbox = useNotifications(notificationService, recipientIdentifier)
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false)

  if (recipientIdentifier === null) {
    return null
  }

  return (
    <>
      <NotificationBell
        unreadCount={notificationInbox.unreadCount}
        isPanelOpen={isPanelOpen}
        onOpenRequested={(): void => {
          setIsPanelOpen(true)
        }}
      />
      {createPortal(
        <NotificationPanel
          isOpen={isPanelOpen}
          notifications={notificationInbox.notifications}
          unreadCount={notificationInbox.unreadCount}
          isLoadingNotifications={notificationInbox.isLoadingNotifications}
          notificationsErrorMessage={notificationInbox.notificationsErrorMessage}
          isMarkingAllRead={notificationInbox.isMarkingAllRead}
          onClose={(): void => {
            setIsPanelOpen(false)
          }}
          onRetry={(): void => {
            void notificationInbox.reloadNotifications()
          }}
          onMarkReadRequested={(notificationIdentifier): void => {
            void notificationInbox.markRead(notificationIdentifier)
          }}
          onMarkAllReadRequested={(): void => {
            void notificationInbox.markAllRead()
          }}
          inboxPaging={{
            loadedNotificationCount: notificationInbox.loadedNotificationCount,
            isUnreadOnly: notificationInbox.isUnreadOnly,
            areaFilter: notificationInbox.areaFilter,
            hasOlderNotifications: notificationInbox.hasOlderNotifications,
            isLoadingOlder: notificationInbox.isLoadingOlder,
            loadOlderErrorMessage: notificationInbox.loadOlderErrorMessage,
            onUnreadOnlyChange: notificationInbox.setUnreadOnly,
            onAreaFilterChange: notificationInbox.setAreaFilter,
            onLoadOlderRequested: (): void => {
              void notificationInbox.loadOlderNotifications()
            },
          }}
        />,
        // Rendered at body level: the sticky top bar uses backdrop-blur, which would clip a fixed drawer.
        document.body,
      )}
    </>
  )
}
