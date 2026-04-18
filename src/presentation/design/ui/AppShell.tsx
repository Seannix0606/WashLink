import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

interface AppShellProps {
  readonly topBar?: ReactNode
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly mainClassName?: string
}

export function AppShell({
  topBar,
  bottomNav,
  children,
  mainClassName,
}: AppShellProps): ReactElement {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-surface-sunken)]">
      {topBar ? (
        <div className="sticky top-0 z-30 border-b border-[var(--color-ink-200)] bg-white/90 backdrop-blur">
          {topBar}
        </div>
      ) : null}
      <main
        className={joinClassNames(
          'mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 sm:px-6 sm:pb-8 lg:px-8',
          mainClassName,
        )}
      >
        {children}
      </main>
      {bottomNav}
    </div>
  )
}
