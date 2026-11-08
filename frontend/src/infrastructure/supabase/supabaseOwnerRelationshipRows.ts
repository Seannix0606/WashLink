import type {
  MyOwnerRelationship,
  OwnerRelationshipProgress,
  OwnerSideWorkerRelationship,
  WorkerOwnerRelationshipReason,
  WorkerOwnerRelationshipStatus,
  WorkforcePolicyEnforcement,
} from '../../domain/models/OwnerRelationship'

/** `my_owner_relationship_progress()` (w10f). */
export interface SupabaseOwnerRelationshipProgressRow {
  minimum_distinct_owners: number
  default_minimum: number
  qualifying_owner_count: number
  remaining_owner_count: number
  goal_reached: boolean
  enforcement: WorkforcePolicyEnforcement
  policy_revision: number
  counted_as_of: string
}

/** `my_owner_relationships()` (w10f). */
export interface SupabaseMyOwnerRelationshipRow {
  relationship_id: string
  owner_name: string
  owner_removed: boolean
  shop_names: string[] | null
  status: WorkerOwnerRelationshipStatus
  status_reason: WorkerOwnerRelationshipReason
  counts_toward_goal: boolean
  qualifying_contract_count: number
  accepted_contract_count: number
  first_accepted_at: string
  /** w10f fix cycle 1: null when the live status differs from the stored row. */
  status_changed_at: string | null
}

/** `owner_worker_relationships()` (w10f): no goal, count, remaining or other-owner column exists. */
export interface SupabaseOwnerWorkerRelationshipRow {
  relationship_id: string
  worker_id: string
  worker_name: string
  status: WorkerOwnerRelationshipStatus
  status_reason: WorkerOwnerRelationshipReason
  contracts_with_you_count: number
  first_accepted_at: string
  /** w10f fix cycle 1: null when the live status differs from the stored row. */
  status_changed_at: string | null
}

export function mapOwnerRelationshipProgressRow(row: SupabaseOwnerRelationshipProgressRow): OwnerRelationshipProgress {
  return {
    minimumDistinctOwners: row.minimum_distinct_owners,
    defaultMinimum: row.default_minimum,
    qualifyingOwnerCount: row.qualifying_owner_count,
    remainingOwnerCount: row.remaining_owner_count,
    isGoalReached: row.goal_reached,
    enforcement: row.enforcement,
    policyRevision: row.policy_revision,
    countedAsOf: row.counted_as_of,
  }
}

export function mapMyOwnerRelationshipRow(row: SupabaseMyOwnerRelationshipRow): MyOwnerRelationship {
  return {
    relationshipId: row.relationship_id,
    ownerName: row.owner_name,
    isOwnerRemoved: row.owner_removed,
    shopNames: row.shop_names ?? [],
    status: row.status,
    statusReason: row.status_reason,
    countsTowardGoal: row.counts_toward_goal,
    qualifyingContractCount: row.qualifying_contract_count,
    acceptedContractCount: row.accepted_contract_count,
    firstAcceptedAt: row.first_accepted_at,
    statusChangedAt: row.status_changed_at,
  }
}

export function mapOwnerWorkerRelationshipRow(row: SupabaseOwnerWorkerRelationshipRow): OwnerSideWorkerRelationship {
  return {
    relationshipId: row.relationship_id,
    workerId: row.worker_id,
    workerName: row.worker_name,
    status: row.status,
    statusReason: row.status_reason,
    contractsWithYouCount: row.contracts_with_you_count,
    firstAcceptedAt: row.first_accepted_at,
    statusChangedAt: row.status_changed_at,
  }
}
