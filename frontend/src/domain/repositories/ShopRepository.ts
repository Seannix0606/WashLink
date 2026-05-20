import type {
  CreateShopInput,
  Shop,
  UpdateShopInput,
} from '../models/Shop'

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
  deleteShop(shopIdentifier: string): Promise<void>
}
