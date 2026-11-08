/**
 * W10 worker-to-owner relationships (docs/workforce/OWNER_RELATIONSHIPS.md, D-3, D-36, D-38).
 * Rows are derived by WashLink from accepted contracts; no client ever writes them.
 * The distinct-owner count is an informational progress goal only, never a condition.
 */

export const workerOwnerRelationshipStatuses = ['active', 'suspended', 'pending_start', 'ended', 'owner_removed'] as const

export type WorkerOwnerRelationshipStatus = (typeof workerOwnerRelationshipStatuses)[number]

export const workerOwnerRelationshipReasons = [
  'contract_accepted_not_started',
  'contract_active',
  'owner_verification_not_current',
  'shop_removed',
  'shop_owner_changed',
  'owner_role_changed',
  'contract_terminated',
  'contract_expired',
  'owner_account_removed',
] as const

export type WorkerOwnerRelationshipReason = (typeof workerOwnerRelationshipReasons)[number]

/** The only enforcement the database allows (CHECK); any other mode needs a migration and legal review. */
export type WorkforcePolicyEnforcement = 'informational'

/** The worker's own progress, read live by `my_owner_relationship_progress()` (as of Manila today). */
export interface OwnerRelationshipProgress {
  readonly minimumDistinctOwners: number
  readonly defaultMinimum: number
  readonly qualifyingOwnerCount: number
  readonly remainingOwnerCount: number
  readonly isGoalReached: boolean
  readonly enforcement: WorkforcePolicyEnforcement
  readonly policyRevision: number
  /** Manila date (YYYY-MM-DD) the count was derived for. */
  readonly countedAsOf: string
}

/** One row per owner the worker accepted a contract with (`my_owner_relationships()`). */
export interface MyOwnerRelationship {
  readonly relationshipId: string
  /** Name snapshot from the contract; kept after the owner account is removed. */
  readonly ownerName: string
  readonly isOwnerRemoved: boolean
  /** Shop name snapshots of the worker's accepted contracts with this owner (empty once the owner is removed). */
  readonly shopNames: readonly string[]
  readonly status: WorkerOwnerRelationshipStatus
  readonly statusReason: WorkerOwnerRelationshipReason
  readonly countsTowardGoal: boolean
  readonly qualifyingContractCount: number
  /** Accepted contracts with this owner (0 once the owner is removed). */
  readonly acceptedContractCount: number
  readonly firstAcceptedAt: string
  /** Null when the live status differs from the stored one (the database has no date for the live status yet). */
  readonly statusChangedAt: string | null
}

/**
 * The owner's view of its own relationship with one worker (`owner_worker_relationships()`).
 * Never carries the worker's total, remaining, goal or any other owner (D-38).
 */
export interface OwnerSideWorkerRelationship {
  readonly relationshipId: string
  readonly workerId: string
  readonly workerName: string
  readonly status: WorkerOwnerRelationshipStatus
  readonly statusReason: WorkerOwnerRelationshipReason
  readonly contractsWithYouCount: number
  readonly firstAcceptedAt: string
  /** Null when the live status differs from the stored one (the database has no date for the live status yet). */
  readonly statusChangedAt: string | null
}

/** What the worker's Contracts tab shows above the contract list. */
export interface MyOwnerRelationshipOverview {
  /** Null when the server returned no progress row (not a worker account, or no policy row). */
  readonly progress: OwnerRelationshipProgress | null
  readonly relationships: readonly MyOwnerRelationship[]
}
