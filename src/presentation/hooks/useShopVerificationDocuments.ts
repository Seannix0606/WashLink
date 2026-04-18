import { useCallback, useEffect, useState } from 'react'
import type { ShopVerificationService } from '../../application/services/ShopVerificationService'
import type { ShopVerificationDocument } from '../../domain/models/ShopVerificationDocument'

interface UseShopVerificationDocumentsOptions {
  readonly shopVerificationService: ShopVerificationService
  readonly shopIdentifier: string | null
}

interface UseShopVerificationDocumentsResult {
  readonly verificationDocuments: readonly ShopVerificationDocument[]
  readonly isLoadingVerificationDocuments: boolean
  readonly verificationDocumentsLoadErrorMessage: string | null
  readonly reloadVerificationDocuments: () => Promise<void>
  readonly replaceVerificationDocumentsLocally: (
    nextVerificationDocuments: readonly ShopVerificationDocument[],
  ) => void
}

export function useShopVerificationDocuments({
  shopVerificationService,
  shopIdentifier,
}: UseShopVerificationDocumentsOptions): UseShopVerificationDocumentsResult {
  const [verificationDocuments, setVerificationDocuments] = useState<
    readonly ShopVerificationDocument[]
  >([])
  const [isLoadingVerificationDocuments, setIsLoadingVerificationDocuments] =
    useState<boolean>(false)
  const [
    verificationDocumentsLoadErrorMessage,
    setVerificationDocumentsLoadErrorMessage,
  ] = useState<string | null>(null)

  const loadVerificationDocuments = useCallback(async (): Promise<void> => {
    if (shopIdentifier === null) {
      setVerificationDocuments([])
      return
    }
    setIsLoadingVerificationDocuments(true)
    setVerificationDocumentsLoadErrorMessage(null)
    try {
      const fetchedVerificationDocuments =
        await shopVerificationService.listDocumentsForShop(shopIdentifier)
      setVerificationDocuments(fetchedVerificationDocuments)
    } catch (unexpectedError) {
      const resolvedMessage =
        unexpectedError instanceof Error
          ? unexpectedError.message
          : 'Could not load verification documents.'
      setVerificationDocumentsLoadErrorMessage(resolvedMessage)
    } finally {
      setIsLoadingVerificationDocuments(false)
    }
  }, [shopIdentifier, shopVerificationService])

  useEffect(() => {
    void loadVerificationDocuments()
  }, [loadVerificationDocuments])

  const replaceVerificationDocumentsLocally = useCallback(
    (nextVerificationDocuments: readonly ShopVerificationDocument[]): void => {
      setVerificationDocuments(nextVerificationDocuments)
    },
    [],
  )

  return {
    verificationDocuments,
    isLoadingVerificationDocuments,
    verificationDocumentsLoadErrorMessage,
    reloadVerificationDocuments: loadVerificationDocuments,
    replaceVerificationDocumentsLocally,
  }
}
