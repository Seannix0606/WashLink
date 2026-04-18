import { useCallback } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import type { Booking } from '../../domain/models/Booking'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseWorkerJobActionsOptions {
  readonly workerIdentifier: string
  readonly onBookingUpdated: (updatedBooking: Booking) => void
}

interface UseWorkerJobActionsResult {
  readonly startWorkerJob: (bookingIdentifier: string) => Promise<void>
  readonly completeWorkerJob: (bookingIdentifier: string) => Promise<void>
}

export function useWorkerJobActions(
  bookingService: BookingService,
  { workerIdentifier, onBookingUpdated }: UseWorkerJobActionsOptions,
): UseWorkerJobActionsResult {
  const startWorkerJob = useCallback(
    async (bookingIdentifier: string): Promise<void> => {
      if (workerIdentifier.length === 0) {
        return
      }
      const updatedBooking = await runServiceActionWithToast(
        () =>
          bookingService.markWorkerJobAsInProgress(
            bookingIdentifier,
            workerIdentifier,
          ),
        {
          successMessage: 'Job started.',
          fallbackErrorMessage: 'Could not start this job.',
        },
      )
      if (updatedBooking !== null) {
        onBookingUpdated(updatedBooking)
      }
    },
    [bookingService, workerIdentifier, onBookingUpdated],
  )

  const completeWorkerJob = useCallback(
    async (bookingIdentifier: string): Promise<void> => {
      if (workerIdentifier.length === 0) {
        return
      }
      const updatedBooking = await runServiceActionWithToast(
        () =>
          bookingService.markWorkerJobAsCompleted(
            bookingIdentifier,
            workerIdentifier,
          ),
        {
          successMessage: 'Job marked complete.',
          fallbackErrorMessage: 'Could not mark this job complete.',
        },
      )
      if (updatedBooking !== null) {
        onBookingUpdated(updatedBooking)
      }
    },
    [bookingService, workerIdentifier, onBookingUpdated],
  )

  return { startWorkerJob, completeWorkerJob }
}
