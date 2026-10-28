import { ShopService } from '../../application/services/ShopService'
import { ShopVerificationService } from '../../application/services/ShopVerificationService'
import { WorkforcePolicyService } from '../../application/services/WorkforcePolicyService'
import { SupabaseShopRepository } from '../../infrastructure/repositories/SupabaseShopRepository'
import { SupabaseShopVerificationRepository } from '../../infrastructure/repositories/SupabaseShopVerificationRepository'
import { SupabaseWorkforcePolicyRepository } from '../../infrastructure/repositories/SupabaseWorkforcePolicyRepository'

interface SuperAdminDependencies {
  readonly shopService: ShopService
  readonly shopVerificationService: ShopVerificationService
  /** W10: informational workforce policies (super_admin; the database checks the role). */
  readonly workforcePolicyService: WorkforcePolicyService
}

export function createSuperAdminDependencies(): SuperAdminDependencies {
  const supabaseShopRepository = new SupabaseShopRepository()
  const supabaseShopVerificationRepository =
    new SupabaseShopVerificationRepository()
  const shopService = new ShopService(supabaseShopRepository)
  const shopVerificationService = new ShopVerificationService(
    supabaseShopVerificationRepository,
  )
  const workforcePolicyService = new WorkforcePolicyService(new SupabaseWorkforcePolicyRepository())
  return { shopService, shopVerificationService, workforcePolicyService }
}
