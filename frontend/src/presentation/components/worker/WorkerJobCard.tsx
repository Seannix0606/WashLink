import type { ReactElement } from 'react'
import type { Booking } from '../../../domain/models/Booking'
import { Card } from '../../design/ui'
import { WorkerJobCardActions } from './WorkerJobCardActions'
import { WorkerJobCardDetails } from './WorkerJobCardDetails'
import { WorkerJobCardHeader } from './WorkerJobCardHeader'
import { WorkerJobProgressSteps } from './WorkerJobProgressSteps'

interface WorkerJobCardProps {
  readonly booking: Booking
  readonly workerIdentifier: string
  readonly onStartWorkerJob: (bookingIdentifier: string) => Promise<void>
  readonly onCompleteWorkerJob: (bookingIdentifier: string) => Promise<void>
}

export function WorkerJobCard({
  booking,
  workerIdentifier,
  onStartWorkerJob,
  onCompleteWorkerJob,
}: WorkerJobCardProps): ReactElement {
  return (
    <Card elevation="raised" className="space-y-4">
      <WorkerJobCardHeader booking={booking} />
      <WorkerJobCardDetails booking={booking} />
      <WorkerJobProgressSteps bookingStatus={booking.bookingStatus} />
      <WorkerJobCardActions
        booking={booking}
        workerIdentifier={workerIdentifier}
        onStartWorkerJob={onStartWorkerJob}
        onCompleteWorkerJob={onCompleteWorkerJob}
      />
    </Card>
  )
}
