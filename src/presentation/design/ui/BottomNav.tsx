import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

export interface BottomNavItemDefinition<NavItemValue extends string> {
  readonly value: NavItemValue
  readonly label: string
  readonly icon: ReactNode
}

interface BottomNavProps<NavItemValue extends string> {
  readonly navItems: readonly BottomNavItemDefinition<NavItemValue>[]
  readonly activeNavItemValue: NavItemValue
  readonly onNavItemSelected: (nextNavItemValue: NavItemValue) => void
  readonly className?: string
}

export function BottomNav<NavItemValue extends string>({
  navItems,
  activeNavItemValue,
  onNavItemSelected,
  className,
}: BottomNavProps<NavItemValue>): ReactElement {
  return (
    <nav
      aria-label="Primary"
      className={joinClassNames(
        'fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-ink-200)] bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur sm:hidden',
        className,
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {navItems.map((navItem) => {
          const isActive = navItem.value === activeNavItemValue
          return (
            <li key={navItem.value} className="flex-1">
              <button
                type="button"
                onClick={() => onNavItemSelected(navItem.value)}
                aria-current={isActive ? 'page' : undefined}
                className={joinClassNames(
                  'flex w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
                  isActive
                    ? 'text-[var(--color-brand-700)]'
                    : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
                )}
              >
                <span aria-hidden="true">{navItem.icon}</span>
                <span>{navItem.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
