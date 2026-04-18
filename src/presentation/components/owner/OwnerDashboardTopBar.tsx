import type { ReactElement } from 'react'
import { Bell, Search } from 'lucide-react'
import { IconButton } from '../../design/ui'
import { joinClassNames } from '../../design/classNames'
import { AuthenticatedTopBar } from '../AuthenticatedTopBar'

interface OwnerDashboardTopBarProps {
  readonly searchInputValue: string
  readonly onSearchInputValueChange: (nextSearchInputValue: string) => void
  readonly hasNewNotification: boolean
  readonly onNotificationButtonClick: () => void
}

export function OwnerDashboardTopBar({
  searchInputValue,
  onSearchInputValueChange,
  hasNewNotification,
  onNotificationButtonClick,
}: OwnerDashboardTopBarProps): ReactElement {
  return (
    <AuthenticatedTopBar
      centerSlot={
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-500)]" />
          <input
            type="search"
            value={searchInputValue}
            onChange={(searchChangeEvent) =>
              onSearchInputValueChange(searchChangeEvent.target.value)
            }
            placeholder="Search bookings by customer, service, or address"
            className="h-10 w-full rounded-full border border-[var(--color-ink-200)] bg-[var(--color-surface-muted)] pl-9 pr-4 text-sm text-[var(--color-ink-900)] outline-none transition-colors placeholder:text-[var(--color-ink-500)] focus:border-[var(--color-brand-600)] focus:bg-white"
          />
        </div>
      }
      trailingSlot={
        <div className="relative">
          <IconButton
            accessibleLabel="Notifications"
            icon={<Bell className="h-4 w-4" />}
            onClick={onNotificationButtonClick}
          />
          {hasNewNotification ? (
            <span
              aria-hidden="true"
              className={joinClassNames(
                'absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-danger-500)]',
                'ring-2 ring-white',
              )}
            />
          ) : null}
        </div>
      }
    />
  )
}
