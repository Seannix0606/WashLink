import type { ReactElement } from 'react'
import type { BookingService } from '../../../application/services/BookingService'
import type { CreateBookingInput } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { useCustomerBookingSubmission } from '../../hooks/useCustomerBookingSubmission'
import { applicationToast } from '../../design/ui'
import { BookingStepFlow } from '../booking/BookingStepFlow'
import { BookingSuccessPanel } from '../booking/BookingSuccessPanel'
import { CustomerBookingGreetingBanner } from './CustomerBookingGreetingBanner'

interface CustomerBookTabProps {
  readonly bookingService: BookingService
  readonly customerIdentifier: string
  readonly customerFullName: string
  readonly availableShops: readonly Shop[]
  readonly isLoadingShops: boolean
}

export function CustomerBookTab({
  bookingService,
  customerIdentifier,
  customerFullName,
  availableShops,
  isLoadingShops,
}: CustomerBookTabProps): ReactElement {
  const {
    submittedBooking,
    isSubmittingBooking,
    submitBooking,
    resetSubmittedBooking,
  } = useCustomerBookingSubmission(bookingService, customerIdentifier)

  const handleSubmitBooking = async (
    createBookingInput: CreateBookingInput,
  ): Promise<void> => {
    try {
      await submitBooking(createBookingInput)
      applicationToast.success('Booking submitted!')
    } catch (submitBookingError) {
      const fallbackErrorMessage = 'Unable to submit booking. Please try again.'
      const resolvedErrorMessage =
        submitBookingError instanceof Error
          ? submitBookingError.message
          : fallbackErrorMessage
      applicationToast.error(resolvedErrorMessage)
    }
  }

  if (submittedBooking) {
    return (
      <BookingSuccessPanel
        submittedBooking={submittedBooking}
        onBookAnother={resetSubmittedBooking}
      />
    )
  }

  return (
    <div className="space-y-4">
      <CustomerBookingGreetingBanner customerFullName={customerFullName} />
      <BookingStepFlow
        onSubmitBooking={handleSubmitBooking}
        isSubmittingBooking={isSubmittingBooking}
        defaultCustomerName={customerFullName}
        availableShops={availableShops}
        isLoadingShops={isLoadingShops}
      />
    </div>
  )
}
