import type {
  ContractTemplateClause,
  ContractTemplateDiffRow,
  ContractTemplatePlaceholder,
  ContractTemplatePreviewClause,
  ContractTemplateRecord,
  ContractTemplateVersionRecord,
  ContractTemplateVersionSummary,
  OwnerContractTemplate,
  StandardContractTemplate,
} from '../../domain/models/ContractTemplate'
import type {
  ContractTemplateActionRepository,
  ContractTemplateRepository,
} from '../../domain/repositories/ContractTemplateRepository'
import {
  buildSaveParts,
  createDraftFromClauses,
  isDraftChanged,
  type ContractTemplateDraft,
} from '../../domain/utilities/contractTemplateDraft'
import { firstDraftErrorMessage, validateContractTemplateDraft } from '../validation/contractTemplateDraftValidation'
import { firstIssueMessage, templateNameSchema } from '../validation/contractTemplateSchemas'

export const archivedTemplateMessage = 'Archived templates cannot be changed. Restore it first.'
export const nothingChangedMessage = 'Nothing changed since the last version.'
export const useCurrentStandardMessage = 'Use the current standard template version.'
export const templateAlreadyHasStatusMessage = 'The template already has this status.'

export class ContractTemplateValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ContractTemplateValidationError'
  }
}

export interface OwnerContractTemplateOverview {
  readonly templates: readonly OwnerContractTemplate[]
  readonly standard: StandardContractTemplate | null
}

function parseTemplateName(name: string): string {
  const nameProblem = firstIssueMessage(templateNameSchema, name)
  if (nameProblem !== null) {
    throw new ContractTemplateValidationError(nameProblem)
  }
  return templateNameSchema.parse(name)
}

function assertActive(template: OwnerContractTemplate): void {
  if (template.status !== 'active') {
    throw new ContractTemplateValidationError(archivedTemplateMessage)
  }
}

/**
 * Owner contract templates (W8): reads, create from the standard or from an own version,
 * save a new sealed version, rename, archive and restore. Client checks only mirror the
 * database, which re-validates every version at commit.
 */
export class ContractTemplateService {
  public constructor(
    private readonly contractTemplateRepository: ContractTemplateRepository,
    private readonly contractTemplateActionRepository: ContractTemplateActionRepository,
  ) {}

  public async loadOwnerOverview(): Promise<OwnerContractTemplateOverview> {
    const [templates, standard] = await Promise.all([
      this.contractTemplateRepository.listOwnerTemplates(),
      this.contractTemplateRepository.fetchCurrentStandard(),
    ])
    return { templates, standard }
  }

  public async listPlaceholders(): Promise<ContractTemplatePlaceholder[]> {
    return this.contractTemplateRepository.listPlaceholders()
  }

  public async listVersionClauses(versionId: string): Promise<ContractTemplateClause[]> {
    return this.contractTemplateRepository.listVersionClauses(versionId)
  }

  public async listVersionHistory(templateId: string): Promise<ContractTemplateVersionSummary[]> {
    return this.contractTemplateRepository.listVersionHistory(templateId)
  }

  public async previewVersion(versionId: string): Promise<ContractTemplatePreviewClause[]> {
    return this.contractTemplateRepository.previewVersion(versionId)
  }

  public async diffVersion(versionId: string): Promise<ContractTemplateDiffRow[]> {
    return this.contractTemplateRepository.diffVersion(versionId)
  }

  /** Version 1 is a verbatim copy of the latest standard (no shop verification needed, D-29). */
  public async createFromStandard(name: string): Promise<ContractTemplateRecord> {
    return this.contractTemplateActionRepository.create(parseTemplateName(name), null)
  }

  /** Copies an own version's edits and shop terms; locked clauses are re-copied by the server. */
  public async createFromVersion(name: string, versionId: string): Promise<ContractTemplateRecord> {
    return this.contractTemplateActionRepository.create(parseTemplateName(name), versionId)
  }

  public async rename(template: OwnerContractTemplate, name: string): Promise<ContractTemplateRecord> {
    assertActive(template)
    return this.contractTemplateActionRepository.rename(template.templateId, parseTemplateName(name))
  }

  public async archive(template: OwnerContractTemplate): Promise<ContractTemplateRecord> {
    if (template.status === 'archived') {
      throw new ContractTemplateValidationError(templateAlreadyHasStatusMessage)
    }
    return this.contractTemplateActionRepository.setStatus(template.templateId, 'active', 'archived')
  }

  public async restore(template: OwnerContractTemplate): Promise<ContractTemplateRecord> {
    if (template.status === 'active') {
      throw new ContractTemplateValidationError(templateAlreadyHasStatusMessage)
    }
    return this.contractTemplateActionRepository.setStatus(template.templateId, 'archived', 'active')
  }

  /** Saves the editor draft as version n + 1 on the current standard base. */
  public async saveVersion(
    template: OwnerContractTemplate,
    currentClauses: readonly ContractTemplateClause[],
    draft: ContractTemplateDraft,
  ): Promise<ContractTemplateVersionRecord> {
    assertActive(template)
    const draftProblem = firstDraftErrorMessage(validateContractTemplateDraft(currentClauses, draft))
    if (draftProblem !== null) {
      throw new ContractTemplateValidationError(draftProblem)
    }
    if (!isDraftChanged(currentClauses, draft)) {
      throw new ContractTemplateValidationError(nothingChangedMessage)
    }
    const saveParts = buildSaveParts(currentClauses, draft)
    return this.contractTemplateActionRepository.saveVersion({
      templateId: template.templateId,
      expectedVersionNumber: template.currentVersionNumber,
      basePlatformVersionId: template.basePlatformVersionId,
      editableBodies: saveParts.editableBodies,
      shopTerms: saveParts.shopTerms,
    })
  }

  /**
   * Rebase on the newer standard: no editable body is sent, so the server keeps every
   * clause the owner edited and takes the new standard text for the rest; shop terms stay.
   */
  public async updateToNewerStandard(
    template: OwnerContractTemplate,
    currentClauses: readonly ContractTemplateClause[],
  ): Promise<ContractTemplateVersionRecord> {
    assertActive(template)
    if (!template.newerStandardAvailable || template.latestPlatformVersionId === null) {
      throw new ContractTemplateValidationError(useCurrentStandardMessage)
    }
    const saveParts = buildSaveParts(currentClauses, createDraftFromClauses(currentClauses))
    return this.contractTemplateActionRepository.saveVersion({
      templateId: template.templateId,
      expectedVersionNumber: template.currentVersionNumber,
      basePlatformVersionId: template.latestPlatformVersionId,
      editableBodies: {},
      shopTerms: saveParts.shopTerms,
    })
  }
}
