import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'
import { useMediaQuery, WIDE_SCREEN_QUERY } from '../useMediaQuery'
import { BrandMark } from './BrandMark'

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
   * edge of the band. Desktop (1024px and wider): a full-height dark sidebar against the left edge of the screen.
   */
  readonly navigation?: ReactNode
  /**
   * A glance panel shown to the right of the content on wide screens (1280px and wider) only. It must repeat nothing
   * the page can't do without: below that width it is not rendered at all.
   */
  readonly summary?: ReactNode
}

/**
 * Every signed-in page. Phones and tablets: the deep navy-teal "harbor" band with the top bar and title, the floating
 * navigation bar, then the content. Desktop with navigation: an app layout, with the brand and navigation in a dark
 * sidebar against the left edge and the band plus content filling the rest of the screen. The navigation is rendered
 * once; CSS grid areas move it between the two places.
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
  summary,
}: AppShellProps): ReactElement {
  const hasHeading = title !== undefined
  const hasNavigation = navigation !== undefined
  const isWide = useMediaQuery(WIDE_SCREEN_QUERY)
  const isSummaryShown = summary !== undefined && isWide
  // Content stays readable on very large screens; it is centered in the space beside the sidebar.
  const contentWidth = hasNavigation ? 'max-w-[90rem]' : 'max-w-6xl'

  return (
    <div
      data-sidebar={hasNavigation ? 'true' : undefined}
      className={joinClassNames(
        'group/shell min-h-[100dvh] bg-[var(--color-surface-sunken)]',
        hasNavigation
          ? 'grid grid-cols-1 [grid-template-areas:"band"_"nav"_"main"] lg:grid-cols-[16rem_minmax(0,1fr)] lg:[grid-template-areas:"side_band"_"side_main"] lg:grid-rows-[auto_1fr]'
          : 'flex flex-col',
      )}
    >
      <header className="wl-harbor [grid-area:band]">
        {topBar ? (
          <div className="sticky top-0 z-30 border-b border-white/10 bg-[var(--color-harbor-900)]/85 backdrop-blur">
            {topBar}
          </div>
        ) : null}
        {hasHeading ? (
          <div className={joinClassNames(
            'mx-auto flex w-full flex-wrap items-end justify-between gap-3 px-4 pt-5 sm:px-6 lg:px-8',
            contentWidth,
            hasNavigation ? 'pb-14 lg:pb-10' : 'pb-8',
          )}>
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-on-harbor)] sm:text-3xl">{title}</h1>
              {subtitle !== undefined ? <p className="mt-1 text-sm text-[var(--color-on-harbor-muted)]">{subtitle}</p> : null}
            </div>
            {headerAside}
          </div>
        ) : null}
      </header>

      {hasNavigation ? (
        <aside className={joinClassNames(
          'relative z-20 px-4 [grid-area:nav] sm:px-6',
          hasHeading ? '-mt-8' : 'mt-4',
          // Desktop: a full-height dark rail with the brand on top, stuck to the left edge while the page scrolls.
          'lg:sticky lg:top-0 lg:mt-0 lg:flex lg:h-[100dvh] lg:flex-col lg:gap-6 lg:border-r lg:border-white/10 lg:bg-[var(--color-harbor-950)] lg:px-3 lg:py-4 lg:[grid-area:side]',
        )}>
          <div className="hidden px-2 pt-0.5 lg:block">
            <BrandMark size="sm" tone="inverse" />
          </div>
          <nav aria-label="Sections">{navigation}</nav>
        </aside>
      ) : null}

      <div className={joinClassNames(
        'mx-auto w-full flex-1 px-4 sm:px-6 lg:px-8',
        hasNavigation ? '[grid-area:main]' : '',
        contentWidth,
        isSummaryShown ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8' : '',
      )}>
        <main
          className={joinClassNames(
            'min-w-0 py-5 pb-24 sm:pb-10',
            hasNavigation ? 'lg:pt-8' : '',
            mainClassName,
          )}
        >
          {children}
        </main>
        {isSummaryShown ? (
          <aside aria-label="Summary" className="space-y-4 py-5 xl:sticky xl:top-20 xl:self-start xl:pt-8">
            {summary}
          </aside>
        ) : null}
      </div>
      {bottomNav}
    </div>
  )
}
