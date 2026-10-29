import type { ContractTemplateVersionSummary, StandardContractTemplate } from '../../domain/models/ContractTemplate'
import type { PublishedStandardVersion, StandardContractDraft } from '../../domain/models/PlatformContractTemplateDraft'
import type { PlatformContractTemplateRepository } from '../../domain/repositories/PlatformContractTemplateRepository'
import {
  buildStandardPublishInput,
  countStandardDraftChanges,
  createStandardDraft,
  findEmptyEditableClauses,
} from '../../domain/utilities/platformContractTemplateDraft'

export const standardNotFoundMessage = 'The standard template could not be found. Try again later.'
export const standardNothingChangedMessage = 'Change at least one editable clause before publishing.'
export const standardEmptyClauseMessage = 'Editable clauses cannot be empty.'

export interface StandardContractEditorData {
  readonly standard: StandardContractTemplate
  readonly draft: StandardContractDraft
}

export class StandardContractValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'StandardContractValidationError'
  }
}

/**
 * W14 super_admin publishing of the standard contract template (W8 RPC). Publishing makes a new
 * standard version; it stays a draft that needs legal review, and owner versions and sent
 * contracts do not change. The database checks the role, the version and every clause.
 */
export class PlatformContractTemplateService {
  public constructor(private readonly platformTemplateRepository: PlatformContractTemplateRepository) {}

  /** Null when no standard is readable. */
  public async loadEditor(): Promise<StandardContractEditorData | null> {
    const standard = await this.platformTemplateRepository.fetchCurrentStandard()
    if (standard === null) {
      return null
    }
    const clauses = await this.platformTemplateRepository.listVersionClauses(standard.versionId)
    return { standard, draft: createStandardDraft(standard.versionNumber, clauses) }
  }

  public async listHistory(templateId: string): Promise<ContractTemplateVersionSummary[]> {
    return this.platformTemplateRepository.listVersionHistory(templateId)
  }

  /** Empty when the draft may be published. */
  public validateDraft(draft: StandardContractDraft): string | null {
    if (findEmptyEditableClauses(draft).length > 0) {
      return standardEmptyClauseMessage
    }
    if (countStandardDraftChanges(draft).changedClauseCount === 0) {
      return standardNothingChangedMessage
    }
    return null
  }

  public async publish(draft: StandardContractDraft): Promise<PublishedStandardVersion> {
    const draftProblem = this.validateDraft(draft)
    if (draftProblem !== null) {
      throw new StandardContractValidationError(draftProblem)
    }
    return this.platformTemplateRepository.publish(buildStandardPublishInput(draft))
  }
}
