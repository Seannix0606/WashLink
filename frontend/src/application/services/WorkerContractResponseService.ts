import {
  contractStatementKeys,
  type ContractAcknowledgementText,
  type ContractVersionDocument,
  type MyWorkerContract,
  type RetainedApplicationRecord,
  type WorkerClassificationOption,
  type WorkerContractRecord,
} from '../../domain/models/WorkerContract'
import type { WorkerContractActionRepository, WorkerContractRepository } from '../../domain/repositories/WorkerContractRepository'
import { firstIssueMessage } from '../validation/contractTemplateSchemas'
import {
  acceptanceStatementMessage,
  contractorAcknowledgementMessage,
  declineNoteSchema,
  terminationReasonSchema,
} from '../validation/workerContractSchemas'
import { assertNoProblem, WorkerContractRecordReads, WorkerContractValidationError } from './WorkerContractRecordReads'

export interface ContractReviewSupport {
  readonly classificationOptions: readonly WorkerClassificationOption[]
  readonly acknowledgementTexts: readonly ContractAcknowledgementText[]
}

export interface AcceptConfirmations {
  readonly isAcceptanceStatementConfirmed: boolean
  readonly isContractorAcknowledged: boolean
}

export const noPendingVersionMessage = 'There is no offer or change waiting for your answer.'

/**
 * The worker's side of W9: read offers and changes, accept (with the hash of the text read),
 * decline (always while sent), terminate (always while accepted or active, with a reason).
 */
export class WorkerContractResponseService extends WorkerContractRecordReads {
  public constructor(
    workerContractRepository: WorkerContractRepository,
    private readonly workerContractActionRepository: WorkerContractActionRepository,
  ) {
    super(workerContractRepository)
  }

  public async loadMyContracts(): Promise<MyWorkerContract[]> {
    return this.workerContractRepository.listMyContracts()
  }

  public async loadReviewSupport(): Promise<ContractReviewSupport> {
    const [classificationOptions, acknowledgementTexts] = await Promise.all([
      this.workerContractRepository.listClassificationOptions(),
      this.workerContractRepository.listAcknowledgementTexts(),
    ])
    return { classificationOptions, acknowledgementTexts }
  }

  public async listRetainedApplicationRecords(): Promise<RetainedApplicationRecord[]> {
    return this.workerContractRepository.listRetainedApplicationRecords()
  }

  /** Accepts exactly the document shown: its version id and stored hash go to the server. */
  public async accept(
    contract: MyWorkerContract,
    pendingDocument: ContractVersionDocument,
    classification: WorkerClassificationOption | undefined,
    confirmations: AcceptConfirmations,
  ): Promise<WorkerContractRecord> {
    if (contract.pendingVersionId === null || pendingDocument.versionId !== contract.pendingVersionId) {
      throw new WorkerContractValidationError(noPendingVersionMessage)
    }
    if (!confirmations.isAcceptanceStatementConfirmed) {
      throw new WorkerContractValidationError(acceptanceStatementMessage)
    }
    const isContractorAcknowledgementNeeded = classification?.needsExtraAcknowledgement === true
    if (isContractorAcknowledgementNeeded && !confirmations.isContractorAcknowledged) {
      throw new WorkerContractValidationError(contractorAcknowledgementMessage)
    }
    return this.workerContractActionRepository.acceptVersion({
      contractId: contract.contractId,
      versionId: pendingDocument.versionId,
      contentHash: pendingDocument.contentHash,
      contractorAcknowledgementKey: isContractorAcknowledgementNeeded ? contractStatementKeys.contractorWorker : null,
    })
  }

  /** Always allowed while an offer or change is sent; the note is optional. */
  public async decline(contract: MyWorkerContract, note: string): Promise<WorkerContractRecord> {
    if (contract.pendingVersionId === null) {
      throw new WorkerContractValidationError(noPendingVersionMessage)
    }
    assertNoProblem(firstIssueMessage(declineNoteSchema, note))
    const trimmedNote = note.trim()
    return this.workerContractActionRepository.declineVersion(contract.contractId, contract.pendingVersionId, trimmedNote.length > 0 ? trimmedNote : null)
  }

  /** Always allowed while accepted or active; no verification, notice or other gate. */
  public async terminate(contract: MyWorkerContract, reason: string): Promise<WorkerContractRecord> {
    assertNoProblem(firstIssueMessage(terminationReasonSchema, reason))
    return this.workerContractActionRepository.terminate(contract.contractId, contract.revision, reason.trim())
  }
}
