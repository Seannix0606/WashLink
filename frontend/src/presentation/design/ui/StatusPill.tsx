import type { ReactElement } from 'react'
import { serviceBookingStatusGroup, serviceBookingStatusLabel, type ServiceBookingStatus } from '@washlink/shared'
import { joinClassNames } from '../classNames'
import { statusGroupColors } from './statusColors'

interface StatusPillProps {
  readonly status: ServiceBookingStatus
  /** Overrides the standard label, for example a washer-facing wording. */
  readonly label?: string
  readonly className?: string
}

/** A booking status: a colored dot and the status in words, in that status group's colors. */
export function StatusPill({ status, label, className }: StatusPillProps): ReactElement {
  const group = serviceBookingStatusGroup[status]
  const colors = statusGroupColors(group)
  return (
    <span data-status-group={group}
      className={joinClassNames('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
      style={{ backgroundColor: colors.background, color: colors.text }}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.line }} />
      {label ?? serviceBookingStatusLabel[status]}
    </span>
  )
}
