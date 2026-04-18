import type { ReactElement } from 'react'
import { useCallback, useMemo } from 'react'
import { AlertTriangle, BadgeCheck, Send, ShieldCheck } from 'lucide-react'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { Shop } from '../../../domain/models/Shop'
import {
  shopVerificationDocumentTypeDefinitions,
  type ShopVerificationDocument,
  type ShopVerificationDocumentType,
} from '../../../domain/models/ShopVerificationDocument'
import { Badge, Button, Card, applicationToast } from '../../design/ui'
import { useShopVerificationActions } from '../../hooks/useShopVerificationActions'
import { useShopVerificationDocuments } from '../../hooks/useShopVerificationDocuments'
import { describeShopVerificationStatus } from '../../utilities/shopVerificationDisplay'
import { ShopVerificationDocumentSlot } from './ShopVerificationDocumentSlot'

interface OwnerShopVerificationCardProps {
  readonly ownerIdentifier: string
  readonly shop: Shop
  readonly shopVerificationService: ShopVerificationService
  readonly onShopVerificationStatusChanged: (updatedShop: Shop) => void
}

export function OwnerShopVerificationCard({
  ownerIdentifier,
  shop,
  shopVerificationService,
  onShopVerificationStatusChanged,
}: OwnerShopVerificationCardProps): ReactElement {
  const verificationStatusDisplay = describeShopVerificationStatus(
    shop.verificationStatus,
  )

  const {
    verificationDocuments,
    isLoadingVerificationDocuments,
    replaceVerificationDocumentsLocally,
    reloadVerificationDocuments,
  } = useShopVerificationDocuments({
    shopVerificationService,
    shopIdentifier: shop.id,
  })

  const {
    uploadingDocumentType,
    deletingDocumentIdentifier,
    isSubmittingShopForReview,
    uploadVerificationDocument,
    deleteVerificationDocument,
    submitShopForReview,
  } = useShopVerificationActions({
    shopVerificationService,
    ownerIdentifier,
  })

  const documentByType = useMemo<
    Readonly<Partial<Record<ShopVerificationDocumentType, ShopVerificationDocument>>>
  >(() => {
    const lookup: Partial<
      Record<ShopVerificationDocumentType, ShopVerificationDocument>
    > = {}
    for (const verificationDocument of verificationDocuments) {
      lookup[verificationDocument.documentType] = verificationDocument
    }
    return lookup
  }, [verificationDocuments])

  const canMutateDocuments =
    shop.verificationStatus !== 'approved'

  const missingRequiredDocumentCount = useMemo<number>(() => {
    return shopVerificationDocumentTypeDefinitions.filter(
      (documentTypeDefinition) =>
        documentTypeDefinition.isRequired &&
        documentByType[documentTypeDefinition.documentType] === undefined,
    ).length
  }, [documentByType])

  const canSubmitShopForReview =
    canMutateDocuments &&
    missingRequiredDocumentCount === 0 &&
    (shop.verificationStatus === 'pending' ||
      shop.verificationStatus === 'changes_requested') &&
    !isSubmittingShopForReview

  const handleFileSelectedForUpload = useCallback(
    async (
      documentType: ShopVerificationDocumentType,
      selectedFile: File,
    ): Promise<void> => {
      const uploadedDocument = await uploadVerificationDocument({
        shopIdentifier: shop.id,
        documentType,
        file: selectedFile,
      })
      if (uploadedDocument !== null) {
        const nextDocuments = verificationDocuments.filter(
          (existingVerificationDocument) =>
            existingVerificationDocument.documentType !== documentType,
        )
        replaceVerificationDocumentsLocally([
          ...nextDocuments,
          uploadedDocument,
        ])
      }
    },
    [
      replaceVerificationDocumentsLocally,
      shop.id,
      uploadVerificationDocument,
      verificationDocuments,
    ],
  )

  const handleDeleteDocument = useCallback(
    async (documentIdentifier: string): Promise<void> => {
      const wasDeleted = await deleteVerificationDocument(documentIdentifier)
      if (wasDeleted) {
        replaceVerificationDocumentsLocally(
          verificationDocuments.filter(
            (existingVerificationDocument) =>
              existingVerificationDocument.id !== documentIdentifier,
          ),
        )
      }
    },
    [
      deleteVerificationDocument,
      replaceVerificationDocumentsLocally,
      verificationDocuments,
    ],
  )

  const handlePreviewDocument = useCallback(
    async (existingDocument: ShopVerificationDocument): Promise<void> => {
      try {
        const signedUrl = await shopVerificationService.createSignedUrlForDocument(
          existingDocument.storagePath,
        )
        window.open(signedUrl, '_blank', 'noopener,noreferrer')
      } catch (unexpectedError) {
        const resolvedMessage =
          unexpectedError instanceof Error
            ? unexpectedError.message
            : 'Could not open document.'
        applicationToast.error(resolvedMessage)
      }
    },
    [shopVerificationService],
  )

  const handleSubmitShopForReview = useCallback(async (): Promise<void> => {
    const submittedShop = await submitShopForReview(shop.id)
    if (submittedShop !== null) {
      onShopVerificationStatusChanged(submittedShop)
      void reloadVerificationDocuments()
    }
  }, [
    onShopVerificationStatusChanged,
    reloadVerificationDocuments,
    shop.id,
    submitShopForReview,
  ])

  return (
    <Card elevation="flat" className="space-y-4 p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
              {shop.verificationStatus === 'approved' ? (
                <BadgeCheck className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
                {shop.name}
              </p>
              <p className="truncate text-xs text-[var(--color-ink-500)]">
                {shop.address}
              </p>
            </div>
          </div>
        </div>
        <Badge tone={verificationStatusDisplay.badgeTone}>
          {verificationStatusDisplay.displayLabel}
        </Badge>
      </header>

      <div className="rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] p-3">
        <p className="text-sm font-semibold text-[var(--color-ink-900)]">
          {verificationStatusDisplay.headlineText}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-ink-700)]">
          {verificationStatusDisplay.helperText}
        </p>
        {shop.verificationNotes &&
        (shop.verificationStatus === 'rejected' ||
          shop.verificationStatus === 'changes_requested') ? (
          <div className="mt-2 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-danger-50)] p-2 text-xs text-[var(--color-danger-600)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="whitespace-pre-wrap">{shop.verificationNotes}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {shopVerificationDocumentTypeDefinitions.map(
          (documentTypeDefinition) => {
            const existingDocument =
              documentByType[documentTypeDefinition.documentType] ?? null
            return (
              <ShopVerificationDocumentSlot
                key={documentTypeDefinition.documentType}
                documentTypeDefinition={documentTypeDefinition}
                existingDocument={existingDocument}
                isUploadingThisDocumentType={
                  uploadingDocumentType ===
                  documentTypeDefinition.documentType
                }
                isDeletingThisDocument={
                  existingDocument !== null &&
                  deletingDocumentIdentifier === existingDocument.id
                }
                canMutateDocuments={canMutateDocuments}
                onRequestUploadFile={(documentType, selectedFile) =>
                  void handleFileSelectedForUpload(documentType, selectedFile)
                }
                onRequestDeleteDocument={(documentIdentifier) =>
                  void handleDeleteDocument(documentIdentifier)
                }
                onRequestPreviewDocument={(documentToPreview) =>
                  void handlePreviewDocument(documentToPreview)
                }
              />
            )
          },
        )}
      </div>

      {isLoadingVerificationDocuments ? (
        <p className="text-center text-xs text-[var(--color-ink-500)]">
          Loading documents…
        </p>
      ) : null}

      {canMutateDocuments ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--color-ink-500)]">
            {missingRequiredDocumentCount > 0
              ? `Upload ${missingRequiredDocumentCount} more required document${
                  missingRequiredDocumentCount === 1 ? '' : 's'
                } to submit for review.`
              : 'All required documents uploaded. Ready to submit for review.'}
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            leadingIcon={<Send className="h-4 w-4" />}
            isLoading={isSubmittingShopForReview}
            disabled={!canSubmitShopForReview}
            onClick={() => void handleSubmitShopForReview()}
          >
            Submit for review
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
