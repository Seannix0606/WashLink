import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

type CardElevationLevel = 'flat' | 'raised' | 'interactive'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly elevation?: CardElevationLevel
  readonly children?: ReactNode
}

const elevationClassNameByLevel: Record<CardElevationLevel, string> = {
  flat: 'bg-[var(--color-card)] border border-[var(--color-card-border)]',
  raised: 'bg-[var(--color-card)] border border-[var(--color-card-border)] shadow-[var(--shadow-card)]',
  interactive:
    'bg-[var(--color-card)] border border-[var(--color-card-border)] shadow-[var(--shadow-card)] transition-[box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out-soft)] hover:border-[var(--color-brand-600)] hover:shadow-[var(--shadow-card-hover)] cursor-pointer',
}

export function Card({
  elevation = 'raised',
  className,
  children,
  ...htmlAttributes
}: CardProps): ReactElement {
  return (
    <div
      className={joinClassNames(
        'rounded-[var(--radius-surface)] p-5',
        elevationClassNameByLevel[elevation],
        className,
      )}
      {...htmlAttributes}
    >
      {children}
    </div>
  )
}
