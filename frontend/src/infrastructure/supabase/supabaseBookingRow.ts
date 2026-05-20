import type { Booking, BookingStatus } from '../../domain/models/Booking'

const allowedBookingStatusList: readonly BookingStatus[] = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
] as const

export function mapDatabaseBookingStatusToBookingStatus(
  rawBookingStatusValue: string,
): BookingStatus {
  const matchedBookingStatus = allowedBookingStatusList.find(
    (allowedBookingStatus) => allowedBookingStatus === rawBookingStatusValue,
  )
  if (matchedBookingStatus !== undefined) {
    return matchedBookingStatus
  }
  return 'pending'
}

export const supabaseBookingSelectColumns =
  'id, customer_name, customer_id, vehicle_type, service_type, address, time, booking_status, created_at, assigned_worker_id, shop_id, latitude, longitude, customer_notes, customer_rating_stars, customer_rating_comment, customer_rated_at'

export interface SupabaseBookingRow {
  id: string
  customer_name: string
  customer_id?: string | null
  vehicle_type: string
  service_type: string
  address: string
  time: string
  booking_status: string
  created_at: string
  assigned_worker_id?: string | null
  shop_id?: string | null
  latitude?: number | null
  longitude?: number | null
  customer_notes?: string | null
  customer_rating_stars?: number | null
  customer_rating_comment?: string | null
  customer_rated_at?: string | null
}

export function mapSupabaseBookingRowToBooking(
  bookingRow: SupabaseBookingRow,
): Booking {
  const assignedWorkerIdValue = bookingRow.assigned_worker_id
  const hasAssignedWorker =
    typeof assignedWorkerIdValue === 'string' && assignedWorkerIdValue.length > 0

  const trimmedCustomerNotes =
    typeof bookingRow.customer_notes === 'string'
      ? bookingRow.customer_notes.trim()
      : ''

  const parsedCustomerRatingStars =
    typeof bookingRow.customer_rating_stars === 'number' &&
    Number.isFinite(bookingRow.customer_rating_stars)
      ? Math.round(bookingRow.customer_rating_stars)
      : null

  const trimmedCustomerRatingComment =
    typeof bookingRow.customer_rating_comment === 'string'
      ? bookingRow.customer_rating_comment.trim()
      : ''

  const baseBooking: Booking = {
    id: bookingRow.id,
    customerName: bookingRow.customer_name,
    vehicleType: bookingRow.vehicle_type,
    serviceType: bookingRow.service_type,
    address: bookingRow.address,
    time: bookingRow.time,
    bookingStatus: mapDatabaseBookingStatusToBookingStatus(bookingRow.booking_status),
    createdAt: bookingRow.created_at,
    customerIdentifier: bookingRow.customer_id ?? null,
    shopIdentifier: bookingRow.shop_id ?? null,
    latitude:
      typeof bookingRow.latitude === 'number' ? bookingRow.latitude : null,
    longitude:
      typeof bookingRow.longitude === 'number' ? bookingRow.longitude : null,
    customerNotes: trimmedCustomerNotes.length > 0 ? trimmedCustomerNotes : null,
    customerRatingStars: parsedCustomerRatingStars,
    customerRatingComment:
      trimmedCustomerRatingComment.length > 0
        ? trimmedCustomerRatingComment
        : null,
    customerRatedAt:
      typeof bookingRow.customer_rated_at === 'string'
        ? bookingRow.customer_rated_at
        : null,
  }

  if (hasAssignedWorker) {
    return {
      ...baseBooking,
      assignedWorkerIdentifier: assignedWorkerIdValue,
    }
  }

  return baseBooking
}
