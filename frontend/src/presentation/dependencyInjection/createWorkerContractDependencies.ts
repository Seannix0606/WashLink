import { WorkerContractResponseService } from '../../application/services/WorkerContractResponseService'
import { WorkerContractService } from '../../application/services/WorkerContractService'
import { SupabaseContractTemplateRepository } from '../../infrastructure/repositories/SupabaseContractTemplateRepository'
import { SupabaseWorkerContractActionRepository } from '../../infrastructure/repositories/SupabaseWorkerContractActionRepository'
import { SupabaseWorkerContractRepository } from '../../infrastructure/repositories/SupabaseWorkerContractRepository'

export interface WorkerContractDependencies {
  /** Owner side: drafts, send, amendments, start, termination. */
  readonly workerContractService: WorkerContractService
  /** Worker side: accept, decline, terminate, retained application records. */
  readonly workerContractResponseService: WorkerContractResponseService
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
  }
}
