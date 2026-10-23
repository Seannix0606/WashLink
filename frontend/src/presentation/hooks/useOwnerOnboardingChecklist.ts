import { useEffect, useMemo, useState } from 'react'
import type { ShopVerificationService } from '../../application/services/ShopVerificationService'
import type { Shop } from '../../domain/models/Shop'
import { shopVerificationDocumentTypeDefinitions } from '../../domain/models/ShopVerificationDocument'
import {
  buildOwnerOnboardingChecklist,
  selectOnboardingFocusShop,
  type OwnerOnboardingStep,
} from '../../domain/utilities/ownerOnboardingChecklist'

interface UseOwnerOnboardingChecklistOptions {
  readonly ownerShopList: readonly Shop[]
  readonly shopVerificationService: ShopVerificationService
}

export interface UseOwnerOnboardingChecklistResult {
  readonly focusShop: Shop | null
  readonly onboardingSteps: readonly OwnerOnboardingStep[]
  readonly isOnboardingComplete: boolean
  readonly isLoadingDocumentStatus: boolean
  readonly documentStatusErrorMessage: string | null
}

interface DocumentStatusState {
  readonly shopIdentifier: string
  readonly hasAllRequiredDocuments: boolean | null
  readonly errorMessage: string | null
}

const requiredDocumentTypes = shopVerificationDocumentTypeDefinitions
  .filter((documentTypeDefinition) => documentTypeDefinition.isRequired)
  .map((documentTypeDefinition) => documentTypeDefinition.documentType)

export function useOwnerOnboardingChecklist({
  ownerShopList,
  shopVerificationService,
}: UseOwnerOnboardingChecklistOptions): UseOwnerOnboardingChecklistResult {
  const focusShop = useMemo(() => selectOnboardingFocusShop(ownerShopList), [ownerShopList])
  const focusShopIdentifier = focusShop?.id ?? null
  const isFocusShopApproved = focusShop?.verificationStatus === 'approved'
  const [documentStatus, setDocumentStatus] = useState<DocumentStatusState | null>(null)

  useEffect(() => {
    if (focusShopIdentifier === null || isFocusShopApproved) {
      return
    }
    let isHookMounted = true
    const loadDocumentStatus = async (): Promise<void> => {
      try {
        const shopDocuments =
          await shopVerificationService.listDocumentsForShop(focusShopIdentifier)
        const uploadedTypes = new Set(
          shopDocuments.map((shopDocument) => shopDocument.documentType),
        )
        if (isHookMounted) {
          setDocumentStatus({
            shopIdentifier: focusShopIdentifier,
            hasAllRequiredDocuments: requiredDocumentTypes.every((documentType) =>
              uploadedTypes.has(documentType),
            ),
            errorMessage: null,
          })
        }
      } catch {
        if (isHookMounted) {
          setDocumentStatus({
            shopIdentifier: focusShopIdentifier,
            hasAllRequiredDocuments: null,
            errorMessage: 'Could not check your verification documents.',
          })
        }
      }
    }
    void loadDocumentStatus()
    return (): void => {
      isHookMounted = false
    }
  }, [focusShopIdentifier, isFocusShopApproved, shopVerificationService])

  const currentDocumentStatus =
    documentStatus !== null && documentStatus.shopIdentifier === focusShopIdentifier
      ? documentStatus
      : null

  const onboardingSteps = buildOwnerOnboardingChecklist({
    focusShop,
    hasAllRequiredDocuments: currentDocumentStatus?.hasAllRequiredDocuments ?? null,
  })

  return {
    focusShop,
    onboardingSteps,
    isOnboardingComplete: onboardingSteps.every(
      (onboardingStep) => onboardingStep.stepState === 'done',
    ),
    isLoadingDocumentStatus:
      focusShop !== null && !isFocusShopApproved && currentDocumentStatus === null,
    documentStatusErrorMessage: currentDocumentStatus?.errorMessage ?? null,
  }
}
