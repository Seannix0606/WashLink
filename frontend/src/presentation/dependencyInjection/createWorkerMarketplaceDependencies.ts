import { JobApplicationService } from '../../application/services/JobApplicationService'
import { MarketplaceService } from '../../application/services/MarketplaceService'
import { SupabaseJobApplicationRepository } from '../../infrastructure/repositories/SupabaseJobApplicationRepository'
import { SupabaseMarketplaceRepository } from '../../infrastructure/repositories/SupabaseMarketplaceRepository'

export interface WorkerMarketplaceDependencies {
  readonly marketplaceService: MarketplaceService
  readonly jobApplicationService: JobApplicationService
}

export function createWorkerMarketplaceDependencies(): WorkerMarketplaceDependencies {
  return {
    marketplaceService: new MarketplaceService(new SupabaseMarketplaceRepository()),
    jobApplicationService: new JobApplicationService(new SupabaseJobApplicationRepository()),
  }
}
