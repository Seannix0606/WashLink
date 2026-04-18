import type { ReactElement } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Hourglass,
  Users,
} from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import type { Worker } from '../../../domain/models/Worker'
import { StatCard } from '../../design/ui'

interface OwnerDashboardKpiStripProps {
  readonly bookings: readonly Booking[]
  readonly workers: readonly Worker[]
}

export function OwnerDashboardKpiStrip({
  bookings,
  workers,
}: OwnerDashboardKpiStripProps): ReactElement {
  const pendingBookingsCount = bookings.filter(
    (booking) => booking.bookingStatus === 'pending',
  ).length
  const unassignedAcceptedBookingsCount = bookings.filter(
    (booking) =>
      booking.bookingStatus === 'accepted' &&
      booking.assignedWorkerIdentifier === undefined,
  ).length
  const inProgressBookingsCount = bookings.filter(
    (booking) =>
      booking.bookingStatus === 'in_progress' ||
      (booking.bookingStatus === 'accepted' &&
        booking.assignedWorkerIdentifier !== undefined),
  ).length
  const completedBookingsCount = bookings.filter(
    (booking) => booking.bookingStatus === 'completed',
  ).length
  const availableWorkerCount = workers.filter(
    (worker) => worker.isAvailable,
  ).length

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        icon={<ClipboardList className="h-5 w-5" />}
        label="New requests"
        value={pendingBookingsCount}
        accentTone="warning"
      />
      <StatCard
        icon={<Hourglass className="h-5 w-5" />}
        label="Awaiting worker"
        value={unassignedAcceptedBookingsCount}
        accentTone="neutral"
      />
      <StatCard
        icon={<Clock3 className="h-5 w-5" />}
        label="In progress"
        value={inProgressBookingsCount}
        accentTone="brand"
      />
      <StatCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        label="Completed"
        value={completedBookingsCount}
        accentTone="success"
      />
      <StatCard
        icon={<Users className="h-5 w-5" />}
        label="Team available"
        value={`${availableWorkerCount} / ${workers.length}`}
        accentTone="brand"
      />
    </div>
  )
}
