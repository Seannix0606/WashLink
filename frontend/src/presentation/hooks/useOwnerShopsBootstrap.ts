import { useCallback, useEffect, useState } from 'react'
import type { ShopService } from '../../application/services/ShopService'
import type { Shop } from '../../domain/models/Shop'

interface UseOwnerShopsBootstrapResult {
  readonly ownerShopList: Shop[]
  readonly isLoadingOwnerShopList: boolean
  readonly reloadOwnerShops: () => Promise<void>
  readonly setOwnerShopList: (nextOwnerShopList: Shop[]) => void
}

export function useOwnerShopsBootstrap(
  shopService: ShopService,
  ownerIdentifier: string,
): UseOwnerShopsBootstrapResult {
  const [ownerShopList, setOwnerShopList] = useState<Shop[]>([])
  const [isLoadingOwnerShopList, setIsLoadingOwnerShopList] =
    useState<boolean>(true)

  const reloadOwnerShops = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingOwnerShopList(true)
      const fetchedOwnerShops =
        await shopService.listShopsByOwnerIdentifier(ownerIdentifier)
      setOwnerShopList([...fetchedOwnerShops])
    } catch (loadOwnerShopsError) {
      console.error('Unable to load shops for owner.', loadOwnerShopsError)
    } finally {
      setIsLoadingOwnerShopList(false)
    }
  }, [ownerIdentifier, shopService])

  useEffect(() => {
    void reloadOwnerShops()
  }, [reloadOwnerShops])

  return {
    ownerShopList,
    isLoadingOwnerShopList,
    reloadOwnerShops,
    setOwnerShopList,
  }
}
