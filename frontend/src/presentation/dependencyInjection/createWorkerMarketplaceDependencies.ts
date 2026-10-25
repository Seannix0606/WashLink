import { JobApplicationService } from '../../application/services/JobApplicationService'
import { MarketplaceService } from '../../application/services/MarketplaceService'
import { SupabaseJobApplicationRepository } from '../../infrastructure/repositories/SupabaseJobApplicationRepository'
import { SupabaseMarketplaceRepository } from '../../infrastructure/repositories/SupabaseMarketplaceRepository'
import { createCertificationDependencies, type CertificationDependencies } from './createCertificationDependencies'

export interface WorkerMarketplaceDependencies {
  readonly marketplaceService: MarketplaceService
  readonly jobApplicationService: JobApplicationService
  /** W7: the worker's own certificates (My certifications, D-20 apply state). */
  readonly certificationDependencies: CertificationDependencies
}

export function createWorkerMarketplaceDependencies(): WorkerMarketplaceDependencies {
  return {
    marketplaceService: new MarketplaceService(new SupabaseMarketplaceRepository()),
    jobApplicationService: new JobApplicationService(new SupabaseJobApplicationRepository()),
    certificationDependencies: createCertificationDependencies(),
  }
}
