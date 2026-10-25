import { vi, type Mock } from 'vitest'
import { CertificationReviewService } from '../application/services/CertificationReviewService'
import { CertificationService } from '../application/services/CertificationService'
import type { CertifiableEnrollment, MyCertification, OwnerCertification } from '../domain/models/Certification'
import type { CertificationActionRepository, CertificationRepository } from '../domain/repositories/CertificationRepository'
import type { CertificationDependencies } from '../presentation/dependencyInjection/createCertificationDependencies'
import { testShopIdentifier } from './fixtures'
import {
  createMockTrainingEvidenceRepository,
  createMockTrainingProgramRepository,
  testTrainingEnrollmentIdentifier,
  testTrainingProgramIdentifier,
} from './trainingFixtures'

// Synthetic W7 test data only; no real person, shop or contact detail.
export const testCertificationIdentifier = '34343434-3434-4343-8343-343434343434'
export const testAssessmentIdentifier = '56565656-5656-4565-8565-565656565656'
export const testReassessmentIdentifier = '78787878-7878-4787-8787-787878787878'
export const testReviewRequestIdentifier = '90909090-9090-4909-8909-909090909090'
export const testCurrentInstant = new Date('2026-10-26T04:00:00Z')

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (...methodArguments: never[]) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export function buildMyCertification(overrides: Partial<MyCertification> = {}): MyCertification {
  return {
    certificationId: testCertificationIdentifier,
    certificationTitle: 'Hand wash basics',
    issuerKind: 'shop_issued',
    programId: testTrainingProgramIdentifier,
    enrollmentId: testTrainingEnrollmentIdentifier,
    renewsCertificationId: null,
    status: 'active',
    effectiveStatus: 'active',
    statusReason: null,
    statusChangedAt: null,
    issuedAt: '2026-06-01T02:00:00+00:00',
    expiresAt: '2027-06-01T02:00:00+00:00',
    validityMonths: 12,
    shopName: 'Test Shop',
    approverDisplayName: 'Test Owner',
    assessorRole: 'owner',
    assessorDisplayName: 'Test Owner',
    attendedTrainingDays: 3,
    requiredTrainingDays: 3,
    shopVerificationStatusAtIssue: 'approved',
    shopVerifiedAtAtIssue: '2026-05-01T02:00:00+00:00',
    isIssuingShopPresent: true,
    isIssuingShopCurrentlyVerified: true,
    isRenewalWindowOpen: false,
    isTrainingRecordChangedAfterIssue: false,
    openReviewRequestId: null,
    reviewRequestsUsed: 0,
    reviewWindowEndsAt: null,
    ...overrides,
  }
}

export function buildOwnerCertification(overrides: Partial<OwnerCertification> = {}): OwnerCertification {
  return {
    certificationId: testCertificationIdentifier,
    workerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workerDisplayName: 'Test Worker',
    certificationTitle: 'Hand wash basics',
    programId: testTrainingProgramIdentifier,
    enrollmentId: testTrainingEnrollmentIdentifier,
    renewsCertificationId: null,
    status: 'active',
    effectiveStatus: 'active',
    statusReason: null,
    issuedAt: '2026-06-01T02:00:00+00:00',
    expiresAt: '2027-06-01T02:00:00+00:00',
    validityMonths: 12,
    isTrainingRecordChangedAfterIssue: false,
    isRenewalWindowOpen: false,
    latestReassessmentId: null,
    latestReassessmentResult: null,
    latestReassessmentAssessedOn: null,
    isLatestReassessmentUsed: false,
    openReviewRequestId: null,
    openReviewStatement: null,
    openReviewRequestedAt: null,
    ...overrides,
  }
}

export function buildCertifiableEnrollment(overrides: Partial<CertifiableEnrollment> = {}): CertifiableEnrollment {
  return {
    enrollmentId: testTrainingEnrollmentIdentifier,
    workerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workerDisplayName: 'Test Trainee',
    attendedTrainingDays: 3,
    requiredTrainingDays: 3,
    currentAssessmentId: testAssessmentIdentifier,
    assessedOn: '2026-10-20',
    assessorDisplayName: 'Test Owner',
    validityMonths: 12,
    ...overrides,
  }
}

export function createMockCertificationRepository(): MockedRepository<CertificationRepository> {
  return {
    listMyCertifications: vi.fn(),
    listOwnerCertifications: vi.fn(),
    listHistory: vi.fn().mockResolvedValue([]),
    listCertifiableEnrollments: vi.fn(),
    fetchShopPolicy: vi.fn(),
  }
}

export function createMockCertificationActionRepository(): MockedRepository<CertificationActionRepository> {
  return {
    issue: vi.fn(),
    setShopValidity: vi.fn(),
    recordReassessment: vi.fn(),
    renew: vi.fn(),
    transition: vi.fn(),
    requestReview: vi.fn(),
    withdrawReview: vi.fn(),
    decideReview: vi.fn(),
  }
}

export interface CertificationTestHarness {
  readonly certificationRepository: MockedRepository<CertificationRepository>
  readonly actionRepository: MockedRepository<CertificationActionRepository>
  readonly evidenceRepository: ReturnType<typeof createMockTrainingEvidenceRepository>
  readonly programRepository: ReturnType<typeof createMockTrainingProgramRepository>
  readonly certificationDependencies: CertificationDependencies
}

/** Real services over mocked repositories (no network). */
export function createCertificationTestHarness(): CertificationTestHarness {
  const certificationRepository = createMockCertificationRepository()
  const actionRepository = createMockCertificationActionRepository()
  const evidenceRepository = createMockTrainingEvidenceRepository()
  const programRepository = createMockTrainingProgramRepository()
  certificationRepository.fetchShopPolicy.mockResolvedValue({
    shopId: testShopIdentifier,
    validityMonths: 12,
    hasPolicyRow: false,
    updatedAt: null,
  })
  return {
    certificationRepository,
    actionRepository,
    evidenceRepository,
    programRepository,
    certificationDependencies: {
      certificationService: new CertificationService(certificationRepository, actionRepository, evidenceRepository, programRepository),
      certificationReviewService: new CertificationReviewService(actionRepository),
    },
  }
}
