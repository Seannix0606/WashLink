import type { Shop } from '../../domain/models/Shop'
import type {
  ShopVerificationDocument,
  ShopVerificationDocumentType,
} from '../../domain/models/ShopVerificationDocument'
import {
  mapSupabaseShopPricingRows,
  type SupabaseShopPricingRow,
} from './supabaseShopPricing'

export const shopVerificationDocumentSelectColumns =
  'id, shop_id, document_type, storage_path, file_name, file_size_bytes, content_type, uploaded_by, uploaded_at'

export const shopSelectColumnsForVerification =
  'id, owner_id, name, address, phone_number, latitude, longitude, is_active, created_at, verification_status, verification_notes, verification_submitted_at, verification_reviewed_at, verification_reviewed_by, shop_pricing!shop_pricing_shop_id_fkey(vehicle_type, service_type, price)'

export interface SupabaseShopVerificationDocumentRow {
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

export interface SupabaseShopRowForVerification {
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
  shop_pricing: SupabaseShopPricingRow[]
}

export function mapDocumentRowToDomain(
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

export function mapShopRowToDomain(shopRow: SupabaseShopRowForVerification): Shop {
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
    servicePricing: mapSupabaseShopPricingRows(shopRow.shop_pricing),
  }
}
