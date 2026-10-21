import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
  type ShopServicePrice,
} from '../../domain/models/ShopPricing'

export interface SupabaseShopPricingRow {
  readonly vehicle_type: string
  readonly service_type: string
  readonly price: number | string
}

const validVehicleTypes: ReadonlySet<string> = new Set(
  shopPricingVehicleTypes,
)
const validServiceTypes: ReadonlySet<string> = new Set(
  shopPricingServiceTypes,
)

export function mapSupabaseShopPricingRows(
  pricingRows: readonly SupabaseShopPricingRow[],
): ShopServicePrice[] {
  return pricingRows.flatMap((pricingRow) => {
    const price = Number(pricingRow.price)
    if (
      !validVehicleTypes.has(pricingRow.vehicle_type) ||
      !validServiceTypes.has(pricingRow.service_type) ||
      !Number.isFinite(price)
    ) {
      return []
    }

    return [
      {
        vehicleType: pricingRow.vehicle_type as ShopServicePrice['vehicleType'],
        serviceType: pricingRow.service_type as ShopServicePrice['serviceType'],
        price,
      },
    ]
  })
}
