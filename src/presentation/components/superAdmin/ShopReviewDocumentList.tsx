import type { ReactElement } from 'react'
import { ExternalLink, FileText, FileWarning } from 'lucide-react'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type {
  ShopVerificationDocument,
  ShopVerificationDocumentTypeDefinition,
} from '../../../domain/models/ShopVerificationDocument'
import { shopVerificationDocumentTypeDefinitions } from '../../../domain/models/ShopVerificationDocument'
import { Button, applicationToast } from '../../design/ui'

interface ShopReviewDocumentListProps {
  readonly verificationDocuments: readonly ShopVerificationDocument[]
  readonly shopVerificationService: ShopVerificationService
  readonly isLoadingVerificationDocuments: boolean
}

async function openDocumentInNewTab(
  shopVerificationService: ShopVerificationService,
  documentStoragePath: string,
): Promise<void> {
  try {
    const signedUrl = await shopVerificationService.createSignedUrlForDocument(
      documentStoragePath,
    )
    window.open(signedUrl, '_blank', 'noopener,noreferrer')
  } catch (unexpectedError) {
    const resolvedMessage =
      unexpectedError instanceof Error
        ? unexpectedError.message
        : 'Could not open document.'
    applicationToast.error(resolvedMessage)
  }
}

export function ShopReviewDocumentList({
  verificationDocuments,
  shopVerificationService,
  isLoadingVerificationDocuments,
}: ShopReviewDocumentListProps): ReactElement {
  const documentByType = new Map<string, ShopVerificationDocument>()
  for (const verificationDocument of verificationDocuments) {
    documentByType.set(verificationDocument.documentType, verificationDocument)
  }

  return (
    <ul className="space-y-2">
      {shopVerificationDocumentTypeDefinitions.map(
        (documentTypeDefinition: ShopVerificationDocumentTypeDefinition) => {
          const existingDocument =
            documentByType.get(documentTypeDefinition.documentType) ?? null
          const hasExistingDocument = existingDocument !== null
          return (
            <li
              key={documentTypeDefinition.documentType}
              className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
                    {hasExistingDocument ? (
                      <FileText className="h-4 w-4 text-[var(--color-brand-700)]" />
                    ) : (
                      <FileWarning className="h-4 w-4 text-[var(--color-danger-500)]" />
                    )}
                    {documentTypeDefinition.displayLabel}
                  </p>
                  {hasExistingDocument && existingDocument !== null ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-ink-500)]">
                      {existingDocument.fileName ?? 'Document'} · uploaded{' '}
                      {new Date(existingDocument.uploadedAt).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--color-danger-600)]">
                      Missing — required before approval.
                    </p>
                  )}
                </div>
                {hasExistingDocument && existingDocument !== null ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leadingIcon={<ExternalLink className="h-4 w-4" />}
                    onClick={() =>
                      void openDocumentInNewTab(
                        shopVerificationService,
                        existingDocument.storagePath,
                      )
                    }
                  >
                    Open
                  </Button>
                ) : null}
              </div>
            </li>
          )
        },
      )}
      {isLoadingVerificationDocuments ? (
        <li className="text-center text-xs text-[var(--color-ink-500)]">
          Loading documents…
        </li>
      ) : null}
    </ul>
  )
}
