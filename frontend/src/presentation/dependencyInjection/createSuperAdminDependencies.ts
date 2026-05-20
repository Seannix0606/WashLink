import { ShopService } from '../../application/services/ShopService'
import { ShopVerificationService } from '../../application/services/ShopVerificationService'
import { SupabaseShopRepository } from '../../infrastructure/repositories/SupabaseShopRepository'
import { SupabaseShopVerificationRepository } from '../../infrastructure/repositories/SupabaseShopVerificationRepository'

interface SuperAdminDependencies {
  readonly shopService: ShopService
  readonly shopVerificationService: ShopVerificationService
}

export function createSuperAdminDependencies(): SuperAdminDependencies {
  const supabaseShopRepository = new SupabaseShopRepository()
  const supabaseShopVerificationRepository =
    new SupabaseShopVerificationRepository()
  const shopService = new ShopService(supabaseShopRepository)
  const shopVerificationService = new ShopVerificationService(
    supabaseShopVerificationRepository,
  )
  return { shopService, shopVerificationService }
}
