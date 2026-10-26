import { JobApplicationService } from '../../application/services/JobApplicationService'
import { MarketplaceService } from '../../application/services/MarketplaceService'
import { SupabaseJobApplicationRepository } from '../../infrastructure/repositories/SupabaseJobApplicationRepository'
import { SupabaseMarketplaceRepository } from '../../infrastructure/repositories/SupabaseMarketplaceRepository'
import { createCertificationDependencies, type CertificationDependencies } from './createCertificationDependencies'
import { createWorkerContractDependencies, type WorkerContractDependencies } from './createWorkerContractDependencies'

export interface WorkerMarketplaceDependencies {
  readonly marketplaceService: MarketplaceService
  readonly jobApplicationService: JobApplicationService
  /** W7: the worker's own certificates (My certifications, D-20 apply state). */
  readonly certificationDependencies: CertificationDependencies
  /** W9: contract offers, changes and kept application records. */
  readonly workerContractDependencies: WorkerContractDependencies
}

export function createWorkerMarketplaceDependencies(): WorkerMarketplaceDependencies {
  return {
    marketplaceService: new MarketplaceService(new SupabaseMarketplaceRepository()),
    jobApplicationService: new JobApplicationService(new SupabaseJobApplicationRepository()),
    certificationDependencies: createCertificationDependencies(),
    workerContractDependencies: createWorkerContractDependencies(),
  }
}
