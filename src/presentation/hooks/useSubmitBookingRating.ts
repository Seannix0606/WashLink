import { useCallback, useState } from 'react'
import type { BookingService } from '../../application/services/BookingService'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseSubmitBookingRatingOptions {
  readonly bookingService: BookingService
  readonly customerIdentifier: string
}

interface SubmitBookingRatingInput {
  readonly bookingIdentifier: string
  readonly ratingStars: number
  readonly ratingComment: string | null
}

interface UseSubmitBookingRatingResult {
  readonly submitBookingRating: (
    submitBookingRatingInput: SubmitBookingRatingInput,
  ) => Promise<boolean>
  readonly submittingRatingForBookingIdentifier: string | null
}

export function useSubmitBookingRating({
  bookingService,
  customerIdentifier,
}: UseSubmitBookingRatingOptions): UseSubmitBookingRatingResult {
  const [
    submittingRatingForBookingIdentifier,
    setSubmittingRatingForBookingIdentifier,
  ] = useState<string | null>(null)

  const submitBookingRating = useCallback(
    async (
      submitBookingRatingInput: SubmitBookingRatingInput,
    ): Promise<boolean> => {
      setSubmittingRatingForBookingIdentifier(
        submitBookingRatingInput.bookingIdentifier,
      )
      try {
        const ratingSubmissionResult = await runServiceActionWithToast(
          () =>
            bookingService.submitBookingRatingForCustomer(
              submitBookingRatingInput.bookingIdentifier,
              customerIdentifier,
              submitBookingRatingInput.ratingStars,
              submitBookingRatingInput.ratingComment,
            ),
          {
            successMessage: 'Thanks for the feedback!',
            fallbackErrorMessage: 'Could not submit your rating.',
          },
        )
        return ratingSubmissionResult !== null
      } finally {
        setSubmittingRatingForBookingIdentifier(null)
      }
    },
    [bookingService, customerIdentifier],
  )

  return { submitBookingRating, submittingRatingForBookingIdentifier }
}
