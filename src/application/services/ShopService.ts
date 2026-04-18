import type {
  CreateShopInput,
  Shop,
  UpdateShopInput,
} from '../../domain/models/Shop'
import type { ShopRepository } from '../../domain/repositories/ShopRepository'

export class ShopService {
  public constructor(private readonly shopRepository: ShopRepository) {}

  public async listActiveShops(): Promise<readonly Shop[]> {
    return this.shopRepository.listActiveShops()
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
    return this.shopRepository.createShop(ownerIdentifier, createShopInput)
  }

  public async updateShop(
    shopIdentifier: string,
    updateShopInput: UpdateShopInput,
  ): Promise<Shop> {
    return this.shopRepository.updateShop(shopIdentifier, updateShopInput)
  }

  public async deleteShop(shopIdentifier: string): Promise<void> {
    await this.shopRepository.deleteShop(shopIdentifier)
  }
}
