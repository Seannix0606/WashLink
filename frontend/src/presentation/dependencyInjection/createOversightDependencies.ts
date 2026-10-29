import { CertificationPlatformReviewService } from '../../application/services/CertificationPlatformReviewService'
import { ContractDisputeService } from '../../application/services/ContractDisputeService'
import { WorkforceDashboardService } from '../../application/services/WorkforceDashboardService'
import { SupabaseCertificationPlatformReviewRepository } from '../../infrastructure/repositories/SupabaseCertificationPlatformReviewRepository'
import { SupabaseContractDisputeRepository } from '../../infrastructure/repositories/SupabaseContractDisputeRepository'
import { SupabaseMarketplaceRepository } from '../../infrastructure/repositories/SupabaseMarketplaceRepository'
import { SupabaseWorkforceDashboardRepository } from '../../infrastructure/repositories/SupabaseWorkforceDashboardRepository'
import { createModerationDependencies, type ModerationDependencies } from './createModerationDependencies'

/** W11 dashboards, WashLink certification reviews and reported contract problems (every role; the database checks it). */
export interface OversightDependencies {
  readonly workforceDashboardService: WorkforceDashboardService
  readonly certificationPlatformReviewService: CertificationPlatformReviewService
  readonly contractDisputeService: ContractDisputeService
  /** W14: posting reports, owner notices, "Your activity" and super_admin oversight (optional so W11 callers can omit it). */
  readonly moderationDependencies?: ModerationDependencies
}

export function createOversightDependencies(): OversightDependencies {
  return {
    workforceDashboardService: new WorkforceDashboardService(new SupabaseWorkforceDashboardRepository(), new SupabaseMarketplaceRepository()),
    certificationPlatformReviewService: new CertificationPlatformReviewService(new SupabaseCertificationPlatformReviewRepository()),
    contractDisputeService: new ContractDisputeService(new SupabaseContractDisputeRepository()),
    moderationDependencies: createModerationDependencies(),
  }
}
