import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

interface PageHeaderProps {
  readonly title: string
  readonly description?: string
  readonly leadingAccessory?: ReactNode
  readonly trailingAccessory?: ReactNode
  readonly className?: string
}

export function PageHeader({
  title,
  description,
  leadingAccessory,
  trailingAccessory,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <header
      className={joinClassNames(
        'flex items-start justify-between gap-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leadingAccessory}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-[var(--color-ink-900)] sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 text-sm text-[var(--color-ink-500)]">{description}</p>
          ) : null}
        </div>
      </div>
      {trailingAccessory ? (
        <div className="flex shrink-0 items-center gap-2">{trailingAccessory}</div>
      ) : null}
    </header>
  )
}
