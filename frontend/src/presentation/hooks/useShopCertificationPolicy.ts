import { useCallback, useState } from 'react'
import type { CertificationService } from '../../application/services/CertificationService'
import type { ShopCertificationPolicy } from '../../domain/models/Certification'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

export interface UseShopCertificationPolicyResult {
  readonly policy: ShopCertificationPolicy | null
  readonly isLoadingPolicy: boolean
  readonly policyErrorMessage: string | null
  readonly isSavingPolicy: boolean
  readonly reloadPolicy: () => Promise<void>
  /** True when the server saved the new validity. */
  readonly saveValidityMonths: (validityMonths: number) => Promise<boolean>
}

/** The per-shop certification validity (D-5): 1 to 36 months, 12 when not set. */
export function useShopCertificationPolicy(
  certificationService: CertificationService,
  shopId: string,
): UseShopCertificationPolicyResult {
  const [isSavingPolicy, setIsSavingPolicy] = useState<boolean>(false)
  const loadPolicy = useCallback(
    async (): Promise<ShopCertificationPolicy | null> => certificationService.fetchShopPolicy(shopId),
    [certificationService, shopId],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource<ShopCertificationPolicy | null>({
    load: loadPolicy,
    initialResource: null,
    loadFailedMessage: 'Could not load the certification validity.',
  })

  const saveValidityMonths = useCallback(
    async (validityMonths: number): Promise<boolean> => {
      setIsSavingPolicy(true)
      const savedPolicy = await runServiceActionWithToast(
        () => certificationService.setShopValidity(shopId, validityMonths),
        {
          successMessage: (policy) => `New certificates from this shop are valid for ${String(policy.validityMonths)} months.`,
          fallbackErrorMessage: 'Could not save the certification validity.',
        },
      )
      await refresh()
      setIsSavingPolicy(false)
      return savedPolicy !== null
    },
    [certificationService, refresh, shopId],
  )

  return {
    policy: resource,
    isLoadingPolicy: isLoading,
    policyErrorMessage: errorMessage,
    isSavingPolicy,
    reloadPolicy: reload,
    saveValidityMonths,
  }
}
