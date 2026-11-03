import { vi, type Mock } from 'vitest'
import { AdminOversightService } from '../application/services/AdminOversightService'
import { JobOpeningModerationService } from '../application/services/JobOpeningModerationService'
import { PlatformContractTemplateService } from '../application/services/PlatformContractTemplateService'
import { WorkforceActivityService } from '../application/services/WorkforceActivityService'
import type { AdminModerationSummary, UnreviewedApprovedShop } from '../domain/models/AdminOversight'
import type { ContractTemplateClause, StandardContractTemplate } from '../domain/models/ContractTemplate'
import type {
  AdminModerationCase,
  AdminModerationQueueCursor,
  AdminModerationQueueItem,
  AdminModerationQueuePage,
  ModerationCaseStatus,
  ModerationQueueFilter,
  MyJobOpeningReport,
  OwnerJobOpeningModeration,
} from '../domain/models/JobOpeningModeration'
import type { AdminOversightRepository } from '../domain/repositories/AdminOversightRepository'
import type { JobOpeningModerationRepository } from '../domain/repositories/JobOpeningModerationRepository'
import type { PlatformContractTemplateRepository } from '../domain/repositories/PlatformContractTemplateRepository'
import type { WorkforceActivityRepository } from '../domain/repositories/WorkforceActivityRepository'
import { testJobOpeningIdentifier, testShopIdentifier } from './fixtures'
import { buildOpeningSnapshot } from './jobApplicationFixtures'

// Synthetic W14 test data only; no real person, shop or contact detail.
export const testModerationCaseIdentifier = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
export const testReportIdentifier = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
export const testLookupProfileIdentifier = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
export const testStandardVersionIdentifier = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2'
export const testStandardTemplateIdentifier = 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3'
export const validStatement = 'The opening asks applicants to pay a uniform deposit first.'
export const validOwnerMessage = 'Remove the deposit requirement from the opening, then ask us to check.'
export const validAdminNote = 'Checked the opening text; the report does not match the content.'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (...methodArguments: never[]) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export function buildMyReport(overrides: Partial<MyJobOpeningReport> = {}): MyJobOpeningReport {
  return {
    reportId: testReportIdentifier,
    jobOpeningId: testJobOpeningIdentifier,
    openingTitleSnapshot: 'Car wash attendant',
    shopNameSnapshot: 'Test Wash Bay',
    category: 'worker_fee_or_deposit',
    statement: validStatement,
    status: 'open',
    outcome: null,
    createdAt: '2026-10-27T02:00:00Z',
    closedAt: null,
    canWithdraw: true,
    ...overrides,
  }
}

export function buildOwnerModeration(overrides: Partial<OwnerJobOpeningModeration> = {}): OwnerJobOpeningModeration {
  return {
    caseId: testModerationCaseIdentifier,
    jobOpeningId: testJobOpeningIdentifier,
    status: 'paused_by_washlink',
    reasonKind: 'worker_fee_or_deposit',
    ownerMessage: validOwnerMessage,
    ownerChangeNote: null,
    statusChangedAt: '2026-10-28T02:00:00Z',
    canSubmitChanges: true,
    history: [{ action: 'paused', reasonKind: 'worker_fee_or_deposit', ownerMessage: validOwnerMessage, createdAt: '2026-10-28T02:00:00Z' }],
    ...overrides,
  }
}

export function buildQueueItem(overrides: Partial<AdminModerationQueueItem> = {}): AdminModerationQueueItem {
  return {
    caseId: testModerationCaseIdentifier,
    status: 'open',
    revision: 1,
    reportCount: 2,
    openReportCount: 2,
    categories: ['age_requirement', 'worker_fee_or_deposit'],
    openingStatus: 'published',
    isOpeningPresent: true,
    openingTitleSnapshot: 'Car wash attendant',
    shopNameSnapshot: 'Test Wash Bay',
    openedAt: '2026-10-27T02:00:00Z',
    statusChangedAt: '2026-10-27T02:00:00Z',
    ...overrides,
  }
}

export function buildAdminCase(status: ModerationCaseStatus = 'open', overrides: Partial<AdminModerationCase> = {}): AdminModerationCase {
  return {
    moderationCase: {
      caseId: testModerationCaseIdentifier,
      jobOpeningId: testJobOpeningIdentifier,
      status,
      revision: 4,
      reasonKind: status === 'open' ? null : 'worker_fee_or_deposit',
      ownerMessage: status === 'open' ? null : validOwnerMessage,
      adminNote: null,
      ownerChangeNote: status === 'changes_submitted' ? 'Removed the deposit line.' : null,
      openingTitleSnapshot: 'Car wash attendant',
      shopNameSnapshot: 'Test Wash Bay',
      openedAt: '2026-10-27T02:00:00Z',
      statusChangedAt: '2026-10-28T02:00:00Z',
    },
    opening: { content: buildOpeningSnapshot(), status: status === 'open' ? 'published' : 'paused', firstPublishedAt: null, statusChangedAt: null, updatedAt: null },
    shop: { name: 'Test Wash Bay', verificationStatus: 'approved', isActive: true, hasRecordedVerification: true },
    reports: [
      { reporterLabel: 'Reporter 1', category: 'worker_fee_or_deposit', statement: validStatement, status: 'open', outcome: null, createdAt: '2026-10-27T02:00:00Z', reportedSnapshot: null },
      { reporterLabel: 'Reporter 2', category: 'age_requirement', statement: 'Only applicants aged 18 to 25 are accepted here.', status: 'open', outcome: null, createdAt: '2026-10-27T03:00:00Z', reportedSnapshot: null },
    ],
    actions: [],
    applicationCounts: { submitted: 2 },
    ...overrides,
  }
}

export function buildUnreviewedShop(overrides: Partial<UnreviewedApprovedShop> = {}): UnreviewedApprovedShop {
  return {
    shopId: testShopIdentifier,
    shopName: 'Legacy Wash Bay',
    ownerDisplayName: 'Test Owner',
    isActive: true,
    reviewerState: 'reviewer_missing',
    verificationReviewedAt: null,
    lastDecisionAt: null,
    publishedOpeningCount: 1,
    currentCertificationCount: 0,
    activeContractCount: 2,
    suspendedRelationshipCount: 0,
    ...overrides,
  }
}

export function buildModerationSummary(overrides: Partial<AdminModerationSummary> = {}): AdminModerationSummary {
  return {
    openReportCaseCount: 0,
    changesSubmittedCount: 0,
    pausedByWashLinkCount: 0,
    oldestOpenCaseAt: null,
    unreviewedApprovedShopCount: 0,
    oversightFlagCount: 0,
    relationshipLookupsLast30Days: 0,
    ...overrides,
  }
}

export const testStandardTemplate: StandardContractTemplate = {
  templateId: testStandardTemplateIdentifier,
  name: 'WashLink standard',
  versionId: testStandardVersionIdentifier,
  versionNumber: 3,
  contentHash: 'cd'.repeat(32),
  createdAt: '2026-10-26T02:00:00Z',
}

export function buildStandardClauses(): ContractTemplateClause[] {
  const base = { sectionTitle: 'Parties', reviewNotice: 'Draft — requires legal review', ownerTermsAllowed: false, sourceClauseId: null, requiresOwnerInput: false }
  return [
    { ...base, clauseId: 'c1', sectionNumber: 1, position: 1, clauseKey: 'parties_safeguard', kind: 'locked_safeguard', heading: 'Who the parties are', body: 'WashLink is not a party to this contract.' },
    { ...base, clauseId: 'c2', sectionNumber: 1, position: 2, clauseKey: 'parties_intro', kind: 'editable', heading: 'Introduction', body: 'This template describes the work.' },
  ]
}

export interface ModerationTestHarness {
  readonly moderationRepository: MockedRepository<JobOpeningModerationRepository>
  readonly activityRepository: MockedRepository<WorkforceActivityRepository>
  readonly oversightRepository: MockedRepository<AdminOversightRepository>
  readonly platformTemplateRepository: MockedRepository<PlatformContractTemplateRepository>
  readonly jobOpeningModerationService: JobOpeningModerationService
  readonly workforceActivityService: WorkforceActivityService
  readonly adminOversightService: AdminOversightService
  readonly platformContractTemplateService: PlatformContractTemplateService
}

/** The real W14 services over mocked repositories (no network). */
export function createModerationTestHarness(): ModerationTestHarness {
  const listAdminQueue: Mock<JobOpeningModerationRepository['listAdminQueue']> = vi.fn().mockResolvedValue([])
  const moderationRepository: MockedRepository<JobOpeningModerationRepository> = {
    report: vi.fn(),
    withdrawReport: vi.fn(),
    listMyReports: vi.fn().mockResolvedValue([]),
    listOwnerModeration: vi.fn().mockResolvedValue([]),
    submitChanges: vi.fn(),
    listAdminQueue,
    // W13 bridge: by default the paged queue serves the W14 `listAdminQueue` mock as one page
    // (total = its length; any later page is empty), so W14 panel tests keep their fixtures.
    // W13 tests replace this implementation with real pages.
    listAdminQueuePage: vi.fn(async (filter: ModerationQueueFilter, cursor: AdminModerationQueueCursor | null): Promise<AdminModerationQueuePage> => {
      if (cursor !== null) {
        return { items: [], totalCount: null }
      }
      const items = await listAdminQueue(filter)
      return { items, totalCount: items.length }
    }),
    fetchAdminCase: vi.fn().mockResolvedValue(buildAdminCase()),
    moderate: vi.fn(),
  }
  const activityRepository: MockedRepository<WorkforceActivityRepository> = { listMyActivity: vi.fn().mockResolvedValue([]) }
  const oversightRepository: MockedRepository<AdminOversightRepository> = {
    fetchModerationSummary: vi.fn().mockResolvedValue(buildModerationSummary()),
    listUnreviewedApprovedShops: vi.fn().mockResolvedValue([]),
    rereviewShop: vi.fn(),
    lookupRelationships: vi.fn(),
    searchAuditLog: vi.fn().mockResolvedValue([]),
    listAccessFlags: vi.fn().mockResolvedValue([]),
  }
  const platformTemplateRepository: MockedRepository<PlatformContractTemplateRepository> = {
    fetchCurrentStandard: vi.fn().mockResolvedValue(testStandardTemplate),
    listVersionHistory: vi.fn().mockResolvedValue([]),
    listVersionClauses: vi.fn().mockResolvedValue(buildStandardClauses()),
    publish: vi.fn(),
  }
  return {
    moderationRepository,
    activityRepository,
    oversightRepository,
    platformTemplateRepository,
    jobOpeningModerationService: new JobOpeningModerationService(moderationRepository),
    workforceActivityService: new WorkforceActivityService(activityRepository),
    adminOversightService: new AdminOversightService(oversightRepository),
    platformContractTemplateService: new PlatformContractTemplateService(platformTemplateRepository),
  }
}
