import { OwnerRelationshipService } from '../../application/services/OwnerRelationshipService'
import { WorkerContractResponseService } from '../../application/services/WorkerContractResponseService'
import { WorkerContractService } from '../../application/services/WorkerContractService'
import { SupabaseContractTemplateRepository } from '../../infrastructure/repositories/SupabaseContractTemplateRepository'
import { SupabaseOwnerRelationshipRepository } from '../../infrastructure/repositories/SupabaseOwnerRelationshipRepository'
import { SupabaseWorkerContractActionRepository } from '../../infrastructure/repositories/SupabaseWorkerContractActionRepository'
import { SupabaseWorkerContractRepository } from '../../infrastructure/repositories/SupabaseWorkerContractRepository'

export interface WorkerContractDependencies {
  /** Owner side: drafts, send, amendments, start, termination. */
  readonly workerContractService: WorkerContractService
  /** Worker side: accept, decline, terminate, retained application records. */
  readonly workerContractResponseService: WorkerContractResponseService
  /**
   * W10 relationship reads (worker progress and list, owner list). Optional so a caller that only
   * needs the W9 contract services can omit it; the factory below always provides it.
   */
  readonly ownerRelationshipService?: OwnerRelationshipService
}

export function createWorkerContractDependencies(): WorkerContractDependencies {
  const workerContractRepository = new SupabaseWorkerContractRepository()
  const workerContractActionRepository = new SupabaseWorkerContractActionRepository()
  return {
    workerContractService: new WorkerContractService(
      workerContractRepository,
      workerContractActionRepository,
      new SupabaseContractTemplateRepository(),
    ),
    workerContractResponseService: new WorkerContractResponseService(workerContractRepository, workerContractActionRepository),
    ownerRelationshipService: new OwnerRelationshipService(new SupabaseOwnerRelationshipRepository()),
  }
}
