import { useCallback, useState } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import type { Booking, CreateBookingInput } from '../../domain/models/Booking'

interface UseCustomerBookingSubmissionResult {
  submittedBooking: Booking | null
  isSubmittingBooking: boolean
  submitBooking: (createBookingInput: CreateBookingInput) => Promise<void>
  resetSubmittedBooking: () => void
}

export function useCustomerBookingSubmission(
  bookingService: BookingService,
  customerIdentifier: string,
): UseCustomerBookingSubmissionResult {
  const [submittedBooking, setSubmittedBooking] = useState<Booking | null>(null)
  const [isSubmittingBooking, setIsSubmittingBooking] = useState<boolean>(false)

  const submitBooking = useCallback(
    async (createBookingInput: CreateBookingInput): Promise<void> => {
      setIsSubmittingBooking(true)

      try {
        const createdBooking = await bookingService.createBooking(
          createBookingInput,
          customerIdentifier,
        )
        setSubmittedBooking(createdBooking)
      } finally {
        setIsSubmittingBooking(false)
      }
    },
    [bookingService, customerIdentifier],
  )

  const resetSubmittedBooking = useCallback((): void => {
    setSubmittedBooking(null)
  }, [])

  return {
    submittedBooking,
    isSubmittingBooking,
    submitBooking,
    resetSubmittedBooking,
  }
}
