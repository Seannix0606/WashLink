import {
  contractDisputeCategoriesFor,
  type AdminContractDisputeCase,
  type AdminContractDisputeQueueItem,
  type AdminContractDisputeVersionDocument,
  type ContractDisputeRecord,
  type ContractDisputeStatus,
  type MyContractDispute,
} from '../../domain/models/ContractDispute'
import type { ContractEndedBy, ContractPartyRole } from '../../domain/models/WorkerContract'
import type { ContractDisputeRepository } from '../../domain/repositories/ContractDisputeRepository'
import {
  disputeCategorySchema,
  disputeResolutionKindSchema,
  disputeResolutionNoteSchema,
  disputeStatementSchema,
  parseOversightInput,
} from '../validation/oversightSchemas'

export const categoryDoesNotMatchMessage = 'This category does not match the contract.'
export const disputeNotOpenMessage = 'This reported problem is no longer open.'

export interface ReportContractProblemRequest {
  readonly contractId: string
  readonly raiserRole: ContractPartyRole
  readonly endedBy: ContractEndedBy | null
  readonly category: string
  readonly statement: string
}

/**
 * W11 reported contract problems (D-47). A report, an answer, a withdrawal or a close never
 * changes the contract: WashLink is not a party and cannot restart, end or change it.
 */
export class ContractDisputeService {
  public constructor(private readonly contractDisputeRepository: ContractDisputeRepository) {}

  public async listMyDisputes(): Promise<MyContractDispute[]> {
    return this.contractDisputeRepository.listMyDisputes()
  }

  public async reportProblem(request: ReportContractProblemRequest): Promise<ContractDisputeRecord> {
    const category = parseOversightInput(disputeCategorySchema, request.category)
    if (!contractDisputeCategoriesFor(request.raiserRole, request.endedBy).includes(category)) {
      throw new Error(categoryDoesNotMatchMessage)
    }
    const statement = parseOversightInput(disputeStatementSchema, request.statement)
    return this.contractDisputeRepository.raise({ contractId: request.contractId, category, statement })
  }

  public async respond(dispute: MyContractDispute, statement: string): Promise<ContractDisputeRecord> {
    if (!dispute.canRespond) {
      throw new Error(disputeNotOpenMessage)
    }
    const validStatement = parseOversightInput(disputeStatementSchema, statement)
    return this.contractDisputeRepository.respond(dispute.disputeId, validStatement)
  }

  public async withdraw(dispute: MyContractDispute): Promise<ContractDisputeRecord> {
    if (!dispute.canWithdraw) {
      throw new Error(disputeNotOpenMessage)
    }
    return this.contractDisputeRepository.withdraw(dispute.disputeId)
  }

  public async listAdminQueue(status: ContractDisputeStatus): Promise<AdminContractDisputeQueueItem[]> {
    return this.contractDisputeRepository.listAdminQueue(status)
  }

  /** Each call is a new audited read in the database; callers load it once per opening. */
  public async loadAdminCase(disputeId: string): Promise<AdminContractDisputeCase> {
    return this.contractDisputeRepository.fetchAdminCase(disputeId)
  }

  public async loadAdminVersionDocument(disputeId: string, versionId: string): Promise<AdminContractDisputeVersionDocument | null> {
    return this.contractDisputeRepository.fetchAdminVersionDocument(disputeId, versionId)
  }

  /** Sends the revision the administrator read; a newer server revision fails with 55000. */
  public async close(disputeCase: AdminContractDisputeCase, resolutionKind: string, resolutionNote: string): Promise<ContractDisputeRecord> {
    if (disputeCase.dispute.status !== 'open') {
      throw new Error(disputeNotOpenMessage)
    }
    return this.contractDisputeRepository.close({
      disputeId: disputeCase.dispute.disputeId,
      expectedRevision: disputeCase.dispute.revision,
      resolutionKind: parseOversightInput(disputeResolutionKindSchema, resolutionKind),
      resolutionNote: parseOversightInput(disputeResolutionNoteSchema, resolutionNote),
    })
  }
}
