import { describe, expect, it } from 'vitest'
import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
} from '../../domain/models/ShopPricing'
import { SaveShopPricingInputSchema } from './shopPricingSchemas'

function buildPriceList(priceForFirstEntry: number): {
  vehicleType: string
  serviceType: string
  price: number
}[] {
  return shopPricingVehicleTypes.flatMap((vehicleType) =>
    shopPricingServiceTypes.map((serviceType) => ({
      vehicleType,
      serviceType,
      price: 250,
    })),
  ).map((priceEntry, entryIndex) =>
    entryIndex === 0 ? { ...priceEntry, price: priceForFirstEntry } : priceEntry,
  )
}

describe('SaveShopPricingInputSchema (J18 pricing quote)', () => {
  it('j18_save_shop_pricing_rejects_non_positive_price', () => {
    expect(
      SaveShopPricingInputSchema.safeParse({ prices: buildPriceList(250) }).success,
    ).toBe(true)
    expect(
      SaveShopPricingInputSchema.safeParse({ prices: buildPriceList(0) }).success,
    ).toBe(false)
    expect(
      SaveShopPricingInputSchema.safeParse({ prices: buildPriceList(-5) }).success,
    ).toBe(false)
  })
})
