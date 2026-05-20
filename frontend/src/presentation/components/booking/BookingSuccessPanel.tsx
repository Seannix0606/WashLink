import type { ReactElement } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  PlusCircle,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import type { Booking, BookingStatus } from '../../../domain/models/Booking'
import { Badge, Button, Card } from '../../design/ui'
import type { BadgeTone } from '../../design/ui'
import {
  findServiceOptionByValue,
  findVehicleOptionByValue,
} from './bookingCatalog'

interface BookingSuccessPanelProps {
  readonly submittedBooking: Booking
  readonly onBookAnother: () => void
}

const statusToneByStatusKey: Record<BookingStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'brand',
  in_progress: 'info',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

const statusLabelByStatusKey: Record<BookingStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function BookingSuccessPanel({
  submittedBooking,
  onBookAnother,
}: BookingSuccessPanelProps): ReactElement {
  const scheduledDateTime = new Date(submittedBooking.time)
  const vehicleOption = findVehicleOptionByValue(submittedBooking.vehicleType)
  const serviceOption = findServiceOptionByValue(submittedBooking.serviceType)

  return (
    <div className="space-y-5">
      <Card elevation="raised" className="overflow-hidden p-0">
        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-800)] px-6 py-8 text-center text-white">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/15 shadow-[var(--shadow-card)] backdrop-blur-sm">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">You're booked!</h2>
            <p className="text-sm text-white/80">
              We'll assign a nearby pro and keep you posted.
            </p>
          </div>
          <Badge tone="neutral" className="bg-white/15 text-white">
            Booking #{submittedBooking.id.slice(0, 8)}
          </Badge>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <BookingSummaryRow
            icon={<Sparkles className="h-4 w-4" />}
            label="Service"
            value={`${serviceOption?.label ?? submittedBooking.serviceType} · ${
              vehicleOption?.label ?? submittedBooking.vehicleType
            }`}
            trailing={
              <Badge tone={statusToneByStatusKey[submittedBooking.bookingStatus]}>
                {statusLabelByStatusKey[submittedBooking.bookingStatus]}
              </Badge>
            }
          />
          <BookingSummaryRow
            icon={<MapPin className="h-4 w-4" />}
            label="Address"
            value={submittedBooking.address}
          />
          <BookingSummaryRow
            icon={<CalendarClock className="h-4 w-4" />}
            label="Scheduled"
            value={scheduledDateTime.toLocaleString()}
          />
          <BookingSummaryRow
            icon={<Clock className="h-4 w-4" />}
            label="Estimated duration"
            value={serviceOption?.durationLabel ?? '—'}
          />
          <BookingSummaryRow
            icon={<UserCheck className="h-4 w-4" />}
            label="Assigned worker"
            value={
              submittedBooking.assignedWorkerIdentifier
                ? 'Assigned — tap for details'
                : 'Waiting for assignment'
            }
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          isFullWidth
          leadingIcon={<PlusCircle className="h-4 w-4" />}
          onClick={onBookAnother}
        >
          Book another
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          isFullWidth
          onClick={onBookAnother}
        >
          View details
        </Button>
      </div>
    </div>
  )
}

interface BookingSummaryRowProps {
  readonly icon: ReactElement
  readonly label: string
  readonly value: string
  readonly trailing?: ReactElement
}

function BookingSummaryRow({
  icon,
  label,
  value,
  trailing,
}: BookingSummaryRowProps): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-500)]">
          {label}
        </p>
        <p className="text-sm font-semibold text-[var(--color-ink-900)]">
          {value}
        </p>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}
