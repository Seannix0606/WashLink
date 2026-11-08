import type { ServiceBookingStatus } from './bookingStatus'
import type { PaymentStatus, VehicleCategory } from './catalog'

/** What the B2C data calls return and take. Types only. */
export interface CatalogService {
  readonly id: string
  readonly key: string
  readonly category: string
  readonly name: string
  readonly description: string
  readonly imageUrl: string | null
  readonly requirements: string
  readonly basePriceCents: number
  readonly durationMinutes: number
  readonly priceIsDraft: boolean
  readonly supportedVehicles: readonly VehicleCategory[]
}

export interface CatalogAddon {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly priceCents: number
  readonly durationMinutes: number
  readonly priceIsDraft: boolean
}

export interface SavedAddress {
  readonly id: string
  readonly label: string
  readonly address: string
  readonly latitude: number
  readonly longitude: number
  readonly landmark: string
  readonly instructions: string
}

export interface SavedVehicle {
  readonly id: string
  readonly category: VehicleCategory
  readonly make: string
  readonly model: string
  readonly year: number | null
}

export interface TimeSlot {
  readonly startsAt: string
  readonly isAvailable: boolean
}

export interface CustomerBooking {
  readonly id: string
  readonly reference: string
  readonly status: ServiceBookingStatus
  readonly serviceName: string
  readonly addonNames: readonly string[]
  readonly vehicleCategory: VehicleCategory
  readonly vehicleMake: string
  readonly vehicleModel: string
  readonly address: string
  readonly isImmediate: boolean
  readonly scheduledAt: string
  readonly durationMinutes: number
  readonly customerTotalCents: number
  readonly paymentMethod: string
  readonly paymentStatus: PaymentStatus
  readonly workerName: string
  readonly workerPhone: string | null
  readonly hasReview: boolean
}

export interface DispatchRequest {
  readonly id: string
  readonly bookingId: string
  readonly reference: string
  readonly serviceName: string
  readonly addonNames: readonly string[]
  readonly vehicleCategory: VehicleCategory
  readonly isImmediate: boolean
  readonly scheduledAt: string
  readonly durationMinutes: number
  /** The upper bound of a distance band (2, 5, 10, 20, 50 or 200 km), never a measured distance. Show it with `distanceBandLabel`. */
  readonly distanceKm: number | null
  readonly workerEarningsCents: number
  readonly expiresAt: string
}

export interface AssignedBooking {
  readonly id: string
  readonly reference: string
  readonly status: ServiceBookingStatus
  readonly serviceName: string
  readonly addonNames: readonly string[]
  readonly vehicleCategory: VehicleCategory
  readonly vehicleMake: string
  readonly vehicleModel: string
  readonly scheduledAt: string
  readonly durationMinutes: number
  readonly workerEarningsCents: number
  readonly customerTotalCents: number
  readonly paymentMethod: string
  readonly address: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly landmark: string | null
  readonly instructions: string | null
  readonly customerName: string | null
  readonly customerPhone: string | null
}

export interface WorkerAccount {
  readonly verificationStatus: 'pending' | 'verified' | 'rejected' | 'suspended'
  readonly verificationNote: string | null
  readonly bio: string
  readonly skills: readonly string[]
  readonly baseLatitude: number | null
  readonly baseLongitude: number | null
  readonly serviceRadiusKm: number
  readonly isOnline: boolean
}

export interface WorkerSummary {
  readonly completedCount: number
  readonly activeCount: number
  readonly earningsCents: number
  readonly reviewCount: number
  readonly averageRating: number | null
}

export interface WorkerHoursRow {
  readonly weekday: number
  readonly startMinute: number
  readonly endMinute: number
}

export interface NewBookingInput {
  readonly serviceId: string
  readonly vehicleCategory: VehicleCategory
  readonly vehicleMake: string
  readonly vehicleModel: string
  readonly vehicleYear: number | null
  readonly addonIds: readonly string[]
  readonly address: string
  readonly latitude: number
  readonly longitude: number
  readonly landmark: string
  readonly instructions: string
  readonly isImmediate: boolean
  readonly scheduledAt: string | null
  readonly submissionKey: string
}
