import type { OwnerRelationshipProgress, WorkerOwnerRelationshipStatus } from '../models/OwnerRelationship'

/** Pure helpers for the informational distinct-owner progress goal (D-3). Nothing here gates an action. */

export type OwnerGoalState = 'not_started' | 'in_progress' | 'goal_reached'

/** Remaining distinct owners toward the goal; never negative. */
export function remainingOwnerCount(qualifyingOwnerCount: number, minimumDistinctOwners: number): number {
  return Math.max(minimumDistinctOwners - qualifyingOwnerCount, 0)
}

export function ownerGoalState(progress: Pick<OwnerRelationshipProgress, 'qualifyingOwnerCount' | 'minimumDistinctOwners'>): OwnerGoalState {
  if (progress.qualifyingOwnerCount >= progress.minimumDistinctOwners) {
    return 'goal_reached'
  }
  return progress.qualifyingOwnerCount > 0 ? 'in_progress' : 'not_started'
}

/** Progress bar value: the count capped at the minimum (a fourth owner still shows a full bar, not more). */
export function progressBarValue(progress: Pick<OwnerRelationshipProgress, 'qualifyingOwnerCount' | 'minimumDistinctOwners'>): number {
  return Math.min(Math.max(progress.qualifyingOwnerCount, 0), progress.minimumDistinctOwners)
}

/** D-3: only `active` counts; pending_start, suspended, ended and owner_removed never count. */
export function relationshipStatusCounts(status: WorkerOwnerRelationshipStatus): boolean {
  return status === 'active'
}

interface ContractStateForSignal {
  readonly contractId: string
  readonly revision: number
  readonly effectiveStatus: string
}

/** Changes only when a contract is added, removed or changes state, so progress is re-read exactly then. */
export function contractListSignal(contracts: readonly ContractStateForSignal[]): string {
  return contracts.map((contract) => `${contract.contractId}:${String(contract.revision)}:${contract.effectiveStatus}`).join('|')
}
