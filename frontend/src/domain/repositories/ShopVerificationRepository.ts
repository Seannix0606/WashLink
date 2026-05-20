import type { Shop } from '../models/Shop'
import type {
  ShopVerificationDocument,
  ShopVerificationDocumentType,
} from '../models/ShopVerificationDocument'

export interface UploadShopVerificationDocumentInput {
  readonly shopIdentifier: string
  readonly documentType: ShopVerificationDocumentType
  readonly fileBlob: Blob
  readonly originalFileName: string
  readonly contentType: string
  readonly uploadedByIdentifier: string
}

export interface ShopVerificationDecisionInput {
  readonly shopIdentifier: string
  readonly reviewerIdentifier: string
  readonly decisionNotes: string | null
}

export interface ShopVerificationRepository {
  listDocumentsForShop(
    shopIdentifier: string,
  ): Promise<readonly ShopVerificationDocument[]>
  uploadDocument(
    uploadInput: UploadShopVerificationDocumentInput,
  ): Promise<ShopVerificationDocument>
  deleteDocument(documentIdentifier: string): Promise<void>
  createSignedUrlForDocument(
    storagePath: string,
    signedUrlTtlSeconds: number,
  ): Promise<string>
  submitShopForVerification(
    shopIdentifier: string,
    ownerIdentifier: string,
  ): Promise<Shop>
  approveShop(decisionInput: ShopVerificationDecisionInput): Promise<Shop>
  rejectShop(decisionInput: ShopVerificationDecisionInput): Promise<Shop>
  requestShopChanges(decisionInput: ShopVerificationDecisionInput): Promise<Shop>
}
