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
      if (typeof customerBooking.shopIdentifier === 'string') {
        uniqueReferencedShopIdentifierSet.add(customerBooking.shopIdentifier)
      }
    }
    return Array.from(uniqueReferencedShopIdentifierSet)
  }, [customerBookingList])

  const missingShopIdentifiersKey = useMemo<string>(() => {
    const missingShopIdentifierList = referencedShopIdentifiers
      .filter(
        (referencedShopIdentifier) =>
          activeShopLookupByIdentifier[referencedShopIdentifier] === undefined,
      )
      .sort()
    return missingShopIdentifierList.join('|')
  }, [referencedShopIdentifiers, activeShopLookupByIdentifier])

  useEffect(() => {
    if (missingShopIdentifiersKey.length === 0) {
      setFetchedHistoricalShops([])
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
      if (mergedShopLookup[historicalShop.id] === undefined) {
        mergedShopLookup[historicalShop.id] = historicalShop
      }
    }
    return mergedShopLookup
  }, [activeShopLookupByIdentifier, fetchedHistoricalShops])

  return { shopLookupByIdentifier }
}
