import type { Booking } from '../../domain/models/Booking'

export function shouldIncludeBookingOnWorkerJobList(
  booking: Booking,
  workerIdentifier: string,
): boolean {
  if (booking.assignedWorkerIdentifier !== workerIdentifier) {
    return false
  }
  if (booking.bookingStatus === 'accepted') {
    return true
  }
  if (booking.bookingStatus === 'in_progress') {
    return true
  }
  if (booking.bookingStatus === 'completed') {
    return true
  }
  return false
}
