import type { Shop } from '../../domain/models/Shop'
import { computeDistanceInKilometers } from '../services/reverseGeocoding'

export interface ShopWithComputedDistance {
  readonly shop: Shop
  readonly distanceKilometers: number | null
}

interface ReferenceCoordinates {
  readonly latitude: number
  readonly longitude: number
}

export function sortShopsByProximity(
  shops: readonly Shop[],
  referenceCoordinates: ReferenceCoordinates | null,
): readonly ShopWithComputedDistance[] {
  const shopsWithDistance: ShopWithComputedDistance[] = shops.map((shop) => {
    if (
      referenceCoordinates &&
      typeof shop.latitude === 'number' &&
      typeof shop.longitude === 'number'
    ) {
      return {
        shop,
        distanceKilometers: computeDistanceInKilometers(
          referenceCoordinates.latitude,
          referenceCoordinates.longitude,
          shop.latitude,
          shop.longitude,
        ),
      }
    }
    return { shop, distanceKilometers: null }
  })

  return [...shopsWithDistance].sort((firstEntry, secondEntry) => {
    const firstDistance = firstEntry.distanceKilometers
    const secondDistance = secondEntry.distanceKilometers
    if (firstDistance === null && secondDistance === null) {
      return firstEntry.shop.name.localeCompare(secondEntry.shop.name)
    }
    if (firstDistance === null) {
      return 1
    }
    if (secondDistance === null) {
      return -1
    }
    return firstDistance - secondDistance
  })
}
