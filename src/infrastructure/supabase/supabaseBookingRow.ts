import type { Booking, BookingStatus } from '../../domain/models/Booking'

const allowedBookingStatusList: readonly BookingStatus[] = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
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
  'id, customer_name, customer_id, vehicle_type, service_type, address, time, booking_status, created_at, assigned_worker_id, shop_id, latitude, longitude'

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
}

export function mapSupabaseBookingRowToBooking(
  bookingRow: SupabaseBookingRow,
): Booking {
  const assignedWorkerIdValue = bookingRow.assigned_worker_id
  const hasAssignedWorker =
    typeof assignedWorkerIdValue === 'string' && assignedWorkerIdValue.length > 0

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
  }

  if (hasAssignedWorker) {
    return {
      ...baseBooking,
      assignedWorkerIdentifier: assignedWorkerIdValue,
    }
  }

  return baseBooking
}
