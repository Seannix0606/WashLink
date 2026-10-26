import type {
  ContractAcceptanceRecord,
  ContractClauseComparison,
  ContractFlagNotices,
  ContractProblemTermFlag,
  ContractVersionChange,
  ContractVersionDocument,
  ContractVersionSummary,
} from '../../domain/models/WorkerContract'
import type { WorkerContractRepository } from '../../domain/repositories/WorkerContractRepository'

export class WorkerContractValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'WorkerContractValidationError'
  }
}

/** Everything a contract record view reads (both parties; RLS limits workers to sealed versions). */
export interface WorkerContractRecordReader {
  listVersions(contractId: string): Promise<ContractVersionSummary[]>
  fetchVersionDocument(versionId: string): Promise<ContractVersionDocument | null>
  listVersionClauses(versionId: string): Promise<ContractClauseComparison[]>
  listVersionFlags(versionId: string): Promise<ContractProblemTermFlag[]>
  listVersionChanges(versionId: string): Promise<ContractVersionChange[]>
  listAcceptances(contractId: string): Promise<ContractAcceptanceRecord[]>
  fetchFlagNotices(): Promise<ContractFlagNotices | null>
}

/** Shared record reads of the owner and worker contract services. */
export class WorkerContractRecordReads implements WorkerContractRecordReader {
  public constructor(protected readonly workerContractRepository: WorkerContractRepository) {}

  public async listVersions(contractId: string): Promise<ContractVersionSummary[]> {
    return this.workerContractRepository.listVersions(contractId)
  }

  public async fetchVersionDocument(versionId: string): Promise<ContractVersionDocument | null> {
    return this.workerContractRepository.fetchVersionDocument(versionId)
  }

  public async listVersionClauses(versionId: string): Promise<ContractClauseComparison[]> {
    return this.workerContractRepository.listVersionClauses(versionId)
  }

  public async listVersionFlags(versionId: string): Promise<ContractProblemTermFlag[]> {
    return this.workerContractRepository.listVersionFlags(versionId)
  }

  public async listVersionChanges(versionId: string): Promise<ContractVersionChange[]> {
    return this.workerContractRepository.listVersionChanges(versionId)
  }

  public async listAcceptances(contractId: string): Promise<ContractAcceptanceRecord[]> {
    return this.workerContractRepository.listAcceptances(contractId)
  }

  public async fetchFlagNotices(): Promise<ContractFlagNotices | null> {
    return this.workerContractRepository.fetchFlagNotices()
  }
}

/** Throws the first problem as a validation error (nothing is sent). */
export function assertNoProblem(problem: string | null): void {
  if (problem !== null) {
    throw new WorkerContractValidationError(problem)
  }
}
