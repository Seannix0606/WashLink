/** Field rules both apps show before submitting. The database repeats and enforces each one. */
export const bookingLimits = {
  addressMinLength: 8,
  addressMaxLength: 300,
  landmarkMaxLength: 120,
  instructionsMaxLength: 500,
  vehicleTextMaxLength: 60,
} as const

export function validateServiceAddress(address: string): string | null {
  const length = address.trim().length
  if (length < bookingLimits.addressMinLength) {
    return `Enter the full address (at least ${String(bookingLimits.addressMinLength)} characters).`
  }
  return length > bookingLimits.addressMaxLength ? 'This address is too long.' : null
}

export function validateCoordinates(latitude: number, longitude: number): string | null {
  const isValid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  return isValid ? null : 'Pin the service location on the map.'
}

export function validateVehicleText(label: string, value: string): string | null {
  const length = value.trim().length
  if (length === 0) {
    return `Enter the vehicle ${label}.`
  }
  return length > bookingLimits.vehicleTextMaxLength ? `The vehicle ${label} is too long.` : null
}

/** A key the server uses to refuse a second copy of the same submission. */
export function createBookingSubmissionKey(randomValue: string): string {
  return `booking-${randomValue}`
}
