import type { ReactElement, ReactNode } from 'react'
import { BellOff, CheckCheck, History } from 'lucide-react'
import type { InboxNotification } from '../../../domain/models/AppNotification'
import { Button, Drawer, EmptyState, Skeleton } from '../../design/ui'
import type { NotificationAreaFilter } from '../../hooks/useNotifications'
import {
  inAppOnlyNoticeText,
  loadOlderErrorTitle,
  loadOlderLabel,
  noAreaNotificationsDescription,
  noAreaNotificationsTitle,
  noNotificationsDescription,
  noNotificationsTitle,
  noOlderNotificationsText,
  noUnreadNotificationsDescription,
  noUnreadNotificationsTitle,
} from '../../utilities/notificationAreaCopy'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { NotificationFilterBar } from './NotificationFilterBar'
import { NotificationListItem } from './NotificationListItem'

interface NotificationPanelProps {
  readonly isOpen: boolean
  /** The loaded notifications that match the area filter. */
  readonly notifications: readonly InboxNotification[]
  readonly unreadCount: number
  readonly isLoadingNotifications: boolean
  readonly notificationsErrorMessage: string | null
  readonly isMarkingAllRead: boolean
  readonly onClose: () => void
  readonly onRetry: () => void
  readonly onMarkReadRequested: (notificationIdentifier: string) => void
  readonly onMarkAllReadRequested: () => void
  /** W12 (D-68) filters and paging; omitted by callers that predate W12. */
  readonly inboxPaging?: NotificationInboxPagingProps
}

export interface NotificationInboxPagingProps {
  readonly loadedNotificationCount: number
  readonly isUnreadOnly: boolean
  readonly areaFilter: NotificationAreaFilter
  readonly hasOlderNotifications: boolean
  readonly isLoadingOlder: boolean
  readonly loadOlderErrorMessage: string | null
  readonly onUnreadOnlyChange: (isUnreadOnly: boolean) => void
  readonly onAreaFilterChange: (areaFilter: NotificationAreaFilter) => void
  readonly onLoadOlderRequested: () => void
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

function LoadOlderControls({ inboxPaging }: { readonly inboxPaging: NotificationInboxPagingProps }): ReactElement | null {
  if (inboxPaging.loadedNotificationCount === 0) {
    return null
  }
  return (
    <div className="space-y-2">
      {inboxPaging.loadOlderErrorMessage === null ? null : (
        <LoadErrorNotice
          title={loadOlderErrorTitle}
          errorMessage={inboxPaging.loadOlderErrorMessage}
          onRetry={inboxPaging.onLoadOlderRequested}
        />
      )}
      {inboxPaging.hasOlderNotifications ? (
        <Button
          size="sm"
          variant="ghost"
          isFullWidth
          isLoading={inboxPaging.isLoadingOlder}
          disabled={inboxPaging.isLoadingOlder}
          leadingIcon={<History className="h-4 w-4" aria-hidden="true" />}
          onClick={inboxPaging.onLoadOlderRequested}
        >
          {loadOlderLabel}
        </Button>
      ) : (
        <p className="text-center text-xs text-[var(--color-ink-500)]">{noOlderNotificationsText}</p>
      )}
    </div>
  )
}

function emptyStateFor(inboxPaging: NotificationInboxPagingProps | undefined): ReactElement {
  if (inboxPaging !== undefined && inboxPaging.loadedNotificationCount > 0) {
    return <EmptyState icon={<BellOff className="h-5 w-5" aria-hidden="true" />} title={noAreaNotificationsTitle} description={noAreaNotificationsDescription} />
  }
  if (inboxPaging?.isUnreadOnly === true) {
    return <EmptyState icon={<BellOff className="h-5 w-5" aria-hidden="true" />} title={noUnreadNotificationsTitle} description={noUnreadNotificationsDescription} />
  }
  return <EmptyState icon={<BellOff className="h-5 w-5" aria-hidden="true" />} title={noNotificationsTitle} description={noNotificationsDescription} />
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
  inboxPaging,
}: NotificationPanelProps): ReactElement {
  let panelContent: ReactNode
  if (isLoadingNotifications) {
    panelContent = <NotificationListSkeleton />
  } else if (notifications.length === 0 && notificationsErrorMessage === null) {
    panelContent = (
      <div className="space-y-3">
        {emptyStateFor(inboxPaging)}
        {inboxPaging === undefined ? null : <LoadOlderControls inboxPaging={inboxPaging} />}
      </div>
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
        {inboxPaging === undefined ? null : <LoadOlderControls inboxPaging={inboxPaging} />}
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
      <div className="space-y-4">
        {inboxPaging === undefined ? null : (
          <div className="space-y-2">
            <NotificationFilterBar
              isUnreadOnly={inboxPaging.isUnreadOnly}
              areaFilter={inboxPaging.areaFilter}
              onUnreadOnlyChange={inboxPaging.onUnreadOnlyChange}
              onAreaFilterChange={inboxPaging.onAreaFilterChange}
            />
            <p className="text-xs text-[var(--color-ink-500)]">{inAppOnlyNoticeText}</p>
          </div>
        )}
        {panelContent}
      </div>
    </Drawer>
  )
}
