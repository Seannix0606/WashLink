import { vi, type Mock } from 'vitest'
import { CertificationPlatformReviewService } from '../application/services/CertificationPlatformReviewService'
import { ContractDisputeService } from '../application/services/ContractDisputeService'
import { WorkforceDashboardService } from '../application/services/WorkforceDashboardService'
import type {
  AdminPlatformReviewCase,
  MyCertificationPlatformReview,
  OwnerCertificationPlatformReview,
} from '../domain/models/CertificationPlatformReview'
import type { AdminContractDisputeCase, MyContractDispute } from '../domain/models/ContractDispute'
import type { MarketplaceJobOpening } from '../domain/models/MarketplaceJobOpening'
import type { AdminDashboardSummary, OwnerDashboardSummary, WorkerDashboardSummary } from '../domain/models/WorkforceDashboardSummary'
import type { CertificationPlatformReviewRepository } from '../domain/repositories/CertificationPlatformReviewRepository'
import type { ContractDisputeRepository } from '../domain/repositories/ContractDisputeRepository'
import type { MarketplaceRepository } from '../domain/repositories/MarketplaceRepository'
import type { WorkforceDashboardRepository } from '../domain/repositories/WorkforceDashboardRepository'
import { testCertificationIdentifier } from './certificationFixtures'
import { testContractIdentifier } from './workerContractFixtures'

// Synthetic W11 test data only; no real person, shop or contact detail.
export const testPlatformReviewIdentifier = '11111111-aaaa-4111-8111-111111111111'
export const testDisputeIdentifier = '22222222-bbbb-4222-8222-222222222222'
export const testSealedVersionIdentifier = '33333333-cccc-4333-8333-333333333333'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (...methodArguments: never[]) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export function buildWorkerSummary(overrides: Partial<WorkerDashboardSummary> = {}): WorkerDashboardSummary {
  return {
    hasWorkerProfile: true,
    profileMissingFields: [],
    openOpeningCount: 0,
    draftApplicationCount: 0,
    activeApplicationCount: 0,
    acceptedApplicationCount: 0,
    trainingInvitationCount: 0,
    trainingInProgressCount: 0,
    nextTrainingDate: null,
    currentCertificationCount: 0,
    expiringCertificationCount: 0,
    suspendedOrRevokedCertificationCount: 0,
    platformReviewAvailableCount: 0,
    openPlatformReviewCount: 0,
    contractOfferCount: 0,
    amendmentOfferCount: 0,
    acceptedNotStartedCount: 0,
    activeContractCount: 0,
    openDisputeCount: 0,
    disputeResponseNeededCount: 0,
    countedAsOf: '2026-10-29T02:00:00Z',
    ...overrides,
  }
}

export function buildOwnerSummary(overrides: Partial<OwnerDashboardSummary> = {}): OwnerDashboardSummary {
  return {
    shopCount: 1,
    verifiedShopCount: 1,
    shopsNeedingVerificationCount: 0,
    publishedOpeningCount: 0,
    draftOpeningCount: 0,
    newApplicationCount: 0,
    inReviewApplicationCount: 0,
    trainingInvitationPendingCount: 0,
    traineeInProgressCount: 0,
    readyToCertifyCount: 0,
    openShopReviewRequestCount: 0,
    openPlatformReviewCount: 0,
    expiringCertificationCount: 0,
    recordChangedCertificationCount: 0,
    activeTemplateCount: 0,
    isNewerStandardTemplateAvailable: false,
    contractDraftCount: 0,
    offerAwaitingWorkerCount: 0,
    amendmentAwaitingWorkerCount: 0,
    acceptedNotStartedCount: 0,
    activeContractCount: 0,
    relationshipNeedsAttentionCount: 0,
    openDisputeCount: 0,
    disputeResponseNeededCount: 0,
    ...overrides,
  }
}

export function buildAdminSummary(overrides: Partial<AdminDashboardSummary> = {}): AdminDashboardSummary {
  return {
    shopsPendingReviewCount: 0,
    openPlatformReviewCount: 0,
    oldestPlatformReviewOpenedAt: null,
    overdueShopReviewRequestCount: 0,
    strandedSuspendedCertificationCount: 0,
    openDisputeCount: 0,
    unviewedDisputeCount: 0,
    oldestDisputeOpenedAt: null,
    ...overrides,
  }
}

export function buildLatestOpening(overrides: Partial<MarketplaceJobOpening> = {}): MarketplaceJobOpening {
  return {
    jobOpeningId: '44444444-dddd-4444-8444-444444444444',
    shopId: 'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9',
    shopName: 'Test Wash Bay',
    title: 'Car wash attendant',
    workLocation: null,
    jobType: null,
    applicantRequirement: null,
    requiredSkills: [],
    compensationMinAmount: 650,
    compensationMaxAmount: 650,
    compensationCurrency: 'PHP',
    compensationPeriod: 'day',
    applicationDeadline: null,
    firstPublishedAt: '2026-10-28T02:00:00Z',
    myApplicationStatus: null,
    ...overrides,
  }
}

export function buildMyPlatformReview(overrides: Partial<MyCertificationPlatformReview> = {}): MyCertificationPlatformReview {
  return {
    certificationId: testCertificationIdentifier,
    canOpen: false,
    basis: null,
    openReviewId: null,
    latestStatus: null,
    latestDecisionReason: null,
    latestDecidedAt: null,
    openedAt: null,
    ...overrides,
  }
}

export function buildOwnerPlatformReview(overrides: Partial<OwnerCertificationPlatformReview> = {}): OwnerCertificationPlatformReview {
  return {
    certificationId: testCertificationIdentifier,
    reviewId: testPlatformReviewIdentifier,
    status: 'open',
    basis: 'upheld_by_shop',
    workerStatement: 'The suspension was based on a day I was not on shift.',
    decisionReason: null,
    openedAt: '2026-10-27T02:00:00Z',
    decidedAt: null,
    ...overrides,
  }
}

export function buildAdminReviewCase(overrides: Partial<AdminPlatformReviewCase['review']> = {}): AdminPlatformReviewCase {
  return {
    review: {
      reviewId: testPlatformReviewIdentifier,
      certificationId: testCertificationIdentifier,
      basis: 'issuer_unavailable',
      status: 'open',
      revision: 1,
      certificationStatusAtOpen: 'suspended',
      escalatedFromRequestId: null,
      workerStatement: 'The shop closed and nobody can decide my review anymore.',
      openedAt: '2026-10-27T02:00:00Z',
      decidedAt: null,
      decisionReason: null,
      closedAt: null,
      ...overrides,
    },
    workerDisplayName: 'Test Worker',
    certification: {
      certificationTitle: 'Hand wash basics',
      programTitleSnapshot: 'Hand wash basics',
      shopNameSnapshot: 'Test Shop',
      issuedAt: '2026-06-01T02:00:00Z',
      expiresAt: '2027-06-01T02:00:00Z',
      status: 'suspended',
      effectiveStatus: 'suspended',
      statusReason: 'Repeated unsafe chemical handling on the wash floor.',
      attendedTrainingDays: 3,
      requiredTrainingDays: 3,
      shopVerificationStatusAtIssue: 'approved',
      shopVerifiedAtAtIssue: '2026-05-01T02:00:00Z',
      isIssuingShopPresent: false,
      isIssuingOwnerCurrent: false,
      isIssuingShopCurrentlyVerified: false,
      isTrainingRecordChangedAfterIssue: false,
    },
    statusEvents: [],
    shopRequests: [],
  }
}

export function buildMyDispute(overrides: Partial<MyContractDispute> = {}): MyContractDispute {
  return {
    disputeId: testDisputeIdentifier,
    contractId: testContractIdentifier,
    shopName: 'Test Wash Bay',
    counterpartName: 'Test Owner',
    category: 'owner_ended_contract',
    status: 'open',
    isRaisedByMe: false,
    statement: 'The contract was ended without the notice the terms describe.',
    responseStatement: null,
    resolutionKind: null,
    resolutionNote: null,
    createdAt: '2026-10-28T02:00:00Z',
    respondedAt: null,
    closedAt: null,
    hasWashLinkViewed: false,
    canRespond: true,
    canWithdraw: false,
    ...overrides,
  }
}

export function buildAdminDisputeCase(status: 'open' | 'closed' = 'open'): AdminContractDisputeCase {
  const isOpen = status === 'open'
  return {
    dispute: {
      disputeId: testDisputeIdentifier,
      contractId: testContractIdentifier,
      category: 'owner_ended_contract',
      status,
      revision: isOpen ? 1 : 2,
      raisedByRole: 'worker',
      statement: 'The contract was ended without the notice the terms describe.',
      contractStatusAtRaise: 'terminated',
      responseStatement: null,
      respondedAt: null,
      resolutionKind: isOpen ? null : 'referred_outside_washlink',
      resolutionNote: isOpen ? null : 'We shared where to ask about notice periods.',
      createdAt: '2026-10-28T02:00:00Z',
      closedAt: isOpen ? null : '2026-10-29T02:00:00Z',
      withdrawnAt: null,
      firstViewedByAdminAt: '2026-10-28T03:00:00Z',
    },
    contract: isOpen
      ? {
          status: 'terminated',
          effectiveStatus: 'terminated',
          classificationKey: 'employee',
          startDate: '2026-11-02',
          endDate: null,
          sentAt: '2026-10-26T03:00:00Z',
          acceptedAt: '2026-10-26T04:00:00Z',
          activatedAt: '2026-11-02T01:00:00Z',
          endedAt: '2026-10-28T01:00:00Z',
          endedBy: 'owner',
          endReason: 'The shop is reducing staff this month.',
          declineNote: null,
          shopNameSnapshot: 'Test Wash Bay',
          ownerNameSnapshot: 'Test Owner',
          workerNameSnapshot: 'Test Worker',
          isOwnerRemoved: false,
          isShopRemoved: false,
          isWorkerRemoved: false,
        }
      : null,
    versions: isOpen
      ? [{ versionId: testSealedVersionIdentifier, versionNumber: 1, kind: 'initial', state: 'accepted', sealedAt: '2026-10-26T03:00:00Z', contentHash: 'ab'.repeat(32), flagCount: 0 }]
      : [],
    acceptances: isOpen
      ? [{ partyRole: 'worker', versionNumber: 1, acceptedAt: '2026-10-26T04:00:00Z', versionContentHash: 'ab'.repeat(32), recordLabel: 'Acceptance record — not an e-signature' }]
      : [],
    relationship: isOpen ? { status: 'ended', statusReason: 'contract_terminated' } : null,
  }
}

export interface OversightTestHarness {
  readonly dashboardRepository: MockedRepository<WorkforceDashboardRepository>
  readonly marketplaceRepository: MockedRepository<MarketplaceRepository>
  readonly platformReviewRepository: MockedRepository<CertificationPlatformReviewRepository>
  readonly disputeRepository: MockedRepository<ContractDisputeRepository>
  readonly workforceDashboardService: WorkforceDashboardService
  readonly certificationPlatformReviewService: CertificationPlatformReviewService
  readonly contractDisputeService: ContractDisputeService
}

/** The real W11 services over mocked repositories (no network). */
export function createOversightTestHarness(): OversightTestHarness {
  const dashboardRepository: MockedRepository<WorkforceDashboardRepository> = {
    fetchWorkerSummary: vi.fn().mockResolvedValue(buildWorkerSummary()),
    fetchOwnerSummary: vi.fn().mockResolvedValue(buildOwnerSummary()),
    fetchAdminSummary: vi.fn().mockResolvedValue(buildAdminSummary()),
  }
  const marketplaceRepository: MockedRepository<MarketplaceRepository> = {
    searchJobOpenings: vi.fn().mockResolvedValue([]),
    fetchJobOpening: vi.fn().mockResolvedValue(null),
  }
  const platformReviewRepository: MockedRepository<CertificationPlatformReviewRepository> = {
    listMyReviews: vi.fn().mockResolvedValue([]),
    listOwnerReviews: vi.fn().mockResolvedValue([]),
    listAdminQueue: vi.fn().mockResolvedValue([]),
    fetchAdminCase: vi.fn().mockResolvedValue(buildAdminReviewCase()),
    openReview: vi.fn(),
    withdrawReview: vi.fn(),
    decideReview: vi.fn(),
  }
  const disputeRepository: MockedRepository<ContractDisputeRepository> = {
    listMyDisputes: vi.fn().mockResolvedValue([]),
    raise: vi.fn(),
    respond: vi.fn(),
    withdraw: vi.fn(),
    listAdminQueue: vi.fn().mockResolvedValue([]),
    fetchAdminCase: vi.fn().mockResolvedValue(buildAdminDisputeCase()),
    fetchAdminVersionDocument: vi.fn().mockResolvedValue(null),
    close: vi.fn(),
  }
  return {
    dashboardRepository,
    marketplaceRepository,
    platformReviewRepository,
    disputeRepository,
    workforceDashboardService: new WorkforceDashboardService(dashboardRepository, marketplaceRepository),
    certificationPlatformReviewService: new CertificationPlatformReviewService(platformReviewRepository),
    contractDisputeService: new ContractDisputeService(disputeRepository),
  }
}
