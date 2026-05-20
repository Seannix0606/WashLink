import { useCallback, useState } from 'react'
import type { ShopVerificationService } from '../../application/services/ShopVerificationService'
import type { Shop } from '../../domain/models/Shop'
import type {
  ShopVerificationDocument,
  ShopVerificationDocumentType,
} from '../../domain/models/ShopVerificationDocument'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseShopVerificationActionsOptions {
  readonly shopVerificationService: ShopVerificationService
  readonly ownerIdentifier: string
}

interface UploadVerificationDocumentActionInput {
  readonly shopIdentifier: string
  readonly documentType: ShopVerificationDocumentType
  readonly file: File
}

interface UseShopVerificationActionsResult {
  readonly uploadingDocumentType: ShopVerificationDocumentType | null
  readonly deletingDocumentIdentifier: string | null
  readonly isSubmittingShopForReview: boolean
  readonly uploadVerificationDocument: (
    uploadActionInput: UploadVerificationDocumentActionInput,
  ) => Promise<ShopVerificationDocument | null>
  readonly deleteVerificationDocument: (
    documentIdentifier: string,
  ) => Promise<boolean>
  readonly submitShopForReview: (shopIdentifier: string) => Promise<Shop | null>
}

export function useShopVerificationActions({
  shopVerificationService,
  ownerIdentifier,
}: UseShopVerificationActionsOptions): UseShopVerificationActionsResult {
  const [uploadingDocumentType, setUploadingDocumentType] =
    useState<ShopVerificationDocumentType | null>(null)
  const [deletingDocumentIdentifier, setDeletingDocumentIdentifier] =
    useState<string | null>(null)
  const [isSubmittingShopForReview, setIsSubmittingShopForReview] =
    useState<boolean>(false)

  const uploadVerificationDocument = useCallback(
    async (
      uploadActionInput: UploadVerificationDocumentActionInput,
    ): Promise<ShopVerificationDocument | null> => {
      setUploadingDocumentType(uploadActionInput.documentType)
      try {
        const uploadedDocument = await runServiceActionWithToast(
          () =>
            shopVerificationService.uploadDocument({
              shopIdentifier: uploadActionInput.shopIdentifier,
              documentType: uploadActionInput.documentType,
              fileBlob: uploadActionInput.file,
              originalFileName: uploadActionInput.file.name,
              contentType:
                uploadActionInput.file.type.length > 0
                  ? uploadActionInput.file.type
                  : 'application/octet-stream',
              uploadedByIdentifier: ownerIdentifier,
            }),
          {
            successMessage: 'Document uploaded.',
            fallbackErrorMessage: 'Could not upload this document.',
          },
        )
        return uploadedDocument
      } finally {
        setUploadingDocumentType(null)
      }
    },
    [ownerIdentifier, shopVerificationService],
  )

  const deleteVerificationDocument = useCallback(
    async (documentIdentifier: string): Promise<boolean> => {
      setDeletingDocumentIdentifier(documentIdentifier)
      try {
        const deletionResult = await runServiceActionWithToast(
          async () => {
            await shopVerificationService.deleteDocument(documentIdentifier)
            return true
          },
          {
            successMessage: 'Document removed.',
            fallbackErrorMessage: 'Could not remove this document.',
          },
        )
        return deletionResult === true
      } finally {
        setDeletingDocumentIdentifier(null)
      }
    },
    [shopVerificationService],
  )

  const submitShopForReview = useCallback(
    async (shopIdentifier: string): Promise<Shop | null> => {
      setIsSubmittingShopForReview(true)
      try {
        const submittedShop = await runServiceActionWithToast(
          () =>
            shopVerificationService.submitShopForVerification(
              shopIdentifier,
              ownerIdentifier,
            ),
          {
            successMessage: 'Shop submitted for review.',
            fallbackErrorMessage: 'Could not submit the shop for review.',
          },
        )
        return submittedShop
      } finally {
        setIsSubmittingShopForReview(false)
      }
    },
    [ownerIdentifier, shopVerificationService],
  )

  return {
    uploadingDocumentType,
    deletingDocumentIdentifier,
    isSubmittingShopForReview,
    uploadVerificationDocument,
    deleteVerificationDocument,
    submitShopForReview,
  }
}
