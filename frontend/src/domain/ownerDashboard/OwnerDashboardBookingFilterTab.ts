import type { Booking } from '../models/Booking'

export type OwnerDashboardBookingFilterTab =
  | 'pending'
  | 'accepted'
  | 'assigned'
  | 'completed'

export function bookingMatchesOwnerDashboardFilterTab(
  booking: Booking,
  ownerDashboardBookingFilterTab: OwnerDashboardBookingFilterTab,
): boolean {
  switch (ownerDashboardBookingFilterTab) {
    case 'pending':
      return (
        booking.bookingStatus === 'pending' || booking.bookingStatus === 'rejected'
      )
    case 'accepted':
      return (
        booking.bookingStatus === 'accepted' &&
        booking.assignedWorkerIdentifier === undefined
      )
    case 'assigned':
      return (
        booking.assignedWorkerIdentifier !== undefined &&
        (booking.bookingStatus === 'accepted' ||
          booking.bookingStatus === 'in_progress')
      )
    case 'completed':
      return booking.bookingStatus === 'completed'
  }
}
