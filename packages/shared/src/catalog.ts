/** Catalog and booking shapes shared by both apps. Field names follow the database read functions. */
export const vehicleCategories = [
  'motorcycle',
  'sedan',
  'hatchback',
  'suv',
  'pickup',
  'mpv',
  'van',
  'other',
] as const

export type VehicleCategory = (typeof vehicleCategories)[number]

/**
 * The vehicle types customers can pick. WashLink doesn't wash motorcycles, so that type is left out here. The database still
 * accepts it, so reopening motorcycle washes only needs it back in this list and an active motorcycle service.
 */
export const customerVehicleCategories: readonly VehicleCategory[] = vehicleCategories.filter((category) => category !== 'motorcycle')

export const vehicleCategoryLabel: Readonly<Record<VehicleCategory, string>> = {
  motorcycle: 'Motorcycle',
  sedan: 'Sedan',
  hatchback: 'Hatchback',
  suv: 'SUV',
  pickup: 'Pickup',
  mpv: 'MPV',
  van: 'Van',
  other: 'Other',
}

export interface BookingQuote {
  readonly basePriceCents: number
  readonly vehicleAdjustmentCents: number
  readonly addonsTotalCents: number
  readonly customerTotalCents: number
  readonly workerEarningsCents: number
  readonly platformFeeCents: number
  readonly durationMinutes: number
}

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'

/** Shows a peso amount from centavos. Prices are integers so totals never drift. */
export function formatPesos(amountInCents: number): string {
  const pesos = amountInCents / 100
  const hasCentavos = amountInCents % 100 !== 0
  return `₱${pesos.toLocaleString('en-PH', {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}
