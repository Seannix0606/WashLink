import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

type CardElevationLevel = 'flat' | 'raised' | 'interactive'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly elevation?: CardElevationLevel
  readonly children?: ReactNode
}

const elevationClassNameByLevel: Record<CardElevationLevel, string> = {
  flat: 'bg-white border border-[var(--color-ink-200)]',
  raised: 'bg-white shadow-[var(--shadow-card)]',
  interactive:
    'bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)] cursor-pointer',
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
