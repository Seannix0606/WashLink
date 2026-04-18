import type { ReactElement } from 'react'

interface CustomerProfileRowProps {
  readonly label: string
  readonly value: string
}

export function CustomerProfileRow({
  label,
  value,
}: CustomerProfileRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-500)]">
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
        {value}
      </span>
    </div>
  )
}
