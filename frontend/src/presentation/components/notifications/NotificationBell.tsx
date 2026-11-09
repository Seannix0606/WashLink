import type { ReactElement } from 'react'
import { Bell } from 'lucide-react'
import { IconButton } from '../../design/ui'

interface NotificationBellProps {
  readonly unreadCount: number
  readonly isPanelOpen: boolean
  readonly onOpenRequested: () => void
}

const maximumDisplayedUnreadCount = 99

/** Accessible label read by screen readers, e.g. "Notifications, 3 unread". */
function buildNotificationBellLabel(unreadCount: number): string {
  return `Notifications, ${String(unreadCount)} unread`
}

export function NotificationBell({
  unreadCount,
  isPanelOpen,
  onOpenRequested,
}: NotificationBellProps): ReactElement {
  const displayedUnreadCount =
    unreadCount > maximumDisplayedUnreadCount
      ? `${String(maximumDisplayedUnreadCount)}+`
      : String(unreadCount)
  return (
    <div className="relative">
      <IconButton
        accessibleLabel={buildNotificationBellLabel(unreadCount)}
        aria-haspopup="dialog"
        aria-expanded={isPanelOpen}
        onClick={onOpenRequested}
        icon={<Bell className="h-4 w-4" aria-hidden="true" />}
      />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          data-testid="notification-unread-badge"
          className="pointer-events-none absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--color-danger-solid)] px-1 text-[11px] font-semibold leading-5 text-white"
        >
          {displayedUnreadCount}
        </span>
      ) : null}
    </div>
  )
}
