import type { Shop } from '../../domain/models/Shop'
import type { ShopVerificationDocument } from '../../domain/models/ShopVerificationDocument'
import type {
  ShopVerificationDecisionInput,
  ShopVerificationRepository,
  UploadShopVerificationDocumentInput,
} from '../../domain/repositories/ShopVerificationRepository'

const defaultSignedUrlTtlSeconds = 60 * 10

export class ShopVerificationService {
  public constructor(
    private readonly shopVerificationRepository: ShopVerificationRepository,
  ) {}

  public async listDocumentsForShop(
    shopIdentifier: string,
  ): Promise<readonly ShopVerificationDocument[]> {
    return this.shopVerificationRepository.listDocumentsForShop(shopIdentifier)
  }

  public async uploadDocument(
    uploadInput: UploadShopVerificationDocumentInput,
  ): Promise<ShopVerificationDocument> {
    return this.shopVerificationRepository.uploadDocument(uploadInput)
  }

  public async deleteDocument(documentIdentifier: string): Promise<void> {
    return this.shopVerificationRepository.deleteDocument(documentIdentifier)
  }

  public async createSignedUrlForDocument(
    storagePath: string,
    signedUrlTtlSeconds: number = defaultSignedUrlTtlSeconds,
  ): Promise<string> {
    return this.shopVerificationRepository.createSignedUrlForDocument(
      storagePath,
      signedUrlTtlSeconds,
    )
  }

  public async submitShopForVerification(
    shopIdentifier: string,
    ownerIdentifier: string,
  ): Promise<Shop> {
    return this.shopVerificationRepository.submitShopForVerification(
      shopIdentifier,
      ownerIdentifier,
    )
  }

  public async approveShop(
    decisionInput: ShopVerificationDecisionInput,
  ): Promise<Shop> {
    return this.shopVerificationRepository.approveShop(decisionInput)
  }

  public async rejectShop(
    decisionInput: ShopVerificationDecisionInput,
  ): Promise<Shop> {
    return this.shopVerificationRepository.rejectShop(decisionInput)
  }

  public async requestShopChanges(
    decisionInput: ShopVerificationDecisionInput,
  ): Promise<Shop> {
    return this.shopVerificationRepository.requestShopChanges(decisionInput)
  }
}
