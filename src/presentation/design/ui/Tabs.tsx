import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

export interface TabItemDefinition<TabValue extends string> {
  readonly value: TabValue
  readonly label: string
  readonly badgeContent?: ReactNode
}

interface TabsProps<TabValue extends string> {
  readonly tabItems: readonly TabItemDefinition<TabValue>[]
  readonly activeTabValue: TabValue
  readonly onTabChange: (nextTabValue: TabValue) => void
  readonly accessibleLabel: string
  readonly className?: string
}

export function Tabs<TabValue extends string>({
  tabItems,
  activeTabValue,
  onTabChange,
  accessibleLabel,
  className,
}: TabsProps<TabValue>): ReactElement {
  return (
    <div
      role="tablist"
      aria-label={accessibleLabel}
      className={joinClassNames(
        'inline-flex flex-wrap gap-1 rounded-full bg-[var(--color-ink-100)] p-1',
        className,
      )}
    >
      {tabItems.map((tabItem) => {
        const isActive = tabItem.value === activeTabValue
        return (
          <button
            key={tabItem.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onTabChange(tabItem.value)}
            className={joinClassNames(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-white text-[var(--color-ink-900)] shadow-[var(--shadow-card)]'
                : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
            )}
          >
            <span>{tabItem.label}</span>
            {tabItem.badgeContent !== undefined ? (
              <span
                className={joinClassNames(
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                  isActive
                    ? 'bg-[var(--color-brand-100)] text-[var(--color-brand-800)]'
                    : 'bg-[var(--color-ink-200)] text-[var(--color-ink-700)]',
                )}
              >
                {tabItem.badgeContent}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
