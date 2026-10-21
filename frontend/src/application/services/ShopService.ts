import type {
  CreateShopInput,
  Shop,
  UpdateShopInput,
} from '../../domain/models/Shop'
import type { SaveShopPricingInput } from '../../domain/models/ShopPricing'
import type { ShopRepository } from '../../domain/repositories/ShopRepository'
import { CreateShopInputSchema, UpdateShopInputSchema } from '../validation/schemas'
import { SaveShopPricingInputSchema } from '../validation/shopPricingSchemas'

export class ShopService {
  public constructor(private readonly shopRepository: ShopRepository) {}

  public async listActiveShops(): Promise<readonly Shop[]> {
    return this.shopRepository.listActiveShops()
  }

  public async listShopsPendingReview(): Promise<readonly Shop[]> {
    return this.shopRepository.listShopsPendingReview()
  }

  public async listAllShopsForReview(): Promise<readonly Shop[]> {
    return this.shopRepository.listAllShopsForReview()
  }

  public async fetchShopsByIdentifiers(
    shopIdentifiers: readonly string[],
  ): Promise<readonly Shop[]> {
    return this.shopRepository.fetchShopsByIdentifiers(shopIdentifiers)
  }

  public async listShopsByOwnerIdentifier(
    ownerIdentifier: string,
  ): Promise<readonly Shop[]> {
    return this.shopRepository.listShopsByOwnerIdentifier(ownerIdentifier)
  }

  public async createShopForOwner(
    ownerIdentifier: string,
    createShopInput: CreateShopInput,
  ): Promise<Shop> {
    const validatedShopInput = CreateShopInputSchema.parse(createShopInput)
    return this.shopRepository.createShop(ownerIdentifier, validatedShopInput)
  }

  public async updateShop(
    shopIdentifier: string,
    updateShopInput: UpdateShopInput,
  ): Promise<Shop> {
    const validatedUpdateShopInput = UpdateShopInputSchema.parse(updateShopInput)
    return this.shopRepository.updateShop(shopIdentifier, validatedUpdateShopInput)
  }

  public async saveShopPricing(
    shopIdentifier: string,
    saveShopPricingInput: SaveShopPricingInput,
  ): Promise<Shop> {
    const validatedPricingInput =
      SaveShopPricingInputSchema.parse(saveShopPricingInput)
    return this.shopRepository.saveShopPricing(
      shopIdentifier,
      validatedPricingInput,
    )
  }

  public async deleteShop(shopIdentifier: string): Promise<void> {
    await this.shopRepository.deleteShop(shopIdentifier)
  }
}
