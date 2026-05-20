import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone
  readonly children?: ReactNode
}

const badgeClassNameByTone: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]',
  brand: 'bg-[var(--color-brand-50)] text-[var(--color-brand-800)]',
  success: 'bg-[var(--color-success-50)] text-[var(--color-success-600)]',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-600)]',
  danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-600)]',
  info: 'bg-sky-50 text-sky-700',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...htmlAttributes
}: BadgeProps): ReactElement {
  return (
    <span
      className={joinClassNames(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        badgeClassNameByTone[tone],
        className,
      )}
      {...htmlAttributes}
    >
      {children}
    </span>
  )
}
