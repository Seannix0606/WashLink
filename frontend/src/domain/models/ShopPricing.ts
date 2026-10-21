export const shopPricingVehicleTypes = ['Sedan', 'SUV', 'Pickup'] as const

export const shopPricingServiceTypes = [
  'Basic Wash',
  'Full Wash',
  'Wax',
] as const

export type ShopPricingVehicleType =
  (typeof shopPricingVehicleTypes)[number]

export type ShopPricingServiceType =
  (typeof shopPricingServiceTypes)[number]

export interface ShopServicePrice {
  readonly vehicleType: ShopPricingVehicleType
  readonly serviceType: ShopPricingServiceType
  readonly price: number
}

export interface SaveShopPricingInput {
  readonly prices: readonly ShopServicePrice[]
}
