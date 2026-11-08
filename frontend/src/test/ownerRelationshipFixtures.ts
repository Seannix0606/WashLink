import { vi, type Mock } from 'vitest'
import { OwnerRelationshipService } from '../application/services/OwnerRelationshipService'
import { WorkforcePolicyService } from '../application/services/WorkforcePolicyService'
import type { MyOwnerRelationship, OwnerRelationshipProgress, OwnerSideWorkerRelationship } from '../domain/models/OwnerRelationship'
import type { WorkforcePolicy } from '../domain/models/WorkforcePolicy'
import type { OwnerRelationshipRepository } from '../domain/repositories/OwnerRelationshipRepository'
import type { WorkforcePolicyRepository } from '../domain/repositories/WorkforcePolicyRepository'

type MockedRepository<RepositoryContract> = {
  [MethodName in keyof RepositoryContract]: RepositoryContract[MethodName] extends (...methodArguments: never[]) => unknown
    ? Mock<RepositoryContract[MethodName]>
    : never
}

export const testRelationshipIdentifier = '00000000-0000-4000-8000-0000000010a1'
export const testPolicyIdentifier = '00000000-0000-4000-8000-0000000010b1'

export function buildProgress(overrides: Partial<OwnerRelationshipProgress> = {}): OwnerRelationshipProgress {
  return {
    minimumDistinctOwners: 3,
    defaultMinimum: 3,
    qualifyingOwnerCount: 1,
    remainingOwnerCount: 2,
    isGoalReached: false,
    enforcement: 'informational',
    policyRevision: 1,
    countedAsOf: '2026-10-28',
    ...overrides,
  }
}

export function buildMyRelationship(overrides: Partial<MyOwnerRelationship> = {}): MyOwnerRelationship {
  return {
    relationshipId: testRelationshipIdentifier,
    ownerName: 'Alma Owner',
    isOwnerRemoved: false,
    shopNames: ['Test Wash Bay'],
    status: 'active',
    statusReason: 'contract_active',
    countsTowardGoal: true,
    qualifyingContractCount: 1,
    acceptedContractCount: 1,
    firstAcceptedAt: '2026-10-01T02:00:00Z',
    statusChangedAt: '2026-10-02T02:00:00Z',
    ...overrides,
  }
}

export function buildOwnerSideRelationship(overrides: Partial<OwnerSideWorkerRelationship> = {}): OwnerSideWorkerRelationship {
  return {
    relationshipId: testRelationshipIdentifier,
    workerId: '00000000-0000-4000-8000-0000000010c1',
    workerName: 'Test Worker',
    status: 'active',
    statusReason: 'contract_active',
    contractsWithYouCount: 2,
    firstAcceptedAt: '2026-10-01T02:00:00Z',
    statusChangedAt: '2026-10-02T02:00:00Z',
    ...overrides,
  }
}

export function buildWorkforcePolicy(overrides: Partial<WorkforcePolicy> = {}): WorkforcePolicy {
  return {
    policyId: testPolicyIdentifier,
    policyKey: 'minimum_distinct_owners',
    integerValue: 3,
    defaultValue: 3,
    enforcement: 'informational',
    description:
      'Number of different verified shop owners with an active contract that WashLink shows to workers as a progress goal. Informational only.',
    revision: 1,
    lastChangeReason: null,
    updatedBy: null,
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    ...overrides,
  }
}

export interface OwnerRelationshipTestHarness {
  readonly repository: MockedRepository<OwnerRelationshipRepository>
  readonly ownerRelationshipService: OwnerRelationshipService
}

/** The real service over a mocked repository (no network). */
export function createOwnerRelationshipTestHarness(
  progress: OwnerRelationshipProgress | null = buildProgress(),
  myRelationships: MyOwnerRelationship[] = [buildMyRelationship()],
  ownerRelationships: OwnerSideWorkerRelationship[] = [buildOwnerSideRelationship()],
): OwnerRelationshipTestHarness {
  const repository: MockedRepository<OwnerRelationshipRepository> = {
    fetchMyProgress: vi.fn().mockResolvedValue(progress),
    listMyRelationships: vi.fn().mockResolvedValue(myRelationships),
    listOwnerWorkerRelationships: vi.fn().mockResolvedValue(ownerRelationships),
  }
  return { repository, ownerRelationshipService: new OwnerRelationshipService(repository) }
}

export interface WorkforcePolicyTestHarness {
  readonly repository: MockedRepository<WorkforcePolicyRepository>
  readonly workforcePolicyService: WorkforcePolicyService
}

export function createWorkforcePolicyTestHarness(policies: WorkforcePolicy[] = [buildWorkforcePolicy()]): WorkforcePolicyTestHarness {
  const repository: MockedRepository<WorkforcePolicyRepository> = {
    listPolicies: vi.fn().mockResolvedValue(policies),
    changePolicyValue: vi.fn(),
  }
  return { repository, workforcePolicyService: new WorkforcePolicyService(repository) }
}

/** Words that would present the informational goal as a duty or a condition (D-3, W10-L1). */
export const obligationWording =
  /\bmust\b|\brequired\b|\brequirement\b|\bobligat|\bmandatory\b|\bhave to\b|\bneed to\b|\bneeds to\b|\bshould\b|\bcondition\b|\bpenalt|\bblock(ed|s)?\b/i
