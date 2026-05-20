export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export interface Booking {
  readonly id: string
  readonly customerName: string
  readonly vehicleType: string
  readonly serviceType: string
  readonly address: string
  readonly time: string
  readonly bookingStatus: BookingStatus
  readonly createdAt: string
  readonly assignedWorkerIdentifier?: string
  readonly customerIdentifier: string | null
  readonly shopIdentifier: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly customerNotes: string | null
  readonly customerRatingStars: number | null
  readonly customerRatingComment: string | null
  readonly customerRatedAt: string | null
}

export interface CreateBookingInput {
  readonly customerName: string
  readonly vehicleType: string
  readonly serviceType: string
  readonly address: string
  readonly time: string
  readonly shopIdentifier: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly customerNotes: string | null
}
