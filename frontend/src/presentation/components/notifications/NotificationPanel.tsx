import type { ReactElement, ReactNode } from 'react'
import { BellOff, CheckCheck } from 'lucide-react'
import type { AppNotification } from '../../../domain/models/AppNotification'
import { Button, Drawer, EmptyState, Skeleton } from '../../design/ui'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { NotificationListItem } from './NotificationListItem'

interface NotificationPanelProps {
  readonly isOpen: boolean
  readonly notifications: readonly AppNotification[]
  readonly unreadCount: number
  readonly isLoadingNotifications: boolean
  readonly notificationsErrorMessage: string | null
  readonly isMarkingAllRead: boolean
  readonly onClose: () => void
  readonly onRetry: () => void
  readonly onMarkReadRequested: (notificationIdentifier: string) => void
  readonly onMarkAllReadRequested: () => void
}

function NotificationListSkeleton(): ReactElement {
  return (
    <div className="space-y-3" role="status" aria-label="Loading notifications">
      {[0, 1, 2].map((placeholderIndex) => (
        <div
          key={placeholderIndex}
          className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3"
        >
          <Skeleton widthClassName="w-2/3" />
          <Skeleton heightClassName="h-3" />
        </div>
      ))}
    </div>
  )
}

export function NotificationPanel({
  isOpen,
  notifications,
  unreadCount,
  isLoadingNotifications,
  notificationsErrorMessage,
  isMarkingAllRead,
  onClose,
  onRetry,
  onMarkReadRequested,
  onMarkAllReadRequested,
}: NotificationPanelProps): ReactElement {
  let panelContent: ReactNode
  if (isLoadingNotifications) {
    panelContent = <NotificationListSkeleton />
  } else if (notifications.length === 0 && notificationsErrorMessage === null) {
    panelContent = (
      <EmptyState
        icon={<BellOff className="h-5 w-5" aria-hidden="true" />}
        title="No notifications yet"
        description="Updates about your shop verification and roster links appear here."
      />
    )
  } else {
    panelContent = (
      <div className="space-y-3">
        {notificationsErrorMessage === null ? null : (
          <LoadErrorNotice
            title="Could not load your notifications"
            errorMessage={notificationsErrorMessage}
            onRetry={onRetry}
          />
        )}
        {notifications.length > 0 ? (
          <ul className="space-y-2" aria-label="Notifications">
            {notifications.map((notification) => (
              <NotificationListItem
                key={notification.identifier}
                notification={notification}
                onMarkReadRequested={onMarkReadRequested}
              />
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Notifications"
      description={
        unreadCount === 1 ? '1 unread notification' : `${String(unreadCount)} unread notifications`
      }
      footer={
        <Button
          size="sm"
          variant="secondary"
          isFullWidth
          isLoading={isMarkingAllRead}
          disabled={unreadCount === 0 || isMarkingAllRead}
          leadingIcon={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
          onClick={onMarkAllReadRequested}
        >
          Mark all as read
        </Button>
      }
    >
      {panelContent}
    </Drawer>
  )
}
