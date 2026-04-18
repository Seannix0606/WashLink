import { useCallback } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import type { Booking } from '../../domain/models/Booking'

interface UseOwnerBookingActionsOptions {
  readonly onBookingUpdated: (updatedBooking: Booking) => void
}

interface UseOwnerBookingActionsResult {
  readonly acceptOwnerBooking: (bookingIdentifier: string) => Promise<void>
  readonly rejectOwnerBooking: (bookingIdentifier: string) => Promise<void>
  readonly assignWorkerToOwnerBooking: (
    bookingIdentifier: string,
    workerIdentifier: string,
  ) => Promise<void>
}

export function useOwnerBookingActions(
  bookingService: BookingService,
  { onBookingUpdated }: UseOwnerBookingActionsOptions,
): UseOwnerBookingActionsResult {
  const acceptOwnerBooking = useCallback(
    async (bookingIdentifier: string): Promise<void> => {
      const updatedBooking =
        await bookingService.acceptBooking(bookingIdentifier)
      onBookingUpdated(updatedBooking)
    },
    [bookingService, onBookingUpdated],
  )

  const rejectOwnerBooking = useCallback(
    async (bookingIdentifier: string): Promise<void> => {
      const updatedBooking =
        await bookingService.rejectBooking(bookingIdentifier)
      onBookingUpdated(updatedBooking)
    },
    [bookingService, onBookingUpdated],
  )

  const assignWorkerToOwnerBooking = useCallback(
    async (
      bookingIdentifier: string,
      workerIdentifier: string,
    ): Promise<void> => {
      const updatedBooking = await bookingService.assignWorkerToBooking(
        bookingIdentifier,
        workerIdentifier,
      )
      onBookingUpdated(updatedBooking)
    },
    [bookingService, onBookingUpdated],
  )

  return {
    acceptOwnerBooking,
    rejectOwnerBooking,
    assignWorkerToOwnerBooking,
  }
}
