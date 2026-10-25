import { vi, type Mock } from 'vitest'
import type { ApplicantProfile } from '../domain/models/ApplicantProfile'
import type {
  CurrentJobOpeningVersion,
  JobApplication,
  JobApplicationOpeningSnapshot,
} from '../domain/models/JobApplication'
import type { MarketplaceJobOpening } from '../domain/models/MarketplaceJobOpening'
import type { ApplicantPipelineRepository } from '../domain/repositories/ApplicantPipelineRepository'
import type { JobApplicationRepository } from '../domain/repositories/JobApplicationRepository'
import type { MarketplaceRepository } from '../domain/repositories/MarketplaceRepository'
import { buildJobOpening, testJobOpeningIdentifier, testShopIdentifier } from './fixtures'

// Synthetic W5 test data only; no real person, shop or contact detail.
export const testJobApplicationIdentifier = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const testSecondJobApplicationIdentifier = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (
    ...methodArguments: never[]
  ) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export function buildOpeningSnapshot(
  overrides: Partial<JobApplicationOpeningSnapshot> = {},
): JobApplicationOpeningSnapshot {
  return {
    // Content fields of the W4 fixture; the extra row fields are ignored by every consumer.
    ...buildJobOpening(),
    snapshotVersion: 1,
    jobOpeningUpdatedAt: '2026-10-24T00:00:00.123456+00:00',
    shopName: 'Test Shop',
    shopAddress: '2 Test Avenue',
    ...overrides,
  }
}

export function buildJobApplication(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: testJobApplicationIdentifier,
    jobOpeningId: testJobOpeningIdentifier,
    shopId: testShopIdentifier,
    status: 'submitted',
    coverNote: null,
    noticeVersion: 'w5_v1',
    noticeAcknowledgedAt: '2026-10-25T01:00:00+00:00',
    submittedAt: '2026-10-25T01:00:00+00:00',
    decidedAt: null,
    withdrawnAt: null,
    closedAt: null,
    statusChangedAt: '2026-10-25T01:00:00+00:00',
    openingSnapshot: buildOpeningSnapshot(),
    openingSnapshotTakenAt: '2026-10-25T01:00:00+00:00',
    createdAt: '2026-10-25T01:00:00+00:00',
    updatedAt: '2026-10-25T01:00:00.654321+00:00',
    ...overrides,
  }
}

export function buildCurrentOpeningVersion(
  overrides: Partial<CurrentJobOpeningVersion> = {},
): CurrentJobOpeningVersion {
  return {
    jobOpeningId: testJobOpeningIdentifier,
    status: 'published',
    title: 'Car wash attendant',
    applicantRequirement: 'trainees_welcome',
    updatedAt: '2026-10-24T00:00:00.123456+00:00',
    ...overrides,
  }
}

export function buildMarketplaceJobOpening(
  overrides: Partial<MarketplaceJobOpening> = {},
): MarketplaceJobOpening {
  return {
    jobOpeningId: testJobOpeningIdentifier,
    shopId: testShopIdentifier,
    shopName: 'Test Shop',
    title: 'Car wash attendant',
    workLocation: '2 Test Avenue',
    jobType: 'part_time',
    applicantRequirement: 'trainees_welcome',
    requiredSkills: [],
    compensationMinAmount: null,
    compensationMaxAmount: null,
    compensationCurrency: null,
    compensationPeriod: null,
    applicationDeadline: null,
    firstPublishedAt: '2026-10-24T00:00:00+00:00',
    myApplicationStatus: null,
    ...overrides,
  }
}

export function buildApplicantProfile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  return {
    applicationId: testJobApplicationIdentifier,
    displayName: 'Test Applicant',
    headline: 'Detailing helper',
    experienceSummary: 'Two seasons at a test car wash.',
    yearsOfExperience: 2,
    skills: ['Hand washing', 'Interior vacuuming'],
    preferredLocations: ['Test City'],
    availabilityStatus: 'weekends_only',
    availabilityNotes: null,
    profileUpdatedAt: '2026-10-24T00:00:00+00:00',
    ...overrides,
  }
}

export function createMockJobApplicationRepository(): MockedRepository<JobApplicationRepository> {
  return {
    listMyApplications: vi.fn(),
    listCurrentOpeningVersions: vi.fn(),
    createApplication: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    transition: vi.fn(),
  }
}

export function createMockMarketplaceRepository(): MockedRepository<MarketplaceRepository> {
  return {
    searchJobOpenings: vi.fn(),
    fetchJobOpening: vi.fn(),
  }
}

export function createMockApplicantPipelineRepository(): MockedRepository<ApplicantPipelineRepository> {
  return {
    listApplicationsForOpening: vi.fn(),
    listApplicantProfiles: vi.fn(),
    listVerifiedCertifications: vi.fn(),
    countApplicationsByOpening: vi.fn().mockResolvedValue([]),
    transition: vi.fn(),
  }
}
