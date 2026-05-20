import type { ReactElement } from 'react'
import { Car, ChevronRight, Clock, MapPin, UserCircle2 } from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import type { Worker } from '../../../domain/models/Worker'
import { Avatar, Badge } from '../../design/ui'
import { joinClassNames } from '../../design/classNames'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
import { describeBookingStatus } from '../../utilities/bookingStatusDisplay'

interface OwnerBookingRowProps {
  readonly booking: Booking
  readonly workers: readonly Worker[]
  readonly onSelectBooking: (bookingIdentifier: string) => void
}

export function OwnerBookingRow({
  booking,
  workers,
  onSelectBooking,
}: OwnerBookingRowProps): ReactElement {
  const statusDisplayDefinition = describeBookingStatus(booking.bookingStatus)
  const assignedWorker = workers.find(
    (worker) => worker.workerIdentifier === booking.assignedWorkerIdentifier,
  )
  const formattedScheduledTime = formatShortDateTime(booking.time)

  return (
    <button
      type="button"
      onClick={() => onSelectBooking(booking.id)}
      className={joinClassNames(
        'group flex w-full items-center gap-4 rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white p-4 text-left transition-shadow',
        'hover:border-transparent hover:shadow-[var(--shadow-card-hover)]',
      )}
    >
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

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-500)]">
          <span className="inline-flex items-center gap-1">
            <Car className="h-3.5 w-3.5" />
            {booking.vehicleType} · {booking.serviceType}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{booking.address}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formattedScheduledTime}
          </span>
        </div>

        {assignedWorker ? (
          <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-ink-700)]">
            <UserCircle2 className="h-3.5 w-3.5 text-[var(--color-brand-700)]" />
            Assigned to {assignedWorker.workerName}
          </div>
        ) : null}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-400)] transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
