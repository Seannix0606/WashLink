import type { ChangeEvent, ReactElement } from 'react'
import { useRef } from 'react'
import { FileText, Trash2, Upload } from 'lucide-react'
import type {
  ShopVerificationDocument,
  ShopVerificationDocumentType,
  ShopVerificationDocumentTypeDefinition,
} from '../../../domain/models/ShopVerificationDocument'
import { Button } from '../../design/ui'

interface ShopVerificationDocumentSlotProps {
  readonly documentTypeDefinition: ShopVerificationDocumentTypeDefinition
  readonly existingDocument: ShopVerificationDocument | null
  readonly isUploadingThisDocumentType: boolean
  readonly isDeletingThisDocument: boolean
  readonly canMutateDocuments: boolean
  readonly onRequestUploadFile: (
    documentType: ShopVerificationDocumentType,
    selectedFile: File,
  ) => void
  readonly onRequestDeleteDocument: (documentIdentifier: string) => void
  readonly onRequestPreviewDocument: (
    existingDocument: ShopVerificationDocument,
  ) => void
}

const acceptedFileInputTypes = 'image/png,image/jpeg,image/webp,application/pdf'
const maxFileSizeBytes = 8 * 1024 * 1024

function formatFileSize(fileSizeBytes: number | null): string {
  if (typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) {
    return ''
  }
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`
  }
  if (fileSizeBytes < 1024 * 1024) {
    return `${(fileSizeBytes / 1024).toFixed(1)} KB`
  }
  return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ShopVerificationDocumentSlot({
  documentTypeDefinition,
  existingDocument,
  isUploadingThisDocumentType,
  isDeletingThisDocument,
  canMutateDocuments,
  onRequestUploadFile,
  onRequestDeleteDocument,
  onRequestPreviewDocument,
}: ShopVerificationDocumentSlotProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileInputChanged = (
    changeEvent: ChangeEvent<HTMLInputElement>,
  ): void => {
    const selectedFile = changeEvent.target.files?.[0] ?? null
    changeEvent.target.value = ''
    if (selectedFile === null) {
      return
    }
    if (selectedFile.size > maxFileSizeBytes) {
      window.alert(
        `File is too large. Please upload a file under ${Math.round(
          maxFileSizeBytes / (1024 * 1024),
        )} MB.`,
      )
      return
    }
    onRequestUploadFile(documentTypeDefinition.documentType, selectedFile)
  }

  const hasExistingDocument = existingDocument !== null
  const uploadActionLabel = hasExistingDocument ? 'Replace' : 'Upload'

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
            <FileText className="h-4 w-4 text-[var(--color-brand-700)]" />
            {documentTypeDefinition.displayLabel}
            {documentTypeDefinition.isRequired ? (
              <span className="text-[var(--color-danger-500)]"> *</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            {documentTypeDefinition.helperText}
          </p>
        </div>
      </div>

      {hasExistingDocument && existingDocument !== null ? (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] p-2.5">
          <div className="min-w-0">
            <button
              type="button"
              className="truncate text-left text-sm font-medium text-[var(--color-brand-800)] underline-offset-2 hover:underline"
              onClick={() => onRequestPreviewDocument(existingDocument)}
            >
              {existingDocument.fileName ?? 'View document'}
            </button>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-500)]">
              {formatFileSize(existingDocument.fileSizeBytes)}
              {existingDocument.fileSizeBytes ? ' · ' : ''}
              Uploaded{' '}
              {new Date(existingDocument.uploadedAt).toLocaleDateString()}
            </p>
          </div>
          {canMutateDocuments ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leadingIcon={<Trash2 className="h-4 w-4" />}
              isLoading={isDeletingThisDocument}
              disabled={isDeletingThisDocument || isUploadingThisDocumentType}
              onClick={() => onRequestDeleteDocument(existingDocument.id)}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--color-ink-500)]">
          No document uploaded yet.
        </p>
      )}

      {canMutateDocuments ? (
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFileInputTypes}
            className="hidden"
            onChange={handleFileInputChanged}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<Upload className="h-4 w-4" />}
            isLoading={isUploadingThisDocumentType}
            disabled={
              isUploadingThisDocumentType || isDeletingThisDocument
            }
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadActionLabel} {documentTypeDefinition.displayLabel.toLowerCase()}
          </Button>
          <p className="mt-1 text-[11px] text-[var(--color-ink-500)]">
            PDF or image, up to {Math.round(maxFileSizeBytes / (1024 * 1024))} MB.
          </p>
        </div>
      ) : null}
    </div>
  )
}
