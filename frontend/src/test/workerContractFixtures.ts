import { vi, type Mock } from 'vitest'
import { WorkerContractResponseService } from '../application/services/WorkerContractResponseService'
import { WorkerContractService } from '../application/services/WorkerContractService'
import type { ContractTemplateRepository } from '../domain/repositories/ContractTemplateRepository'
import type {
  ContractAcceptanceRecord,
  ContractAcknowledgementText,
  ContractDraftPreview,
  ContractDraftVersion,
  ContractVersionDocument,
  ContractVersionSummary,
  MyWorkerContract,
  OwnerWorkerContract,
  WorkerClassificationOption,
} from '../domain/models/WorkerContract'
import type { WorkerContractActionRepository, WorkerContractRepository } from '../domain/repositories/WorkerContractRepository'
import { buildOwnerTemplate, buildStandard, buildVersionClauses, testStandardVersionIdentifier, testVersionIdentifier } from './contractTemplateFixtures'

// Synthetic W9 test data only: no real person, shop, pay amount or contract.
export const testContractIdentifier = 'c9c9c9c9-c9c9-49c9-89c9-c9c9c9c9c9c9'
export const testDraftVersionIdentifier = 'd9d9d9d9-d9d9-49d9-89d9-d9d9d9d9d9d9'
export const testCurrentVersionIdentifier = 'e9e9e9e9-e9e9-49e9-89e9-e9e9e9e9e9e9'
export const testPendingVersionIdentifier = 'f9f9f9f9-f9f9-49f9-89f9-f9f9f9f9f9f9'
export const testShopIdentifier = 'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9'
export const testWorkerIdentifier = 'b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9'
export const testContentHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
export const acceptanceLabel = 'Acceptance record — not an e-signature'

export const testRenderedText = [
  'WashLink worker agreement - draft',
  `Contract reference: ${testContractIdentifier}`,
  'Version 1 (initial)',
  'Draft — requires review by a qualified Philippine labor-law professional',
  acceptanceLabel,
  '',
  '1. Parties and verified identities',
  '  Parties\n  The parties are named here.   Spacing is kept   exactly.',
].join('\n')

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (...methodArguments: never[]) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export const testClassificationOptions: WorkerClassificationOption[] = [
  { classificationKey: 'employee', label: 'Employee (draft list - confirm with a qualified professional)', sortOrder: 1, needsExtraAcknowledgement: false },
  { classificationKey: 'fixed_term_employee', label: 'Fixed-term employee (draft list - confirm with a qualified professional)', sortOrder: 3, needsExtraAcknowledgement: false },
  { classificationKey: 'independent_contractor', label: 'Independent contractor (draft list - confirm with a qualified professional)', sortOrder: 8, needsExtraAcknowledgement: true },
  { classificationKey: 'probationary_employee', label: 'Probationary employee (draft list - confirm with a qualified professional)', sortOrder: 2, needsExtraAcknowledgement: false },
]

export const testAcknowledgementTexts: ContractAcknowledgementText[] = [
  { ackKey: 'w9_owner_send_v1', statementText: 'I offer these terms to the worker as shown. This is an acceptance record on WashLink, not an electronic signature.' },
  { ackKey: 'w9_worker_accept_v1', statementText: 'I have read this version of the contract and I accept it. This is an acceptance record on WashLink, not an electronic signature. I can still end the contract as the law allows.' },
  { ackKey: 'w9_contractor_owner_v1', statementText: 'The relationship type chosen is independent contractor. This choice has legal consequences and should be confirmed with a qualified professional. WashLink does not decide or check it.' },
  { ackKey: 'w9_contractor_worker_v1', statementText: 'The relationship type chosen is independent contractor. This choice has legal consequences and should be confirmed with a qualified professional. WashLink does not decide or check it.' },
]

export const testFlagNotices = {
  disclaimer: 'Automatic keyword check. It may miss problems or flag acceptable text. It is not legal advice and WashLink does not check whether terms are lawful.',
  noMatchText: 'No keyword matches. This does not mean the terms are lawful.',
}

export function buildOwnerContract(overrides: Partial<OwnerWorkerContract> = {}): OwnerWorkerContract {
  return {
    contractId: testContractIdentifier,
    status: 'draft',
    effectiveStatus: 'draft',
    revision: 1,
    origin: 'accepted_application',
    shopId: testShopIdentifier,
    shopName: 'Test Wash Bay',
    currentVersionId: null,
    currentVersionNumber: null,
    pendingVersionId: null,
    pendingVersionNumber: null,
    pendingVersionKind: null,
    startDate: null,
    endDate: null,
    sentAt: null,
    acceptedAt: null,
    activatedAt: null,
    endedAt: null,
    endedBy: null,
    endReason: null,
    declineNote: null,
    isOwnerRemoved: false,
    isShopRemoved: false,
    createdAt: '2026-10-26T02:00:00Z',
    updatedAt: '2026-10-26T02:00:00Z',
    workerId: testWorkerIdentifier,
    workerName: 'Test Worker',
    draftVersionId: testDraftVersionIdentifier,
    draftVersionNumber: 1,
    draftRevision: 1,
    isWorkerRemoved: false,
    allowedActions: ['save_draft', 'send', 'discard'],
    ...overrides,
  }
}

/** An active contract on version 1 (owner view). */
export function buildActiveOwnerContract(overrides: Partial<OwnerWorkerContract> = {}): OwnerWorkerContract {
  return buildOwnerContract({
    status: 'active',
    effectiveStatus: 'active',
    revision: 4,
    currentVersionId: testCurrentVersionIdentifier,
    currentVersionNumber: 1,
    startDate: '2026-11-02',
    sentAt: '2026-10-26T03:00:00Z',
    acceptedAt: '2026-10-26T04:00:00Z',
    activatedAt: '2026-11-02T01:00:00Z',
    draftVersionId: null,
    draftVersionNumber: null,
    draftRevision: null,
    allowedActions: ['amend', 'terminate'],
    ...overrides,
  })
}

export function buildMyContract(overrides: Partial<MyWorkerContract> = {}): MyWorkerContract {
  const { workerId, workerName, draftVersionId, draftVersionNumber, draftRevision, isWorkerRemoved, allowedActions, ...summary } = buildOwnerContract()
  void [workerId, workerName, draftVersionId, draftVersionNumber, draftRevision, isWorkerRemoved, allowedActions]
  return {
    ...summary,
    status: 'sent_for_review',
    effectiveStatus: 'sent_for_review',
    revision: 2,
    pendingVersionId: testPendingVersionIdentifier,
    pendingVersionNumber: 1,
    pendingVersionKind: 'initial',
    startDate: '2026-11-02',
    sentAt: '2026-10-26T03:00:00Z',
    ownerName: 'Test Owner',
    allowedActions: ['accept', 'decline'],
    ...overrides,
  }
}

/** Accepted / active version 1 with a pending amendment version 2 (worker view). */
export function buildMyContractWithAmendment(overrides: Partial<MyWorkerContract> = {}): MyWorkerContract {
  return buildMyContract({
    status: 'active',
    effectiveStatus: 'active',
    revision: 6,
    currentVersionId: testCurrentVersionIdentifier,
    currentVersionNumber: 1,
    pendingVersionId: testPendingVersionIdentifier,
    pendingVersionNumber: 2,
    pendingVersionKind: 'amendment',
    acceptedAt: '2026-10-26T04:00:00Z',
    activatedAt: '2026-11-02T01:00:00Z',
    allowedActions: ['accept_amendment', 'decline_amendment', 'terminate'],
    ...overrides,
  })
}

export function buildDraftVersion(overrides: Partial<ContractDraftVersion> = {}): ContractDraftVersion {
  return {
    versionId: testDraftVersionIdentifier,
    contractId: testContractIdentifier,
    versionNumber: 1,
    kind: 'initial',
    draftRevision: 1,
    classificationKey: 'employee',
    startDate: '2026-11-02',
    endDate: null,
    ownerValues: { role_title: 'Wash bay crew' },
    editableBodies: {},
    shopTerms: [],
    templateVersionId: testVersionIdentifier,
    basePlatformVersionId: testStandardVersionIdentifier,
    ...overrides,
  }
}

export function buildPreview(overrides: Partial<ContractDraftPreview> = {}): ContractDraftPreview {
  return {
    versionId: testDraftVersionIdentifier,
    versionNumber: 1,
    kind: 'initial',
    draftRevision: 1,
    flagCount: 1,
    unfilled: [],
    clauses: [],
    flags: [
      {
        sectionNumber: 7,
        position: 2,
        valueKey: null,
        ruleKey: 'deposit',
        category: 'deposit',
        label: 'Deposit or bond',
        guidance: 'Deposits taken from workers may need legal review before use.',
        excerpt: 'a deposit is kept by the shop',
      },
    ],
    ...overrides,
  }
}

export function buildDocument(overrides: Partial<ContractVersionDocument> = {}): ContractVersionDocument {
  return {
    contractId: testContractIdentifier,
    versionId: testPendingVersionIdentifier,
    versionNumber: 1,
    kind: 'initial',
    state: 'sent_for_review',
    renderedText: testRenderedText,
    contentHash: testContentHash,
    sealedAt: '2026-10-26T03:00:00Z',
    recordLabel: acceptanceLabel,
    ...overrides,
  }
}

export function buildVersionSummary(overrides: Partial<ContractVersionSummary> = {}): ContractVersionSummary {
  return {
    versionId: testPendingVersionIdentifier,
    versionNumber: 1,
    kind: 'initial',
    state: 'sent_for_review',
    classificationKey: 'employee',
    classificationLabel: 'Employee (draft list - confirm with a qualified professional)',
    startDate: '2026-11-02',
    endDate: null,
    contentHash: testContentHash,
    flagCount: 0,
    sealedAt: '2026-10-26T03:00:00Z',
    sentAt: '2026-10-26T03:00:00Z',
    respondedAt: null,
    declineNote: null,
    templateName: 'Wash bay crew agreement',
    templateVersionNumber: 1,
    basePlatformVersionNumber: 1,
    draftRevision: 2,
    isCurrent: false,
    isPending: true,
    createdAt: '2026-10-26T02:00:00Z',
    ...overrides,
  }
}

export function buildAcceptance(overrides: Partial<ContractAcceptanceRecord> = {}): ContractAcceptanceRecord {
  return {
    versionId: testPendingVersionIdentifier,
    versionNumber: 1,
    versionContentHash: testContentHash,
    partyRole: 'owner',
    partyName: 'Test Owner',
    statementKey: 'w9_owner_send_v1',
    statementText: testAcknowledgementTexts[0]?.statementText ?? '',
    contractorAckKey: null,
    contractorAckText: null,
    acceptedAt: '2026-10-26T03:00:00Z',
    recordLabel: acceptanceLabel,
    ...overrides,
  }
}

export interface WorkerContractTestHarness {
  readonly repository: MockedRepository<WorkerContractRepository>
  readonly actionRepository: MockedRepository<WorkerContractActionRepository>
  readonly templateRepository: MockedRepository<ContractTemplateRepository>
  readonly workerContractService: WorkerContractService
  readonly workerContractResponseService: WorkerContractResponseService
}

/** The real services over mocked repositories (no network). */
export function createWorkerContractTestHarness(
  ownerContracts: OwnerWorkerContract[] = [buildOwnerContract()],
  myContracts: MyWorkerContract[] = [buildMyContract()],
): WorkerContractTestHarness {
  const repository: MockedRepository<WorkerContractRepository> = {
    listOwnerContracts: vi.fn().mockResolvedValue(ownerContracts),
    listMyContracts: vi.fn().mockResolvedValue(myContracts),
    listEligibleWorkers: vi.fn().mockResolvedValue([
      { workerId: testWorkerIdentifier, displayName: 'Test Worker', shopId: testShopIdentifier, shopName: 'Test Wash Bay', origin: 'accepted_application', hasOpenContract: false },
    ]),
    listClassificationOptions: vi.fn().mockResolvedValue(testClassificationOptions),
    listAcknowledgementTexts: vi.fn().mockResolvedValue(testAcknowledgementTexts),
    fetchFlagNotices: vi.fn().mockResolvedValue(testFlagNotices),
    fetchDraftVersion: vi.fn().mockResolvedValue(buildDraftVersion()),
    previewDraft: vi.fn().mockResolvedValue(buildPreview()),
    listVersions: vi.fn().mockResolvedValue([buildVersionSummary()]),
    fetchVersionDocument: vi.fn().mockResolvedValue(buildDocument()),
    listVersionClauses: vi.fn().mockResolvedValue([]),
    listVersionFlags: vi.fn().mockResolvedValue([]),
    listVersionChanges: vi.fn().mockResolvedValue([]),
    listAcceptances: vi.fn().mockResolvedValue([buildAcceptance()]),
    listRetainedApplicationRecords: vi.fn().mockResolvedValue([]),
  }
  const actionRepository: MockedRepository<WorkerContractActionRepository> = {
    createDraft: vi.fn().mockResolvedValue({ contractId: testContractIdentifier, status: 'draft', revision: 1 }),
    saveDraft: vi.fn(),
    sendVersion: vi.fn(),
    withdrawVersion: vi.fn(),
    discardDraft: vi.fn().mockResolvedValue(true),
    createAmendment: vi.fn(),
    activate: vi.fn(),
    acceptVersion: vi.fn(),
    declineVersion: vi.fn().mockResolvedValue({ contractId: testContractIdentifier, status: 'active', revision: 7 }),
    terminate: vi.fn(),
  }
  const templateRepository: MockedRepository<ContractTemplateRepository> = {
    listOwnerTemplates: vi.fn().mockResolvedValue([buildOwnerTemplate()]),
    fetchCurrentStandard: vi.fn().mockResolvedValue(buildStandard()),
    listPlaceholders: vi.fn().mockResolvedValue([]),
    listVersionClauses: vi.fn().mockResolvedValue(buildVersionClauses()),
    listVersionHistory: vi.fn().mockResolvedValue([]),
    previewVersion: vi.fn().mockResolvedValue([]),
    diffVersion: vi.fn().mockResolvedValue([]),
  }
  return {
    repository,
    actionRepository,
    templateRepository,
    workerContractService: new WorkerContractService(repository, actionRepository, templateRepository),
    workerContractResponseService: new WorkerContractResponseService(repository, actionRepository),
  }
}
