import type { ContractTemplateClause } from '../../domain/models/ContractTemplate'
import type { ContractTemplateRepository } from '../../domain/repositories/ContractTemplateRepository'
import {
  contractStatementKeys,
  type ContractAcknowledgementText,
  type ContractDraftPreview,
  type ContractDraftVersion,
  type ContractEligibleWorker,
  type ContractFlagNotices,
  type ContractVersionRecord,
  type OwnerWorkerContract,
  type WorkerClassificationOption,
  type WorkerContractRecord,
} from '../../domain/models/WorkerContract'
import type { WorkerContractActionRepository, WorkerContractRepository } from '../../domain/repositories/WorkerContractRepository'
import { buildSaveParts, type ContractTemplateDraft } from '../../domain/utilities/contractTemplateDraft'
import { normalizeClauseText } from '../../domain/utilities/contractTemplatePlaceholders'
import { firstDraftErrorMessage, validateContractTemplateDraft } from '../validation/contractTemplateDraftValidation'
import { firstIssueMessage } from '../validation/contractTemplateSchemas'
import {
  chooseTemplateMessage,
  chooseWorkerMessage,
  contractorAcknowledgementMessage,
  firstDetailsError,
  flagReviewMessage,
  offerStatementMessage,
  terminationReasonSchema,
  toOwnerValues,
  validateContractDetails,
  type ContractDetailsDraft,
} from '../validation/workerContractSchemas'
import { assertNoProblem, WorkerContractRecordReads, WorkerContractValidationError } from './WorkerContractRecordReads'

/** A template version the owner may start from: an own active template or the current standard. */
export interface ContractTemplateChoice {
  readonly versionId: string
  readonly label: string
  readonly isStandard: boolean
}

export interface NewWorkerContractOptions {
  readonly eligibleWorkers: readonly ContractEligibleWorker[]
  readonly templateChoices: readonly ContractTemplateChoice[]
  readonly classificationOptions: readonly WorkerClassificationOption[]
  readonly acknowledgementTexts: readonly ContractAcknowledgementText[]
}

export interface NewWorkerContractRequest {
  readonly worker: ContractEligibleWorker | null
  readonly templateVersionId: string | null
  readonly details: ContractDetailsDraft
  readonly isContractorAcknowledged: boolean
}

export interface ContractDraftEditorData {
  readonly draftVersion: ContractDraftVersion
  /** The clause list the draft starts from (own template version, or the standard). */
  readonly templateClauses: readonly ContractTemplateClause[]
  readonly preview: ContractDraftPreview | null
  readonly classificationOptions: readonly WorkerClassificationOption[]
  readonly acknowledgementTexts: readonly ContractAcknowledgementText[]
  readonly flagNotices: ContractFlagNotices | null
}

export interface SendConfirmations {
  readonly isOfferStatementConfirmed: boolean
  readonly isContractorAcknowledged: boolean
  readonly isFlagReviewConfirmed: boolean
}

export const draftNotFoundMessage = 'This contract draft is no longer open. Reload the list.'

export function findClassificationOption(
  classificationOptions: readonly WorkerClassificationOption[],
  classificationKey: string | null,
): WorkerClassificationOption | undefined {
  return classificationOptions.find((option) => option.classificationKey === classificationKey)
}

/**
 * The full set of contract-level edits: every editable clause whose text differs from the
 * template text it starts from. Locked safeguards are never included.
 */
export function buildContractEditableBodies(
  templateClauses: readonly ContractTemplateClause[],
  draft: ContractTemplateDraft,
): Record<string, string> {
  const editableBodies: Record<string, string> = {}
  for (const clause of templateClauses) {
    if (clause.kind !== 'editable' || clause.clauseKey === null) {
      continue
    }
    const draftBody = normalizeClauseText(draft.editableBodies[clause.clauseKey] ?? clause.body)
    if (draftBody !== normalizeClauseText(clause.body)) {
      editableBodies[clause.clauseKey] = draftBody
    }
  }
  return editableBodies
}

/**
 * Owner worker contracts (W9): drafts from an own template version or the standard, saves,
 * send (seal + owner acceptance record), withdraw, discard, amendments, start and termination.
 * Client checks mirror the database, which re-checks every rule.
 */
export class WorkerContractService extends WorkerContractRecordReads {
  public constructor(
    workerContractRepository: WorkerContractRepository,
    private readonly workerContractActionRepository: WorkerContractActionRepository,
    private readonly contractTemplateRepository: ContractTemplateRepository,
  ) {
    super(workerContractRepository)
  }

  public async loadOwnerContracts(): Promise<OwnerWorkerContract[]> {
    return this.workerContractRepository.listOwnerContracts()
  }

  public async loadNewContractOptions(): Promise<NewWorkerContractOptions> {
    const [eligibleWorkers, templates, standard, classificationOptions, acknowledgementTexts] = await Promise.all([
      this.workerContractRepository.listEligibleWorkers(),
      this.contractTemplateRepository.listOwnerTemplates(),
      this.contractTemplateRepository.fetchCurrentStandard(),
      this.workerContractRepository.listClassificationOptions(),
      this.workerContractRepository.listAcknowledgementTexts(),
    ])
    const templateChoices: ContractTemplateChoice[] = templates
      .filter((template) => template.status === 'active')
      .map((template) => ({
        versionId: template.currentVersionId,
        label: `${template.name}, version ${String(template.currentVersionNumber)}`,
        isStandard: false,
      }))
    if (standard !== null) {
      templateChoices.push({ versionId: standard.versionId, label: `${standard.name}, version ${String(standard.versionNumber)}`, isStandard: true })
    }
    const sortedOptions = [...classificationOptions].sort((left, right) => left.sortOrder - right.sortOrder)
    return { eligibleWorkers, templateChoices, classificationOptions: sortedOptions, acknowledgementTexts }
  }

  public async createDraft(request: NewWorkerContractRequest, options: NewWorkerContractOptions): Promise<WorkerContractRecord> {
    if (request.worker === null) {
      throw new WorkerContractValidationError(chooseWorkerMessage)
    }
    if (request.templateVersionId === null) {
      throw new WorkerContractValidationError(chooseTemplateMessage)
    }
    assertNoProblem(firstDetailsError(validateContractDetails(request.details)))
    const classification = findClassificationOption(options.classificationOptions, request.details.classificationKey)
    if (classification?.needsExtraAcknowledgement === true && !request.isContractorAcknowledged) {
      throw new WorkerContractValidationError(contractorAcknowledgementMessage)
    }
    return this.workerContractActionRepository.createDraft({
      shopId: request.worker.shopId,
      workerId: request.worker.workerId,
      templateVersionId: request.templateVersionId,
      classificationKey: request.details.classificationKey ?? '',
      startDate: request.details.startDate,
      endDate: request.details.endDate.length > 0 ? request.details.endDate : null,
      ownerValues: toOwnerValues(request.details.ownerValues),
    })
  }

  public async loadDraftEditor(contract: OwnerWorkerContract): Promise<ContractDraftEditorData> {
    if (contract.draftVersionId === null) {
      throw new WorkerContractValidationError(draftNotFoundMessage)
    }
    const [draftVersion, preview, classificationOptions, acknowledgementTexts, flagNotices] = await Promise.all([
      this.workerContractRepository.fetchDraftVersion(contract.draftVersionId),
      this.workerContractRepository.previewDraft(contract.contractId),
      this.workerContractRepository.listClassificationOptions(),
      this.workerContractRepository.listAcknowledgementTexts(),
      this.workerContractRepository.fetchFlagNotices(),
    ])
    if (draftVersion === null) {
      throw new WorkerContractValidationError(draftNotFoundMessage)
    }
    const templateClauses = await this.contractTemplateRepository.listVersionClauses(
      draftVersion.templateVersionId ?? draftVersion.basePlatformVersionId,
    )
    return {
      draftVersion,
      templateClauses,
      preview,
      classificationOptions: [...classificationOptions].sort((left, right) => left.sortOrder - right.sortOrder),
      acknowledgementTexts,
      flagNotices,
    }
  }

  public async previewDraft(contractId: string): Promise<ContractDraftPreview | null> {
    return this.workerContractRepository.previewDraft(contractId)
  }

  public async saveDraft(
    contract: OwnerWorkerContract,
    editorData: ContractDraftEditorData,
    details: ContractDetailsDraft,
    draft: ContractTemplateDraft,
  ): Promise<ContractVersionRecord> {
    assertNoProblem(firstDetailsError(validateContractDetails(details)))
    assertNoProblem(firstDraftErrorMessage(validateContractTemplateDraft(editorData.templateClauses, draft)))
    return this.workerContractActionRepository.saveDraft({
      contractId: contract.contractId,
      expectedDraftRevision: editorData.draftVersion.draftRevision,
      classificationKey: details.classificationKey ?? '',
      startDate: details.startDate,
      endDate: details.endDate.length > 0 ? details.endDate : null,
      ownerValues: toOwnerValues(details.ownerValues),
      editableBodies: buildContractEditableBodies(editorData.templateClauses, draft),
      shopTerms: buildSaveParts(editorData.templateClauses, draft).shopTerms,
    })
  }

  /** Seals the saved draft; the owner confirms the statement, the flag count and (contractor) the extra acknowledgement. */
  public async sendVersion(
    contract: OwnerWorkerContract,
    preview: ContractDraftPreview,
    classification: WorkerClassificationOption | undefined,
    confirmations: SendConfirmations,
  ): Promise<ContractVersionRecord> {
    if (!confirmations.isFlagReviewConfirmed) {
      throw new WorkerContractValidationError(flagReviewMessage)
    }
    if (!confirmations.isOfferStatementConfirmed) {
      throw new WorkerContractValidationError(offerStatementMessage)
    }
    const isContractorAcknowledgementNeeded = classification?.needsExtraAcknowledgement === true
    if (isContractorAcknowledgementNeeded && !confirmations.isContractorAcknowledged) {
      throw new WorkerContractValidationError(contractorAcknowledgementMessage)
    }
    return this.workerContractActionRepository.sendVersion({
      contractId: contract.contractId,
      expectedDraftRevision: preview.draftRevision,
      contractorAcknowledgementKey: isContractorAcknowledgementNeeded ? contractStatementKeys.contractorOwner : null,
      acknowledgedFlagCount: preview.flagCount,
    })
  }

  public async withdrawPending(contract: OwnerWorkerContract): Promise<WorkerContractRecord> {
    if (contract.pendingVersionId === null) {
      throw new WorkerContractValidationError('There is no sent version to withdraw.')
    }
    return this.workerContractActionRepository.withdrawVersion(contract.contractId, contract.pendingVersionId)
  }

  public async discardDraft(contract: OwnerWorkerContract): Promise<boolean> {
    if (contract.draftVersionId === null) {
      throw new WorkerContractValidationError(draftNotFoundMessage)
    }
    return this.workerContractActionRepository.discardDraft(contract.contractId, contract.draftVersionId)
  }

  public async createAmendment(contract: OwnerWorkerContract): Promise<ContractVersionRecord> {
    return this.workerContractActionRepository.createAmendment(contract.contractId, contract.revision)
  }

  public async activate(contract: OwnerWorkerContract): Promise<WorkerContractRecord> {
    return this.workerContractActionRepository.activate(contract.contractId, contract.revision)
  }

  public async terminate(contract: OwnerWorkerContract, reason: string): Promise<WorkerContractRecord> {
    assertNoProblem(firstIssueMessage(terminationReasonSchema, reason))
    return this.workerContractActionRepository.terminate(contract.contractId, contract.revision, reason.trim())
  }
}
