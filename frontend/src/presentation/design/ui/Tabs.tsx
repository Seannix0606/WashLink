import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { joinClassNames } from '../classNames'

export interface TabItemDefinition<TabValue extends string> {
  readonly value: TabValue
  readonly label: string
  readonly badgeContent?: ReactNode
  /** Shown before the label in the navigation look (decorative: the label names the tab). */
  readonly icon?: ReactNode
  /** A shorter label for the phone bottom bar, where space is tight (defaults to label). */
  readonly shortLabel?: string
}

/**
 * pill: a compact segmented control inside a page.
 * navigation: a page's main sections, for AppShell's navigation slot. A floating white bar that scrolls sideways on
 * phones and tablets, and a vertical list in AppShell's dark desktop rail (1024px and wider). With isPhoneBottomBar
 * (pair it with AppShell's isNavigationAtBottomOnPhones), phones below 768px get a bottom tab bar instead: every
 * tab visible at once, icon over a short label.
 */
export type TabsVariant = 'pill' | 'navigation'

interface TabsProps<TabValue extends string> {
  readonly tabItems: readonly TabItemDefinition<TabValue>[]
  readonly activeTabValue: TabValue
  readonly onTabChange: (nextTabValue: TabValue) => void
  readonly accessibleLabel: string
  readonly className?: string
  readonly variant?: TabsVariant
  readonly isPhoneBottomBar?: boolean
}

/**
 * One row of tabs. On a narrow phone the row scrolls sideways instead of wrapping, and the active tab is kept in view.
 * Keyboard: Tab reaches the active tab; Left/Right (and Up/Down, for the desktop sidebar)/Home/End move between tabs.
 */
export function Tabs<TabValue extends string>({
  tabItems,
  activeTabValue,
  onTabChange,
  accessibleLabel,
  className,
  variant = 'pill',
  isPhoneBottomBar = false,
}: TabsProps<TabValue>): ReactElement {
  const isNavigation = variant === 'navigation'
  const isBottomBar = isNavigation && isPhoneBottomBar
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabValue])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = tabItems.findIndex((tabItem) => tabItem.value === activeTabValue)
    const last = tabItems.length - 1
    const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const target = isNext ? (current === last ? 0 : current + 1)
      : isPrevious ? (current === 0 ? last : current - 1)
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
        'flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        isNavigation
          ? 'w-full rounded-[var(--radius-surface)] border border-[var(--color-card-border)] bg-[var(--color-card)] p-1.5 shadow-[var(--shadow-card-hover)] lg:flex-col lg:gap-1 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none'
          : 'w-fit rounded-full bg-[var(--color-ink-100)] p-1',
        isBottomBar ? 'max-md:gap-0 max-md:overflow-visible max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:px-1 max-md:pb-[max(0.375rem,env(safe-area-inset-bottom))] max-md:pt-1.5 max-md:shadow-[0_-6px_18px_rgb(10_39_49/0.10)]' : '',
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
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-[var(--duration-quick)]',
              isNavigation
                ? 'min-h-10 rounded-[var(--radius-control)] px-3 py-2 lg:min-h-11 lg:w-full lg:justify-start lg:px-3.5'
                : 'min-h-9 rounded-full px-3.5 py-1.5',
              isBottomBar ? 'max-md:relative max-md:min-h-12 max-md:min-w-0 max-md:flex-1 max-md:shrink max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:px-1 max-md:py-1 max-md:text-[11px] max-md:leading-tight' : '',
              isActive
                ? isNavigation
                  // On the dark desktop rail the selected item is brand teal (navy would vanish there).
                  ? 'bg-[var(--color-selected)] text-[var(--color-on-selected)] shadow-[var(--shadow-button)] lg:bg-[var(--color-primary)] lg:text-white'
                  : 'bg-[var(--color-card)] text-[var(--color-ink-900)] shadow-[var(--shadow-card)]'
                : isNavigation
                  ? 'text-[var(--color-ink-700)] hover:bg-[var(--color-section-head)] hover:text-[var(--color-ink-900)] lg:text-[var(--color-on-harbor-muted)] lg:hover:bg-white/10 lg:hover:text-[var(--color-on-harbor)]'
                  : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
            )}
          >
            {isNavigation && tabItem.icon !== undefined ? (
              <span aria-hidden="true" className={joinClassNames('flex h-4 w-4 items-center justify-center', isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-500)] lg:text-[var(--color-on-harbor-muted)]')}>
                {tabItem.icon}
              </span>
            ) : null}
            <span className={joinClassNames(isNavigation ? 'lg:flex-1 lg:text-left' : undefined, isBottomBar ? 'max-md:sr-only' : undefined)}>{tabItem.label}</span>
            {/* The short label is only seen; screen readers keep reading the full label, so the tab's name never changes. */}
            {isBottomBar ? <span aria-hidden="true" className="max-w-full truncate md:hidden">{tabItem.shortLabel ?? tabItem.label}</span> : null}
            {tabItem.badgeContent !== undefined ? (
              <span
                className={joinClassNames(
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                  // On the bottom bar the count sits on the icon's top right corner.
                  isBottomBar ? 'max-md:absolute max-md:left-1/2 max-md:top-0.5 max-md:ml-1.5 max-md:min-w-[1.125rem] max-md:px-1 max-md:text-[10px] max-md:leading-[1.125rem] max-md:bg-[var(--color-danger-600)] max-md:text-white' : '',
                  isActive
                    ? isNavigation ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-brand-100)] text-[var(--color-brand-800)]'
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
