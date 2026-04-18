import type { ReactElement } from 'react'

interface BookingDetailRowProps {
  readonly iconNode: ReactElement
  readonly label: string
  readonly value: ReactElement | string
}

export function BookingDetailRow({
  iconNode,
  label,
  value,
}: BookingDetailRowProps): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink-100)] text-[var(--color-ink-700)]">
        {iconNode}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-500)]">
          {label}
        </p>
        <div className="text-sm text-[var(--color-ink-900)]">{value}</div>
      </div>
    </div>
  )
}
