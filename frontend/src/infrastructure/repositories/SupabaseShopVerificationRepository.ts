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
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  mapDocumentRowToDomain,
  mapShopRowToDomain,
  shopSelectColumnsForVerification,
  shopVerificationDocumentSelectColumns,
  type SupabaseShopRowForVerification,
  type SupabaseShopVerificationDocumentRow,
} from '../supabase/supabaseShopVerificationRows'

const shopVerificationDocumentsStorageBucketName =
  'shop-verification-documents'

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
      throw toUserFacingError(error, 'Could not load verification documents. Please try again.')
    }

    const documentRows: SupabaseShopVerificationDocumentRow[] = data
    return documentRows.map(mapDocumentRowToDomain)
  }

  public async uploadDocument(
    uploadInput: UploadShopVerificationDocumentInput,
  ): Promise<ShopVerificationDocument> {
    const supabaseClient = getSupabaseClient()
    const {
      data: { user: signedInUser },
      error: signedInUserError,
    } = await supabaseClient.auth.getUser()

    if (signedInUserError) {
      throw toUserFacingError(signedInUserError, 'Could not confirm your account before uploading. Sign in again and retry.')
    }
    if (!signedInUser) {
      throw new Error('Sign in again before uploading shop documents.')
    }

    const { data: shopOwnerRow, error: shopOwnerError } = await supabaseClient
      .from('shops')
      .select('owner_id')
      .eq('id', uploadInput.shopIdentifier)
      .single()

    if (shopOwnerError) {
      throw toUserFacingError(shopOwnerError, 'Could not confirm you own this shop before uploading. Please try again.')
    }
    if (shopOwnerRow.owner_id !== signedInUser.id) {
      throw new Error(
        'The signed-in account does not own this shop, so it cannot upload its verification documents.',
      )
    }

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
      })

    if (uploadError) {
      throw toUserFacingError(uploadError, 'Could not upload the document. Please try again.')
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
      throw toUserFacingError(upsertError, 'Could not save the document details. Please try again.')
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
      throw toUserFacingError(fetchError, 'Could not find this document. Refresh and try again.')
    }

    const storagePathToRemove: string | null =
      (existingDocumentRow as { storage_path: string | null } | null)
        ?.storage_path ?? null

    const { error: deleteError } = await supabaseClient
      .from('shop_verification_documents')
      .delete()
      .eq('id', documentIdentifier)

    if (deleteError) {
      throw toUserFacingError(deleteError, 'Could not delete the document. Please try again.')
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
      throw toUserFacingError(error, 'Could not open this document. Please try again.')
    }
    if (!data.signedUrl) {
      throw new Error('Document link could not be generated.')
    }
    return data.signedUrl
  }

  // F5: submission goes through the submit_shop_for_verification RPC, which derives the
  // owner from the session and allows pending -> pending and changes_requested -> pending.
  public async submitShopForVerification(shopIdentifier: string): Promise<Shop> {
    const { data, error } = await getSupabaseClient()
      .rpc('submit_shop_for_verification', { p_shop_id: shopIdentifier })
      .select(shopSelectColumnsForVerification)
      .single()

    if (error) {
      throw toUserFacingError(error, 'Could not submit the shop for review.')
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
        // verification_reviewed_by / verification_reviewed_at are set by the server.
      })
      .eq('id', decisionInput.shopIdentifier)
      .select(shopSelectColumnsForVerification)
      .single()

    if (error) {
      throw toUserFacingError(error, 'Could not save the review decision. Please try again.')
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
