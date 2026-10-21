import { z } from 'zod'
import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
} from '../../domain/models/ShopPricing'

export const SaveShopPricingInputSchema = z.object({
  prices: z
    .array(
      z.object({
        vehicleType: z.enum(shopPricingVehicleTypes),
        serviceType: z.enum(shopPricingServiceTypes),
        price: z.number().positive().max(999999.99),
      }),
    )
    .length(
      shopPricingVehicleTypes.length * shopPricingServiceTypes.length,
      'A price is required for every vehicle and wash package.',
    )
    .refine(
      (prices) =>
        new Set(
          prices.map(
            (price) => `${price.vehicleType}:${price.serviceType}`,
          ),
        ).size === prices.length,
      'Each vehicle and wash package can only have one price.',
    ),
})
