import type {
  CreateShopInput,
  Shop,
  UpdateShopInput,
} from '../models/Shop'
import type { SaveShopPricingInput } from '../models/ShopPricing'

export interface ShopRepository {
  listActiveShops(): Promise<readonly Shop[]>
  listShopsByOwnerIdentifier(ownerIdentifier: string): Promise<readonly Shop[]>
  listShopsPendingReview(): Promise<readonly Shop[]>
  listAllShopsForReview(): Promise<readonly Shop[]>
  fetchShopsByIdentifiers(shopIdentifiers: readonly string[]): Promise<readonly Shop[]>
  createShop(
    ownerIdentifier: string,
    createShopInput: CreateShopInput,
  ): Promise<Shop>
  updateShop(shopIdentifier: string, updateShopInput: UpdateShopInput): Promise<Shop>
  saveShopPricing(
    shopIdentifier: string,
    saveShopPricingInput: SaveShopPricingInput,
  ): Promise<Shop>
  deleteShop(shopIdentifier: string): Promise<void>
}
