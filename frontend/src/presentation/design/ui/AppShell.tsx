import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

interface AppShellProps {
  readonly topBar?: ReactNode
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly mainClassName?: string
  /** The page title, shown large on the harbor band (the page's h1). */
  readonly title?: ReactNode
  readonly subtitle?: ReactNode
  /** Extra content beside the title on the band, such as a status chip. */
  readonly headerAside?: ReactNode
  /**
   * The page's sections (usually a Tabs with variant "navigation"). Phones and tablets: a floating bar at the bottom
   * edge of the band. Desktop (1024px and wider): a sticky sidebar to the left of the content.
   */
  readonly navigation?: ReactNode
}

/**
 * Every signed-in page: a deep navy-teal "harbor" band with the top bar and the page title, then the content on a cool
 * mist background. The navigation is rendered once and only its placement changes with the screen width.
 */
export function AppShell({
  topBar,
  bottomNav,
  children,
  mainClassName,
  title,
  subtitle,
  headerAside,
  navigation,
}: AppShellProps): ReactElement {
  const hasHeading = title !== undefined
  const hasNavigation = navigation !== undefined
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-surface-sunken)]">
      <header className="wl-harbor">
        {topBar ? (
          <div className="sticky top-0 z-30 border-b border-white/10 bg-[var(--color-harbor-900)]/85 backdrop-blur">
            {topBar}
          </div>
        ) : null}
        {hasHeading ? (
          <div className={joinClassNames(
            'mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-3 px-4 pt-5 sm:px-6 lg:px-8',
            hasNavigation ? 'pb-14 lg:pb-12' : 'pb-8',
          )}>
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-on-harbor)] sm:text-3xl">{title}</h1>
              {subtitle !== undefined ? <p className="mt-1 text-sm text-[var(--color-on-harbor-muted)]">{subtitle}</p> : null}
            </div>
            {headerAside}
          </div>
        ) : null}
      </header>
      <div className={joinClassNames(
        'mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-8',
        hasNavigation ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8' : '',
      )}>
        {hasNavigation ? (
          <nav aria-label="Sections" className={joinClassNames(
            'relative z-20 lg:sticky lg:top-20 lg:self-start',
            // With a title the bar overlaps the band's bottom edge; without one it sits just below the band.
            hasHeading ? '-mt-8 lg:-mt-6' : 'mt-4 lg:mt-6',
          )}>
            {navigation}
          </nav>
        ) : null}
        <main
          className={joinClassNames(
            'min-w-0 flex-1 py-5 pb-24 sm:pb-10',
            hasNavigation ? 'lg:pt-6' : '',
            mainClassName,
          )}
        >
          {children}
        </main>
      </div>
      {bottomNav}
    </div>
  )
}
