import type { ReactElement, ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { joinClassNames } from '../classNames'

interface EmptyStateProps {
  readonly icon?: ReactNode
  readonly title: string
  readonly description?: string
  readonly primaryAction?: ReactNode
  readonly className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div
      className={joinClassNames(
        'flex flex-col items-center justify-center rounded-[var(--radius-surface)] border border-dashed border-[var(--color-card-border)] bg-[radial-gradient(28rem_10rem_at_50%_0%,var(--color-section-head),var(--color-card)_70%)] px-6 py-10 text-center',
        className,
      )}
    >
      <div aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-card)] text-[var(--color-brand-700)] shadow-[var(--shadow-card)] ring-4 ring-[var(--color-accent-soft)]">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--color-ink-900)]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-ink-500)]">{description}</p>
      ) : null}
      {primaryAction ? <div className="mt-4">{primaryAction}</div> : null}
    </div>
  )
}
