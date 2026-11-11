import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'
import { joinClassNames } from '../classNames'

interface SectionProps {
  readonly title: string
  /** Shown as a small count next to the title, for example the number of bookings. */
  readonly count?: number
  /** A control on the right of the header bar, for example a List / Calendar toggle. */
  readonly action?: ReactNode
  /** A line under the title. */
  readonly description?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

/**
 * An outlined group with a header bar, so related cards read as one block and separate blocks don't run together.
 * The title is an h2, so screen readers and tests find each group by its heading.
 */
export function Section({ title, count, action, description, children, className }: SectionProps): ReactElement {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}
      className={joinClassNames('overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] shadow-[var(--shadow-card)]', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-card-border)] bg-[var(--color-section-head)] px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold tracking-tight text-[var(--color-ink-900)]">
            <span aria-hidden="true" className="h-4 w-1 rounded-full bg-[var(--color-primary-soft)]" />
            {title}
            {count !== undefined ? (
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--color-selected)] px-2 font-[family-name:var(--font-sans)] text-xs font-semibold tabular-nums text-[var(--color-on-selected)]">
                {count}
              </span>
            ) : null}
          </h2>
          {description !== undefined ? <p className="mt-0.5 text-sm text-[var(--color-ink-500)]">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="space-y-3 p-3 sm:p-4">{children}</div>
    </section>
  )
}
