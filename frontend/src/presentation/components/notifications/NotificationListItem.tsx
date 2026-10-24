import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import type { AppNotification } from '../../../domain/models/AppNotification'
import { Button } from '../../design/ui'
import { joinClassNames } from '../../design/classNames'
import { formatRelativeTimeFromNow } from '../../utilities/datetimeFormatting'

interface NotificationListItemProps {
  readonly notification: AppNotification
  readonly onMarkReadRequested: (notificationIdentifier: string) => void
}

/** One notification. Title and body are rendered as plain text (React escapes them), never HTML. */
export function NotificationListItem({
  notification,
  onMarkReadRequested,
}: NotificationListItemProps): ReactElement {
  return (
    <li
      className={joinClassNames(
        'flex gap-3 rounded-[var(--radius-control)] border px-3 py-3',
        notification.isRead
          ? 'border-[var(--color-ink-200)] bg-white'
          : 'border-[var(--color-brand-100)] bg-[var(--color-brand-50)]',
      )}
    >
      <span
        aria-hidden="true"
        className={joinClassNames(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          notification.isRead ? 'bg-transparent' : 'bg-[var(--color-brand-700)]',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--color-ink-900)]">
          {notification.isRead ? null : <span className="sr-only">Unread: </span>}
          {notification.title}
        </p>
        <p className="mt-0.5 break-words text-sm text-[var(--color-ink-700)]">
          {notification.body}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <time
            dateTime={notification.createdAt}
            className="text-xs text-[var(--color-ink-500)]"
          >
            {formatRelativeTimeFromNow(notification.createdAt)}
          </time>
          {notification.isRead ? null : (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Check className="h-4 w-4" aria-hidden="true" />}
              aria-label={`Mark "${notification.title}" as read`}
              onClick={(): void => {
                onMarkReadRequested(notification.identifier)
              }}
            >
              Mark as read
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
