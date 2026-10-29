import type { AdminDashboardSummary, OwnerDashboardSummary, WorkerDashboardSummary } from '../models/WorkforceDashboardSummary'

/**
 * W11 "next action first" (spec H, D-42, D-43). Pure: a database summary in, an ordered list out.
 * Order is a fixed priority (answers owed to someone else first, then decisions waiting on the
 * viewer, then housekeeping). No ranking or matching algorithm; counts are shown as stored.
 */

export type WorkerNextActionKey =
  | 'dispute_response_needed'
  | 'contract_offer'
  | 'amendment_offer'
  | 'training_invitation'
  | 'platform_review_available'
  | 'complete_profile'
  | 'draft_application'

export type WorkerNextActionTarget = 'profile' | 'applications' | 'training' | 'certifications' | 'contracts'

export type OwnerNextActionKey =
  | 'dispute_response_needed'
  | 'new_application'
  | 'open_shop_review_request'
  | 'open_platform_review'
  | 'ready_to_certify'
  | 'shops_needing_verification'
  | 'relationship_needs_attention'
  | 'record_changed_certification'
  | 'expiring_certification'
  | 'contract_draft'
  | 'newer_standard_template'

export type OwnerNextActionTarget = 'jobs' | 'training' | 'certifications' | 'contracts' | 'worker_contracts' | 'verification'

export type AdminNextActionKey = 'shops_pending_review' | 'open_platform_review' | 'unviewed_dispute' | 'open_dispute'

export type AdminNextActionTarget = 'shop_verification' | 'certification_reviews' | 'contract_disputes'

export interface NextAction<Key extends string, Target extends string> {
  readonly key: Key
  readonly target: Target
  /** How many items the action covers (1 for a yes / no item). Never 0: empty actions are left out. */
  readonly count: number
}

export type WorkerNextAction = NextAction<WorkerNextActionKey, WorkerNextActionTarget>
export type OwnerNextAction = NextAction<OwnerNextActionKey, OwnerNextActionTarget>
export type AdminNextAction = NextAction<AdminNextActionKey, AdminNextActionTarget>

function keepNonEmpty<Action extends { readonly count: number }>(candidates: readonly Action[]): Action[] {
  return candidates.filter((candidate) => candidate.count > 0)
}

export function workerNextActions(summary: WorkerDashboardSummary): WorkerNextAction[] {
  const profileGapCount = summary.hasWorkerProfile ? summary.profileMissingFields.length : 1
  return keepNonEmpty<WorkerNextAction>([
    { key: 'dispute_response_needed', target: 'contracts', count: summary.disputeResponseNeededCount },
    { key: 'contract_offer', target: 'contracts', count: summary.contractOfferCount },
    { key: 'amendment_offer', target: 'contracts', count: summary.amendmentOfferCount },
    { key: 'training_invitation', target: 'training', count: summary.trainingInvitationCount },
    { key: 'platform_review_available', target: 'certifications', count: summary.platformReviewAvailableCount },
    { key: 'complete_profile', target: 'profile', count: profileGapCount },
    { key: 'draft_application', target: 'applications', count: summary.draftApplicationCount },
  ])
}

export function ownerNextActions(summary: OwnerDashboardSummary): OwnerNextAction[] {
  return keepNonEmpty<OwnerNextAction>([
    { key: 'dispute_response_needed', target: 'worker_contracts', count: summary.disputeResponseNeededCount },
    { key: 'new_application', target: 'jobs', count: summary.newApplicationCount },
    { key: 'open_shop_review_request', target: 'certifications', count: summary.openShopReviewRequestCount },
    { key: 'open_platform_review', target: 'certifications', count: summary.openPlatformReviewCount },
    { key: 'ready_to_certify', target: 'training', count: summary.readyToCertifyCount },
    { key: 'shops_needing_verification', target: 'verification', count: summary.shopsNeedingVerificationCount },
    { key: 'relationship_needs_attention', target: 'worker_contracts', count: summary.relationshipNeedsAttentionCount },
    { key: 'record_changed_certification', target: 'certifications', count: summary.recordChangedCertificationCount },
    { key: 'expiring_certification', target: 'certifications', count: summary.expiringCertificationCount },
    { key: 'contract_draft', target: 'worker_contracts', count: summary.contractDraftCount },
    { key: 'newer_standard_template', target: 'contracts', count: summary.isNewerStandardTemplateAvailable ? 1 : 0 },
  ])
}

export function adminNextActions(summary: AdminDashboardSummary): AdminNextAction[] {
  return keepNonEmpty<AdminNextAction>([
    { key: 'unviewed_dispute', target: 'contract_disputes', count: summary.unviewedDisputeCount },
    { key: 'open_platform_review', target: 'certification_reviews', count: summary.openPlatformReviewCount },
    { key: 'shops_pending_review', target: 'shop_verification', count: summary.shopsPendingReviewCount },
    // The database total, shown as is (P65: the client never derives a count from two others).
    { key: 'open_dispute', target: 'contract_disputes', count: summary.openDisputeCount },
  ])
}
