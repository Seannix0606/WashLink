import type { VehicleCategory } from './catalog'
import { bookingLimits } from './validation'

/** What the customer has chosen so far in the booking steps, on web and mobile. */
export interface BookingDraft {
  readonly isImmediate: boolean
  readonly scheduledAt: string | null
  readonly address: string
  readonly latitude: number | null
  readonly longitude: number | null
  readonly landmark: string
  readonly instructions: string
  readonly serviceId: string | null
  readonly addonIds: readonly string[]
  readonly vehicleCategory: VehicleCategory
  readonly vehicleMake: string
  readonly vehicleModel: string
}

export const emptyBookingDraft: BookingDraft = {
  isImmediate: false, scheduledAt: null, address: '', latitude: null, longitude: null, landmark: '', instructions: '',
  serviceId: null, addonIds: [], vehicleCategory: 'sedan', vehicleMake: '', vehicleModel: '',
}

export const bookingStepTitles = ['When', 'Where', 'Service', 'Vehicle', 'Review'] as const

/** Why the customer can't leave this step yet, or null. The server checks all of this again. */
export function bookingStepProblem(step: number, draft: BookingDraft): string | null {
  if (step === 0 && !draft.isImmediate && draft.scheduledAt === null) {
    return 'Choose a time, or book for as soon as possible.'
  }
  if (step === 1 && (draft.latitude === null || draft.longitude === null || draft.address.trim().length < bookingLimits.addressMinLength)) {
    return 'Pin the location and confirm the full address.'
  }
  if (step === 2 && draft.serviceId === null) {
    return 'Choose a service.'
  }
  if (step === 3 && (draft.vehicleMake.trim() === '' || draft.vehicleModel.trim() === '')) {
    return 'Enter the vehicle make and model.'
  }
  return null
}
