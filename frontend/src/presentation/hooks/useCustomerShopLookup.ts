import { useEffect, useMemo, useState } from 'react'
import type { ShopService } from '../../application/services/ShopService'
import type { Booking } from '../../domain/models/Booking'
import type { Shop } from '../../domain/models/Shop'

interface UseCustomerShopLookupResult {
  readonly shopLookupByIdentifier: Readonly<Record<string, Shop>>
}

export function useCustomerShopLookup(
  shopService: ShopService,
  activeShopList: readonly Shop[],
  customerBookingList: readonly Booking[],
): UseCustomerShopLookupResult {
  const [fetchedHistoricalShops, setFetchedHistoricalShops] = useState<
    readonly Shop[]
  >([])

  const activeShopLookupByIdentifier = useMemo<Readonly<Record<string, Shop>>>(() => {
    const nextActiveShopLookup: Record<string, Shop> = {}
    for (const activeShop of activeShopList) {
      nextActiveShopLookup[activeShop.id] = activeShop
    }
    return nextActiveShopLookup
  }, [activeShopList])

  const referencedShopIdentifiers = useMemo<readonly string[]>(() => {
    const uniqueReferencedShopIdentifierSet = new Set<string>()
    for (const customerBooking of customerBookingList) {
      if (customerBooking.shopIdentifier !== null) {
        uniqueReferencedShopIdentifierSet.add(customerBooking.shopIdentifier)
      }
    }
    return Array.from(uniqueReferencedShopIdentifierSet)
  }, [customerBookingList])

  const missingShopIdentifiersKey = useMemo<string>(() => {
    const missingShopIdentifierList = referencedShopIdentifiers
      .filter(
        (referencedShopIdentifier) =>
          !Object.prototype.hasOwnProperty.call(
            activeShopLookupByIdentifier,
            referencedShopIdentifier,
          ),
      )
      .sort()
    return missingShopIdentifierList.join('|')
  }, [referencedShopIdentifiers, activeShopLookupByIdentifier])

  useEffect(() => {
    if (missingShopIdentifiersKey.length === 0) {
      return
    }

    let isComponentMounted = true
    const missingShopIdentifierList = missingShopIdentifiersKey.split('|')

    const loadHistoricalShops = async (): Promise<void> => {
      try {
        const historicalShops = await shopService.fetchShopsByIdentifiers(
          missingShopIdentifierList,
        )
        if (isComponentMounted) {
          setFetchedHistoricalShops(historicalShops)
        }
      } catch (fetchHistoricalShopsError) {
        console.warn(
          'Failed to resolve historical shops for customer bookings.',
          fetchHistoricalShopsError,
        )
        if (isComponentMounted) {
          setFetchedHistoricalShops([])
        }
      }
    }

    void loadHistoricalShops()

    return (): void => {
      isComponentMounted = false
    }
  }, [shopService, missingShopIdentifiersKey])

  const shopLookupByIdentifier = useMemo<Readonly<Record<string, Shop>>>(() => {
    const mergedShopLookup: Record<string, Shop> = {
      ...activeShopLookupByIdentifier,
    }
    for (const historicalShop of fetchedHistoricalShops) {
      if (!(historicalShop.id in mergedShopLookup)) {
        mergedShopLookup[historicalShop.id] = historicalShop
      }
    }
    return mergedShopLookup
  }, [activeShopLookupByIdentifier, fetchedHistoricalShops])

  return { shopLookupByIdentifier }
}
