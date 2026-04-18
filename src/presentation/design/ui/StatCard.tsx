import type { ReactElement, ReactNode } from 'react'
import { joinClassNames } from '../classNames'

interface StatCardProps {
  readonly icon?: ReactNode
  readonly label: string
  readonly value: ReactNode
  readonly helperText?: string
  readonly accentTone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
  readonly className?: string
}

const accentBackgroundClassNameByTone: Record<
  NonNullable<StatCardProps['accentTone']>,
  string
> = {
  brand: 'bg-[var(--color-brand-50)] text-[var(--color-brand-800)]',
  success: 'bg-[var(--color-success-50)] text-[var(--color-success-600)]',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-600)]',
  danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-600)]',
  neutral: 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]',
}

export function StatCard({
  icon,
  label,
  value,
  helperText,
  accentTone = 'brand',
  className,
}: StatCardProps): ReactElement {
  return (
    <div
      className={joinClassNames(
        'rounded-[var(--radius-surface)] bg-white p-4 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <div
            className={joinClassNames(
              'flex h-10 w-10 items-center justify-center rounded-full',
              accentBackgroundClassNameByTone[accentTone],
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[var(--color-ink-500)]">
            {label}
          </p>
          <p className="text-xl font-semibold text-[var(--color-ink-900)]">{value}</p>
        </div>
      </div>
      {helperText ? (
        <p className="mt-2 text-xs text-[var(--color-ink-500)]">{helperText}</p>
      ) : null}
    </div>
  )
}
