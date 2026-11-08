import { describe, expect, it } from 'vitest'
import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
  type ShopServicePrice,
} from '../models/ShopPricing'
import { buildShop } from '../../test/fixtures'
import { findShopServicePrice, shopHasCompletePricing } from './shopPricing'

function buildCompletePriceList(): ShopServicePrice[] {
  return shopPricingVehicleTypes.flatMap((vehicleType, vehicleIndex) =>
    shopPricingServiceTypes.map((serviceType, serviceIndex) => ({
      vehicleType,
      serviceType,
      price: 100 + vehicleIndex * 10 + serviceIndex,
    })),
  )
}

describe('shop pricing (J18 pricing quote)', () => {
  it('j18_find_shop_service_price_matches_vehicle_and_service', () => {
    const shop = buildShop({ servicePricing: buildCompletePriceList() })

    expect(findShopServicePrice(shop, 'SUV', 'Full Wash')).toBe(111)
    expect(findShopServicePrice(shop, 'Sedan', 'Wax')).toBe(102)
    expect(findShopServicePrice(shop, 'Truck', 'Full Wash')).toBeNull()
    expect(findShopServicePrice(null, 'SUV', 'Full Wash')).toBeNull()
    expect(findShopServicePrice(undefined, 'SUV', 'Full Wash')).toBeNull()
  })

  it('j18_shop_has_complete_pricing_requires_all_rates', () => {
    const completePriceList = buildCompletePriceList()

    expect(
      shopHasCompletePricing(buildShop({ servicePricing: completePriceList })),
    ).toBe(true)
    expect(
      shopHasCompletePricing(
        buildShop({ servicePricing: completePriceList.slice(1) }),
      ),
    ).toBe(false)
    expect(shopHasCompletePricing(buildShop({ servicePricing: [] }))).toBe(false)
  })
})
