import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
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

/**
 * One row of tabs. On a narrow phone the row scrolls sideways instead of wrapping, and the active tab is kept in view.
 * Keyboard: Tab reaches the active tab; Left/Right/Home/End move between tabs.
 */
export function Tabs<TabValue extends string>({
  tabItems,
  activeTabValue,
  onTabChange,
  accessibleLabel,
  className,
}: TabsProps<TabValue>): ReactElement {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabValue])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = tabItems.findIndex((tabItem) => tabItem.value === activeTabValue)
    const last = tabItems.length - 1
    const target = event.key === 'ArrowRight' ? (current === last ? 0 : current + 1)
      : event.key === 'ArrowLeft' ? (current === 0 ? last : current - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : -1
    const nextTab = tabItems.at(target)
    if (target < 0 || nextTab === undefined) {
      return
    }
    event.preventDefault()
    onTabChange(nextTab.value)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(target).focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={accessibleLabel}
      onKeyDown={onKeyDown}
      className={joinClassNames(
        'flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--color-ink-100)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
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
            tabIndex={isActive ? 0 : -1}
            onClick={(): void => {
              onTabChange(tabItem.value)
            }}
            className={joinClassNames(
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-[var(--color-card)] text-[var(--color-ink-900)] shadow-[var(--shadow-card)]'
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
