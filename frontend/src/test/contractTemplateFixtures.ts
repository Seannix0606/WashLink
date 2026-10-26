import { vi, type Mock } from 'vitest'
import { ContractTemplateService } from '../application/services/ContractTemplateService'
import type {
  ContractTemplateClause,
  ContractTemplateDiffRow,
  ContractTemplatePreviewClause,
  ContractTemplateVersionSummary,
  OwnerContractTemplate,
  StandardContractTemplate,
} from '../domain/models/ContractTemplate'
import type {
  ContractTemplateActionRepository,
  ContractTemplateRepository,
} from '../domain/repositories/ContractTemplateRepository'

// Synthetic W8 test data only: structural clause text, no real person, shop, pay or date.
export const testTemplateIdentifier = 'c8c8c8c8-c8c8-48c8-88c8-c8c8c8c8c8c8'
export const testVersionIdentifier = 'd8d8d8d8-d8d8-48d8-88d8-d8d8d8d8d8d8'
export const testNextVersionIdentifier = 'e8e8e8e8-e8e8-48e8-88e8-e8e8e8e8e8e8'
export const testStandardVersionIdentifier = 'a8a8a8a8-a8a8-48a8-88a8-a8a8a8a8a8a8'
export const testNewerStandardVersionIdentifier = 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8'
export const testReviewNotice = 'Draft — requires review by a qualified Philippine labor-law professional'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (...methodArguments: never[]) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

const sectionTitles: Readonly<Record<number, string>> = {
  1: 'Parties and verified identities',
  2: 'Car wash business and work location',
  4: 'Contract type and legal classification',
  7: 'Compensation, payment frequency, and lawful deductions, if any',
  8: 'Training requirements, the minimum three-day training process, and certification conditions',
  14: 'Acknowledgment, acceptance, signatures, and dated copies',
  15: 'Attachments or shop-specific terms',
}

export function buildClause(overrides: Partial<ContractTemplateClause> & Pick<ContractTemplateClause, 'sectionNumber'>): ContractTemplateClause {
  const sectionNumber = overrides.sectionNumber
  return {
    clauseId: `clause-${String(sectionNumber)}-${String(overrides.position ?? 1)}`,
    sectionTitle: sectionTitles[sectionNumber] ?? `Section ${String(sectionNumber)}`,
    reviewNotice: testReviewNotice,
    ownerTermsAllowed: ![1, 4, 14].includes(sectionNumber),
    position: 1,
    clauseKey: `clause_${String(sectionNumber)}`,
    kind: 'editable',
    heading: `Heading ${String(sectionNumber)}`,
    body: `[Shop: describe section ${String(sectionNumber)}.]`,
    requiresOwnerInput: true,
    sourceClauseId: `standard-${String(sectionNumber)}`,
    ...overrides,
  }
}

/** A reduced version: locked safeguards in 1, 4 (locked only), 7, 8, 14, 15; editable clauses in 1, 2, 7, 8, 15. */
export function buildVersionClauses(): ContractTemplateClause[] {
  return [
    buildClause({ sectionNumber: 1, clauseKey: 'parties_named', kind: 'locked_safeguard', heading: 'Parties', body: 'The parties are {{owner_full_name}} for {{shop_name}} and {{worker_full_name}}.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 1, position: 2, clauseKey: 'parties_additional_details', heading: 'Other party details' }),
    buildClause({ sectionNumber: 2, clauseKey: 'business_and_location', heading: 'Business and location', body: '[Shop: the business {{shop_name}} at {{shop_address}}.]' }),
    buildClause({ sectionNumber: 4, clauseKey: 'classification_not_preselected', kind: 'locked_safeguard', heading: 'Relationship type', body: 'The relationship type is {{worker_classification}}; it is chosen for each contract, not preselected.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 4, position: 2, clauseKey: 'classification_reasons', kind: 'locked_safeguard', heading: 'Reasons for the type', body: 'The relationship type is set only by the choice made for each contract.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 7, clauseKey: 'no_training_fee_or_deduction', kind: 'locked_safeguard', heading: 'No training fee', body: 'The worker is not charged for the required initial training.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 7, position: 2, clauseKey: 'pay_terms', heading: 'Pay terms', body: '[Shop: pay as agreed {{pay_details}}.]' }),
    buildClause({ sectionNumber: 8, clauseKey: 'required_training_free_and_supervised', kind: 'locked_safeguard', heading: 'Free supervised training', body: 'Required initial training is supervised learning and free to the worker.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 8, position: 2, clauseKey: 'training_pay_or_reimbursement', kind: 'locked_safeguard', heading: 'Training pay or reimbursement', body: 'The shop may offer pay for training time or reimbursement of training costs, as written in this contract.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 8, position: 3, clauseKey: 'certification_shop_issued', kind: 'locked_safeguard', heading: 'Shop-issued certification', body: 'A certification is shop-issued.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 8, position: 4, clauseKey: 'training_details', heading: 'Training details' }),
    buildClause({ sectionNumber: 14, clauseKey: 'template_is_draft', kind: 'locked_safeguard', heading: 'Draft status', body: 'This template is a draft and has not been reviewed by a qualified professional.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 15, clauseKey: 'safeguards_prevail', kind: 'locked_safeguard', heading: 'Safeguards prevail', body: 'Shop-specific terms cannot override safeguard clauses.', requiresOwnerInput: false }),
    buildClause({ sectionNumber: 15, position: 2, clauseKey: 'attachments_list', heading: 'Attachments' }),
  ]
}

export function buildOwnerTemplate(overrides: Partial<OwnerContractTemplate> = {}): OwnerContractTemplate {
  return {
    templateId: testTemplateIdentifier,
    name: 'Wash bay crew agreement',
    status: 'active',
    currentVersionNumber: 1,
    currentVersionId: testVersionIdentifier,
    lastSavedAt: '2026-10-26T02:00:00Z',
    basePlatformVersionId: testStandardVersionIdentifier,
    basePlatformVersionNumber: 1,
    latestPlatformVersionId: testStandardVersionIdentifier,
    latestPlatformVersionNumber: 1,
    newerStandardAvailable: false,
    derivedFromVersionId: null,
    createdAt: '2026-10-26T02:00:00Z',
    ...overrides,
  }
}

export function buildStandard(overrides: Partial<StandardContractTemplate> = {}): StandardContractTemplate {
  return {
    templateId: 'f8f8f8f8-f8f8-48f8-88f8-f8f8f8f8f8f8',
    name: 'WashLink standard worker agreement - draft',
    versionId: testStandardVersionIdentifier,
    versionNumber: 1,
    contentHash: 'ab'.repeat(32),
    createdAt: '2026-10-26T00:00:00Z',
    ...overrides,
  }
}

export function buildVersionSummary(overrides: Partial<ContractTemplateVersionSummary> = {}): ContractTemplateVersionSummary {
  return {
    versionId: testVersionIdentifier,
    versionNumber: 1,
    createdAt: '2026-10-26T02:00:00Z',
    contentHash: '0123456789abcdef'.repeat(4),
    basePlatformVersionId: testStandardVersionIdentifier,
    basePlatformVersionNumber: 1,
    editedCount: 0,
    addedCount: 0,
    savedByRole: 'owner',
    isCurrent: true,
    ...overrides,
  }
}

export function buildPreviewClause(clause: ContractTemplateClause, renderedBody: string): ContractTemplatePreviewClause {
  return {
    clauseId: clause.clauseId,
    sectionNumber: clause.sectionNumber,
    sectionTitle: clause.sectionTitle,
    reviewNotice: clause.reviewNotice,
    position: clause.position,
    clauseKey: clause.clauseKey,
    kind: clause.kind,
    renderedHeading: clause.heading,
    renderedBody,
    requiresOwnerInput: clause.requiresOwnerInput,
  }
}

export function buildDiffRow(overrides: Partial<ContractTemplateDiffRow> & Pick<ContractTemplateDiffRow, 'change'>): ContractTemplateDiffRow {
  return {
    sectionNumber: 2,
    sectionTitle: 'Car wash business and work location',
    position: 1,
    clauseKey: 'business_and_location',
    kind: 'editable',
    standardHeading: 'Business and location',
    standardBody: '[Shop: the business and where the work happens.]',
    versionHeading: 'Business and location',
    versionBody: '[Shop: the business and where the work happens.]',
    ...overrides,
  }
}

export interface ContractTemplateTestHarness {
  readonly repository: MockedRepository<ContractTemplateRepository>
  readonly actionRepository: MockedRepository<ContractTemplateActionRepository>
  readonly contractTemplateService: ContractTemplateService
}

/** The real service over mocked repositories (no network); one active v1 template by default. */
export function createContractTemplateTestHarness(templates: OwnerContractTemplate[] = [buildOwnerTemplate()]): ContractTemplateTestHarness {
  const repository: MockedRepository<ContractTemplateRepository> = {
    listOwnerTemplates: vi.fn().mockResolvedValue(templates),
    fetchCurrentStandard: vi.fn().mockResolvedValue(buildStandard()),
    listPlaceholders: vi.fn().mockResolvedValue([{ placeholderKey: 'shop_name', previewLabel: '[Shop name - filled in on the contract]' }]),
    listVersionClauses: vi.fn().mockResolvedValue(buildVersionClauses()),
    listVersionHistory: vi.fn().mockResolvedValue([buildVersionSummary()]),
    previewVersion: vi.fn().mockResolvedValue([]),
    diffVersion: vi.fn().mockResolvedValue([]),
  }
  const actionRepository: MockedRepository<ContractTemplateActionRepository> = {
    create: vi.fn(),
    saveVersion: vi.fn().mockResolvedValue({ versionId: testNextVersionIdentifier, versionNumber: 2, editedCount: 1, addedCount: 0 }),
    rename: vi.fn(),
    setStatus: vi.fn(),
  }
  return { repository, actionRepository, contractTemplateService: new ContractTemplateService(repository, actionRepository) }
}
