import type { ReactElement } from 'react'
import { Clock } from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import { Avatar, Badge } from '../../design/ui'
import { describeBookingStatus } from '../../utilities/bookingStatusDisplay'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'

interface WorkerJobCardHeaderProps {
  readonly booking: Booking
}

export function WorkerJobCardHeader({
  booking,
}: WorkerJobCardHeaderProps): ReactElement {
  const statusDisplayDefinition = describeBookingStatus(booking.bookingStatus)

  return (
    <div className="flex items-start gap-3">
      <Avatar fullName={booking.customerName} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
            {booking.customerName}
          </p>
          <Badge tone={statusDisplayDefinition.badgeTone}>
            {statusDisplayDefinition.displayLabel}
          </Badge>
        </div>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-500)]">
          <Clock className="h-3.5 w-3.5" />
          {formatShortDateTime(booking.time)}
        </p>
      </div>
    </div>
  )
}
