import type { ReactElement, ReactNode } from 'react'
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
        'flex flex-col items-center justify-center rounded-[var(--radius-surface)] border border-dashed border-[var(--color-ink-200)] bg-white px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-[var(--color-ink-900)]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-ink-500)]">{description}</p>
      ) : null}
      {primaryAction ? <div className="mt-4">{primaryAction}</div> : null}
    </div>
  )
}
