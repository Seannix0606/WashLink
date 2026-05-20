import type { Booking, BookingStatus } from '../../domain/models/Booking'
import { applicationToast } from '../design/ui'
import { describeCustomerBookingStatusTransition } from './customerBookingStatusTransitions'

export function fireCustomerBookingTransitionToast(
  updatedBooking: Booking,
  previousBookingStatus: BookingStatus,
): void {
  const transitionToast = describeCustomerBookingStatusTransition(
    previousBookingStatus,
    updatedBooking.bookingStatus,
  )
  if (transitionToast === null) {
    return
  }
  if (transitionToast.toastKind === 'success') {
    applicationToast.success(transitionToast.toastMessage)
    return
  }
  if (transitionToast.toastKind === 'error') {
    applicationToast.error(transitionToast.toastMessage)
    return
  }
  applicationToast.info(transitionToast.toastMessage)
}
