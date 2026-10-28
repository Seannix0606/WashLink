import type { WorkerOwnerRelationshipReason, WorkerOwnerRelationshipStatus } from '../../domain/models/OwnerRelationship'
import type { BadgeTone } from '../design/ui'

export interface RelationshipStatusDisplay {
  readonly label: string
  readonly tone: BadgeTone
}

export type RelationshipViewerRole = 'worker' | 'owner'

/**
 * Worker labels. The database status `suspended` only means the relationship does not count toward the progress goal
 * right now; the contract itself stays active, so the label never reads as a suspension of work or pay (C1, W10-L9).
 */
export const relationshipStatusDisplay: Readonly<Record<WorkerOwnerRelationshipStatus, RelationshipStatusDisplay>> = {
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Not counting right now', tone: 'warning' },
  pending_start: { label: 'Accepted, not started', tone: 'info' },
  ended: { label: 'Ended', tone: 'neutral' },
  owner_removed: { label: 'Owner account removed', tone: 'neutral' },
}

/**
 * Owner labels: the owner never sees the worker's goal (D-38), so `suspended` is shown as a neutral prompt; the reason
 * line says what needs attention (verification, a removed or transferred shop, or the account role).
 */
export const ownerSideStatusDisplay: Readonly<Record<WorkerOwnerRelationshipStatus, RelationshipStatusDisplay>> = {
  ...relationshipStatusDisplay,
  suspended: { label: 'Needs attention', tone: 'warning' },
}

export function relationshipStatusLabel(status: WorkerOwnerRelationshipStatus, viewerRole: RelationshipViewerRole): RelationshipStatusDisplay {
  return viewerRole === 'worker' ? relationshipStatusDisplay[status] : ownerSideStatusDisplay[status]
}

/** Worker only: whether and why a relationship counts toward the progress goal (D-3, D-36). */
export const relationshipCountingText: Readonly<Record<WorkerOwnerRelationshipStatus, string>> = {
  active: 'Counts toward your progress goal.',
  suspended: 'Does not count toward your progress goal right now. Your contract itself is unchanged. It counts again on its own once the reason below is resolved.',
  pending_start: 'Does not count until the contract starts.',
  ended: 'Does not count. The contracts with this owner have ended.',
  owner_removed: 'Does not count. The owner account is no longer on WashLink.',
}

const workerReasonText: Readonly<Record<WorkerOwnerRelationshipReason, string>> = {
  contract_accepted_not_started: 'You accepted a contract that has not started yet.',
  contract_active: 'You have an active contract with a verified shop of this owner.',
  owner_verification_not_current: "The shop's verification is not current right now.",
  shop_removed: 'The shop on your contract is no longer on WashLink.',
  shop_owner_changed: 'The shop on your contract now belongs to a different owner.',
  owner_role_changed: 'This account is no longer a shop owner account.',
  contract_terminated: 'The contract was ended.',
  contract_expired: 'The contract reached its end date.',
  owner_account_removed: "The owner's account was removed. Your contract records are kept.",
}

const ownerReasonText: Readonly<Record<WorkerOwnerRelationshipReason, string>> = {
  contract_accepted_not_started: 'The worker accepted a contract that has not started yet.',
  contract_active: 'Active contract with your verified shop.',
  owner_verification_not_current: "Your shop's verification is not current right now.",
  shop_removed: 'The shop on this contract is no longer on WashLink.',
  shop_owner_changed: 'The shop on this contract now belongs to a different owner.',
  owner_role_changed: 'Your account is no longer a shop owner account.',
  contract_terminated: 'The contract was ended.',
  contract_expired: 'The contract reached its end date.',
  owner_account_removed: 'The owner account was removed.',
}

export function relationshipReasonText(reason: WorkerOwnerRelationshipReason, viewerRole: RelationshipViewerRole): string {
  return viewerRole === 'worker' ? workerReasonText[reason] : ownerReasonText[reason]
}

/** "Since <date>" for a status change; null when the server has no date for the live status (it differs from the stored one). */
export function describeStatusSince(statusChangedAt: string | null): string | null {
  return statusChangedAt === null ? null : `Since ${formatRelationshipDate(statusChangedAt)}`
}

/** A stored timestamp as a short local date; the raw text when it cannot be read. */
export function formatRelationshipDate(rawTimestamp: string): string {
  const parsedDate = new Date(rawTimestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return rawTimestamp
  }
  return parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Every W10 display label, for wording checks. */
export const ownerRelationshipDisplayLabels: readonly string[] = [
  ...Object.values(relationshipStatusDisplay).map((statusDisplay) => statusDisplay.label),
  ownerSideStatusDisplay.suspended.label,
  ...Object.values(relationshipCountingText),
  ...Object.values(workerReasonText),
  ...Object.values(ownerReasonText),
]
