import { useCallback, useState } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseCustomerBookingCancellationOptions {
  readonly bookingService: BookingService
  readonly customerIdentifier: string
}

interface UseCustomerBookingCancellationResult {
  readonly cancelPendingBooking: (bookingIdentifier: string) => Promise<void>
  readonly cancellingBookingIdentifier: string | null
}

export function useCustomerBookingCancellation({
  bookingService,
  customerIdentifier,
}: UseCustomerBookingCancellationOptions): UseCustomerBookingCancellationResult {
  const [cancellingBookingIdentifier, setCancellingBookingIdentifier] =
    useState<string | null>(null)

  const cancelPendingBooking = useCallback(
    async (bookingIdentifier: string): Promise<void> => {
      setCancellingBookingIdentifier(bookingIdentifier)
      try {
        await runServiceActionWithToast(
          () =>
            bookingService.cancelPendingBookingForCustomer(
              bookingIdentifier,
              customerIdentifier,
            ),
          {
            successMessage: 'Booking cancelled.',
            fallbackErrorMessage: 'Unable to cancel booking. Please try again.',
          },
        )
      } finally {
        setCancellingBookingIdentifier(null)
      }
    },
    [bookingService, customerIdentifier],
  )

  return { cancelPendingBooking, cancellingBookingIdentifier }
}
