import type { ReactElement } from 'react'
import { useState } from 'react'
import { CheckCircle2, PlayCircle } from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import { Button } from '../../design/ui'

interface WorkerJobCardActionsProps {
  readonly booking: Booking
  readonly workerIdentifier: string
  readonly onStartWorkerJob: (bookingIdentifier: string) => Promise<void>
  readonly onCompleteWorkerJob: (bookingIdentifier: string) => Promise<void>
}

export function WorkerJobCardActions({
  booking,
  workerIdentifier,
  onStartWorkerJob,
  onCompleteWorkerJob,
}: WorkerJobCardActionsProps): ReactElement {
  const [isStartingJob, setIsStartingJob] = useState<boolean>(false)
  const [isCompletingJob, setIsCompletingJob] = useState<boolean>(false)

  const isAssignedToThisWorker =
    booking.assignedWorkerIdentifier === workerIdentifier
  const canStartJob =
    isAssignedToThisWorker && booking.bookingStatus === 'accepted'
  const canCompleteJob =
    isAssignedToThisWorker && booking.bookingStatus === 'in_progress'

  const handleStartJob = async (): Promise<void> => {
    setIsStartingJob(true)
    await onStartWorkerJob(booking.id)
    setIsStartingJob(false)
  }

  const handleCompleteJob = async (): Promise<void> => {
    setIsCompletingJob(true)
    await onCompleteWorkerJob(booking.id)
    setIsCompletingJob(false)
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="primary"
        size="md"
        leadingIcon={<PlayCircle className="h-4 w-4" />}
        disabled={!canStartJob || isStartingJob}
        isLoading={isStartingJob}
        onClick={() => void handleStartJob()}
      >
        Start job
      </Button>
      <Button
        variant="primary"
        size="md"
        leadingIcon={<CheckCircle2 className="h-4 w-4" />}
        disabled={!canCompleteJob || isCompletingJob}
        isLoading={isCompletingJob}
        onClick={() => void handleCompleteJob()}
      >
        Complete
      </Button>
    </div>
  )
}
