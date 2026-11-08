import type { ReactElement } from 'react'
import { notificationAreas, isNotificationArea } from '../../../domain/utilities/notificationAreas'
import { Select, type SelectOption } from '../../design/ui'
import { joinClassNames } from '../../design/classNames'
import type { NotificationAreaFilter } from '../../hooks/useNotifications'
import {
  allAreasOptionLabel,
  allReadStatesLabel,
  areaFilterHelperText,
  areaFilterLabel,
  notificationAreaLabel,
  readFilterGroupLabel,
  unreadOnlyLabel,
} from '../../utilities/notificationAreaCopy'

interface NotificationFilterBarProps {
  readonly isUnreadOnly: boolean
  readonly areaFilter: NotificationAreaFilter
  readonly onUnreadOnlyChange: (isUnreadOnly: boolean) => void
  readonly onAreaFilterChange: (areaFilter: NotificationAreaFilter) => void
}

const areaFilterOptions: readonly SelectOption[] = [
  { value: 'all', label: allAreasOptionLabel },
  ...notificationAreas.map((area) => ({ value: area, label: notificationAreaLabel[area] })),
]

function ReadFilterButton({
  label,
  isPressed,
  onSelect,
}: {
  readonly label: string
  readonly isPressed: boolean
  readonly onSelect: () => void
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={isPressed}
      onClick={onSelect}
      className={joinClassNames(
        'h-9 min-w-[4.5rem] rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-600)]',
        isPressed
          ? 'bg-[var(--color-brand-700)] text-white'
          : 'bg-white text-[var(--color-ink-700)] hover:bg-[var(--color-ink-100)]',
      )}
    >
      {label}
    </button>
  )
}

/** W12 (D-68): unread-only (database filter) and area (over the loaded rows) for the inbox. */
export function NotificationFilterBar({
  isUnreadOnly,
  areaFilter,
  onUnreadOnlyChange,
  onAreaFilterChange,
}: NotificationFilterBarProps): ReactElement {
  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={readFilterGroupLabel}
        className="inline-flex gap-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-1"
      >
        <ReadFilterButton
          label={allReadStatesLabel}
          isPressed={!isUnreadOnly}
          onSelect={(): void => {
            onUnreadOnlyChange(false)
          }}
        />
        <ReadFilterButton
          label={unreadOnlyLabel}
          isPressed={isUnreadOnly}
          onSelect={(): void => {
            onUnreadOnlyChange(true)
          }}
        />
      </div>
      <Select
        id="notification-area-filter"
        label={areaFilterLabel}
        helperText={areaFilterHelperText}
        options={areaFilterOptions}
        value={areaFilter}
        onChange={(changeEvent): void => {
          const selectedValue = changeEvent.target.value
          onAreaFilterChange(isNotificationArea(selectedValue) ? selectedValue : 'all')
        }}
      />
    </div>
  )
}
