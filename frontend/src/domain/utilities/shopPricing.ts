import type { Shop } from '../models/Shop'
import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
} from '../models/ShopPricing'

export function findShopServicePrice(
  shop: Shop | null | undefined,
  vehicleType: string,
  serviceType: string,
): number | null {
  if (!shop) {
    return null
  }

  return (
    shop.servicePricing.find(
      (shopServicePrice) =>
        shopServicePrice.vehicleType === vehicleType &&
        shopServicePrice.serviceType === serviceType,
    )?.price ?? null
  )
}

export function shopHasCompletePricing(shop: Shop): boolean {
  return (
    shopPricingVehicleTypes.length * shopPricingServiceTypes.length ===
      shop.servicePricing.length &&
    shopPricingVehicleTypes.every((vehicleType) =>
      shopPricingServiceTypes.every((serviceType) =>
        shop.servicePricing.some(
          (price) =>
            price.vehicleType === vehicleType &&
            price.serviceType === serviceType,
        ),
      ),
    )
  )
}
