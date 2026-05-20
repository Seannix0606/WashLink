import type { ReactElement } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Loader2,
} from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import { StatCard } from '../../design/ui'

interface WorkerDailyStatsStripProps {
  readonly assignedBookingList: readonly Booking[]
}

export function WorkerDailyStatsStrip({
  assignedBookingList,
}: WorkerDailyStatsStripProps): ReactElement {
  const pendingJobCount = assignedBookingList.filter(
    (booking) => booking.bookingStatus === 'accepted',
  ).length
  const inProgressJobCount = assignedBookingList.filter(
    (booking) => booking.bookingStatus === 'in_progress',
  ).length
  const completedJobCount = assignedBookingList.filter(
    (booking) => booking.bookingStatus === 'completed',
  ).length

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        icon={<ClipboardList className="h-5 w-5" />}
        label="Assigned"
        value={assignedBookingList.length}
        accentTone="brand"
      />
      <StatCard
        icon={<ListChecks className="h-5 w-5" />}
        label="Pending"
        value={pendingJobCount}
        accentTone="warning"
      />
      <StatCard
        icon={<Loader2 className="h-5 w-5" />}
        label="In progress"
        value={inProgressJobCount}
        accentTone="brand"
      />
      <StatCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        label="Completed"
        value={completedJobCount}
        accentTone="success"
      />
    </div>
  )
}
