import type { Shop } from '../../domain/models/Shop'
import type {
  ShopVerificationDocument,
  ShopVerificationDocumentType,
} from '../../domain/models/ShopVerificationDocument'
import type {
  ShopVerificationDecisionInput,
  ShopVerificationRepository,
  UploadShopVerificationDocumentInput,
} from '../../domain/repositories/ShopVerificationRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'

const shopVerificationDocumentsStorageBucketName =
  'shop-verification-documents'

const shopVerificationDocumentSelectColumns =
  'id, shop_id, document_type, storage_path, file_name, file_size_bytes, content_type, uploaded_by, uploaded_at'

const shopSelectColumnsForVerification =
  'id, owner_id, name, address, phone_number, latitude, longitude, is_active, created_at, verification_status, verification_notes, verification_submitted_at, verification_reviewed_at, verification_reviewed_by'

interface SupabaseShopVerificationDocumentRow {
  id: string
  shop_id: string
  document_type: ShopVerificationDocumentType
  storage_path: string
  file_name: string | null
  file_size_bytes: number | null
  content_type: string | null
  uploaded_by: string | null
  uploaded_at: string
}

interface SupabaseShopRowForVerification {
  id: string
  owner_id: string
  name: string
  address: string
  phone_number: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  created_at: string
  verification_status: string
  verification_notes: string | null
  verification_submitted_at: string | null
  verification_reviewed_at: string | null
  verification_reviewed_by: string | null
}

export class SupabaseShopVerificationRepository
  implements ShopVerificationRepository
{
  public async listDocumentsForShop(
    shopIdentifier: string,
  ): Promise<readonly ShopVerificationDocument[]> {
    const { data, error } = await getSupabaseClient()
      .from('shop_verification_documents')
      .select(shopVerificationDocumentSelectColumns)
      .eq('shop_id', shopIdentifier)

    if (error) {
      throw new Error(
        `Failed to load verification documents: ${error.message}`,
      )
    }

    const documentRows: SupabaseShopVerificationDocumentRow[] = data
    return documentRows.map(mapDocumentRowToDomain)
  }

  public async uploadDocument(
    uploadInput: UploadShopVerificationDocumentInput,
  ): Promise<ShopVerificationDocument> {
    const supabaseClient = getSupabaseClient()

    const existingDocumentStoragePath = await this.findExistingDocumentStoragePath(
      uploadInput.shopIdentifier,
      uploadInput.documentType,
    )

    const fileExtensionCandidate = extractFileExtensionFromName(
      uploadInput.originalFileName,
    )
    const nextStoragePath = buildDocumentStoragePath({
      shopIdentifier: uploadInput.shopIdentifier,
      documentType: uploadInput.documentType,
      fileExtension: fileExtensionCandidate,
    })

    const { error: uploadError } = await supabaseClient.storage
      .from(shopVerificationDocumentsStorageBucketName)
      .upload(nextStoragePath, uploadInput.fileBlob, {
        contentType: uploadInput.contentType,
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Failed to upload document: ${uploadError.message}`)
    }

    const { data: upsertedRow, error: upsertError } = await supabaseClient
      .from('shop_verification_documents')
      .upsert(
        {
          shop_id: uploadInput.shopIdentifier,
          document_type: uploadInput.documentType,
          storage_path: nextStoragePath,
          file_name: uploadInput.originalFileName,
          file_size_bytes: uploadInput.fileBlob.size,
          content_type: uploadInput.contentType,
          uploaded_by: uploadInput.uploadedByIdentifier,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'shop_id,document_type' },
      )
      .select(shopVerificationDocumentSelectColumns)
      .single()

    if (upsertError) {
      throw new Error(
        `Failed to save document metadata: ${upsertError.message}`,
      )
    }

    if (
      existingDocumentStoragePath !== null &&
      existingDocumentStoragePath !== nextStoragePath
    ) {
      await supabaseClient.storage
        .from(shopVerificationDocumentsStorageBucketName)
        .remove([existingDocumentStoragePath])
    }

    return mapDocumentRowToDomain(
      upsertedRow as SupabaseShopVerificationDocumentRow,
    )
  }

  public async deleteDocument(documentIdentifier: string): Promise<void> {
    const supabaseClient = getSupabaseClient()

    const { data: existingDocumentRow, error: fetchError } = await supabaseClient
      .from('shop_verification_documents')
      .select('storage_path')
      .eq('id', documentIdentifier)
      .single()

    if (fetchError) {
      throw new Error(`Failed to locate document: ${fetchError.message}`)
    }

    const storagePathToRemove: string | null =
      (existingDocumentRow as { storage_path: string | null } | null)
        ?.storage_path ?? null

    const { error: deleteError } = await supabaseClient
      .from('shop_verification_documents')
      .delete()
      .eq('id', documentIdentifier)

    if (deleteError) {
      throw new Error(`Failed to delete document: ${deleteError.message}`)
    }

    if (storagePathToRemove !== null) {
      await supabaseClient.storage
        .from(shopVerificationDocumentsStorageBucketName)
        .remove([storagePathToRemove])
    }
  }

  public async createSignedUrlForDocument(
    storagePath: string,
    signedUrlTtlSeconds: number,
  ): Promise<string> {
    const { data, error } = await getSupabaseClient()
      .storage.from(shopVerificationDocumentsStorageBucketName)
      .createSignedUrl(storagePath, signedUrlTtlSeconds)

    if (error) {
      throw new Error(`Failed to generate document link: ${error.message}`)
    }
    if (!data?.signedUrl) {
      throw new Error('Document link could not be generated.')
    }
    return data.signedUrl
  }

  public async submitShopForVerification(
    shopIdentifier: string,
    ownerIdentifier: string,
  ): Promise<Shop> {
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .update({
        verification_status: 'pending',
        verification_submitted_at: new Date().toISOString(),
      })
      .eq('id', shopIdentifier)
      .eq('owner_id', ownerIdentifier)
      .in('verification_status', ['pending', 'changes_requested'])
      .select(shopSelectColumnsForVerification)
      .single()

    if (error) {
      throw new Error(
        `Failed to submit shop for verification: ${error.message}`,
      )
    }
    return mapShopRowToDomain(data as SupabaseShopRowForVerification)
  }

  public async approveShop(
    decisionInput: ShopVerificationDecisionInput,
  ): Promise<Shop> {
    return this.applyReviewDecision({
      decisionInput,
      nextVerificationStatus: 'approved',
    })
  }

  public async rejectShop(
    decisionInput: ShopVerificationDecisionInput,
  ): Promise<Shop> {
    return this.applyReviewDecision({
      decisionInput,
      nextVerificationStatus: 'rejected',
    })
  }

  public async requestShopChanges(
    decisionInput: ShopVerificationDecisionInput,
  ): Promise<Shop> {
    return this.applyReviewDecision({
      decisionInput,
      nextVerificationStatus: 'changes_requested',
    })
  }

  private async applyReviewDecision(options: {
    readonly decisionInput: ShopVerificationDecisionInput
    readonly nextVerificationStatus:
      | 'approved'
      | 'rejected'
      | 'changes_requested'
  }): Promise<Shop> {
    const { decisionInput, nextVerificationStatus } = options
    const { data, error } = await getSupabaseClient()
      .from('shops')
      .update({
        verification_status: nextVerificationStatus,
        verification_notes: decisionInput.decisionNotes,
        verification_reviewed_at: new Date().toISOString(),
        verification_reviewed_by: decisionInput.reviewerIdentifier,
      })
      .eq('id', decisionInput.shopIdentifier)
      .select(shopSelectColumnsForVerification)
      .single()

    if (error) {
      throw new Error(`Failed to update verification status: ${error.message}`)
    }
    return mapShopRowToDomain(data as SupabaseShopRowForVerification)
  }

  private async findExistingDocumentStoragePath(
    shopIdentifier: string,
    documentType: ShopVerificationDocumentType,
  ): Promise<string | null> {
    const { data, error } = await getSupabaseClient()
      .from('shop_verification_documents')
      .select('storage_path')
      .eq('shop_id', shopIdentifier)
      .eq('document_type', documentType)
      .maybeSingle()

    if (error) {
      return null
    }
    const row = data as { storage_path: string | null } | null
    return row?.storage_path ?? null
  }
}

function extractFileExtensionFromName(originalFileName: string): string {
  const lastDotIndex = originalFileName.lastIndexOf('.')
  if (lastDotIndex < 0 || lastDotIndex === originalFileName.length - 1) {
    return 'bin'
  }
  const rawExtension = originalFileName.slice(lastDotIndex + 1).toLowerCase()
  return rawExtension.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
}

function buildDocumentStoragePath(options: {
  readonly shopIdentifier: string
  readonly documentType: ShopVerificationDocumentType
  readonly fileExtension: string
}): string {
  const uniqueFileSuffix = crypto.randomUUID()
  return `${options.shopIdentifier}/${options.documentType}-${uniqueFileSuffix}.${options.fileExtension}`
}

function mapDocumentRowToDomain(
  documentRow: SupabaseShopVerificationDocumentRow,
): ShopVerificationDocument {
  return {
    id: documentRow.id,
    shopIdentifier: documentRow.shop_id,
    documentType: documentRow.document_type,
    storagePath: documentRow.storage_path,
    fileName: documentRow.file_name,
    fileSizeBytes: documentRow.file_size_bytes,
    contentType: documentRow.content_type,
    uploadedByIdentifier: documentRow.uploaded_by,
    uploadedAt: documentRow.uploaded_at,
  }
}

function mapShopRowToDomain(shopRow: SupabaseShopRowForVerification): Shop {
  const verificationStatusCandidate = shopRow.verification_status
  const allowedVerificationStatuses = new Set<Shop['verificationStatus']>([
    'pending',
    'changes_requested',
    'approved',
    'rejected',
  ])
  const verificationStatus = allowedVerificationStatuses.has(
    verificationStatusCandidate as Shop['verificationStatus'],
  )
    ? (verificationStatusCandidate as Shop['verificationStatus'])
    : 'pending'

  return {
    id: shopRow.id,
    ownerIdentifier: shopRow.owner_id,
    name: shopRow.name,
    address: shopRow.address,
    phoneNumber: shopRow.phone_number,
    latitude: typeof shopRow.latitude === 'number' ? shopRow.latitude : null,
    longitude: typeof shopRow.longitude === 'number' ? shopRow.longitude : null,
    isActive: shopRow.is_active,
    createdAt: shopRow.created_at,
    verificationStatus,
    verificationNotes: shopRow.verification_notes,
    verificationSubmittedAt: shopRow.verification_submitted_at,
    verificationReviewedAt: shopRow.verification_reviewed_at,
    verificationReviewedBy: shopRow.verification_reviewed_by,
  }
}
