import type { BookingStatus } from '../../domain/models/Booking'
import type { BadgeTone } from '../design/ui'

interface BookingStatusDisplayDefinition {
  readonly displayLabel: string
  readonly badgeTone: BadgeTone
}

const bookingStatusDisplayDefinitionByStatus: Record<
  BookingStatus,
  BookingStatusDisplayDefinition
> = {
  pending: { displayLabel: 'New', badgeTone: 'warning' },
  accepted: { displayLabel: 'Accepted', badgeTone: 'info' },
  in_progress: { displayLabel: 'In progress', badgeTone: 'brand' },
  completed: { displayLabel: 'Completed', badgeTone: 'success' },
  rejected: { displayLabel: 'Rejected', badgeTone: 'danger' },
  cancelled: { displayLabel: 'Cancelled', badgeTone: 'neutral' },
}

export function describeBookingStatus(
  bookingStatus: BookingStatus,
): BookingStatusDisplayDefinition {
  return bookingStatusDisplayDefinitionByStatus[bookingStatus]
}
