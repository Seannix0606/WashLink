import { useEffect, useState } from 'react'
import type { ShopService } from '../../application/services/ShopService'
import type { Shop } from '../../domain/models/Shop'

interface UseActiveShopsLoaderResult {
  readonly availableShops: readonly Shop[]
  readonly isLoadingShops: boolean
}

export function useActiveShopsLoader(
  shopService: ShopService,
): UseActiveShopsLoaderResult {
  const [availableShops, setAvailableShops] = useState<readonly Shop[]>([])
  const [isLoadingShops, setIsLoadingShops] = useState<boolean>(true)

  useEffect(() => {
    let isComponentMounted = true

    const loadActiveShops = async (): Promise<void> => {
      setIsLoadingShops(true)
      try {
        const nextAvailableShops = await shopService.listActiveShops()
        if (isComponentMounted) {
          setAvailableShops(nextAvailableShops)
        }
      } catch (loadActiveShopsError) {
        console.warn('Failed to load shops.', loadActiveShopsError)
        if (isComponentMounted) {
          setAvailableShops([])
        }
      } finally {
        if (isComponentMounted) {
          setIsLoadingShops(false)
        }
      }
    }

    void loadActiveShops()

    return (): void => {
      isComponentMounted = false
    }
  }, [shopService])

  return { availableShops, isLoadingShops }
}
