import {
  workerProfileMissingFields,
  type AdminDashboardSummary,
  type OwnerDashboardSummary,
  type WorkerDashboardSummary,
  type WorkerProfileMissingField,
} from '../../domain/models/WorkforceDashboardSummary'

/** `my_worker_dashboard_summary()` (w11h). */
export interface SupabaseWorkerDashboardSummaryRow {
  has_worker_profile: boolean
  profile_missing_fields: string[] | null
  open_opening_count: number
  draft_application_count: number
  active_application_count: number
  accepted_application_count: number
  training_invitation_count: number
  training_in_progress_count: number
  next_training_date: string | null
  current_certification_count: number
  expiring_30d_certification_count: number
  suspended_or_revoked_certification_count: number
  platform_review_available_count: number
  open_platform_review_count: number
  contract_offer_count: number
  amendment_offer_count: number
  accepted_not_started_count: number
  active_contract_count: number
  open_dispute_count: number
  dispute_response_needed_count: number
  counted_as_of: string
}

/** `owner_dashboard_summary()` (w11h). */
export interface SupabaseOwnerDashboardSummaryRow {
  shop_count: number
  verified_shop_count: number
  shops_needing_verification_count: number
  published_opening_count: number
  draft_opening_count: number
  new_application_count: number
  in_review_application_count: number
  training_invitation_pending_count: number
  trainee_in_progress_count: number
  ready_to_certify_count: number
  open_shop_review_request_count: number
  open_platform_review_count: number
  expiring_certification_count: number
  record_changed_certification_count: number
  active_template_count: number
  newer_standard_template_available: boolean
  contract_draft_count: number
  offer_awaiting_worker_count: number
  amendment_awaiting_worker_count: number
  accepted_not_started_count: number
  active_contract_count: number
  relationship_needs_attention_count: number
  open_dispute_count: number
  dispute_response_needed_count: number
}

/** `admin_dashboard_summary()` (w11h). */
export interface SupabaseAdminDashboardSummaryRow {
  shops_pending_review_count: number
  open_platform_review_count: number
  oldest_platform_review_opened_at: string | null
  overdue_shop_review_request_count: number
  stranded_suspended_certification_count: number
  open_dispute_count: number
  unviewed_dispute_count: number
  oldest_dispute_opened_at: string | null
}

function isKnownMissingField(field: string): field is WorkerProfileMissingField {
  return (workerProfileMissingFields as readonly string[]).includes(field)
}

export function mapWorkerDashboardSummaryRow(row: SupabaseWorkerDashboardSummaryRow): WorkerDashboardSummary {
  return {
    hasWorkerProfile: row.has_worker_profile,
    profileMissingFields: (row.profile_missing_fields ?? []).filter(isKnownMissingField),
    openOpeningCount: row.open_opening_count,
    draftApplicationCount: row.draft_application_count,
    activeApplicationCount: row.active_application_count,
    acceptedApplicationCount: row.accepted_application_count,
    trainingInvitationCount: row.training_invitation_count,
    trainingInProgressCount: row.training_in_progress_count,
    nextTrainingDate: row.next_training_date,
    currentCertificationCount: row.current_certification_count,
    expiringCertificationCount: row.expiring_30d_certification_count,
    suspendedOrRevokedCertificationCount: row.suspended_or_revoked_certification_count,
    platformReviewAvailableCount: row.platform_review_available_count,
    openPlatformReviewCount: row.open_platform_review_count,
    contractOfferCount: row.contract_offer_count,
    amendmentOfferCount: row.amendment_offer_count,
    acceptedNotStartedCount: row.accepted_not_started_count,
    activeContractCount: row.active_contract_count,
    openDisputeCount: row.open_dispute_count,
    disputeResponseNeededCount: row.dispute_response_needed_count,
    countedAsOf: row.counted_as_of,
  }
}

export function mapOwnerDashboardSummaryRow(row: SupabaseOwnerDashboardSummaryRow): OwnerDashboardSummary {
  return {
    shopCount: row.shop_count,
    verifiedShopCount: row.verified_shop_count,
    shopsNeedingVerificationCount: row.shops_needing_verification_count,
    publishedOpeningCount: row.published_opening_count,
    draftOpeningCount: row.draft_opening_count,
    newApplicationCount: row.new_application_count,
    inReviewApplicationCount: row.in_review_application_count,
    trainingInvitationPendingCount: row.training_invitation_pending_count,
    traineeInProgressCount: row.trainee_in_progress_count,
    readyToCertifyCount: row.ready_to_certify_count,
    openShopReviewRequestCount: row.open_shop_review_request_count,
    openPlatformReviewCount: row.open_platform_review_count,
    expiringCertificationCount: row.expiring_certification_count,
    recordChangedCertificationCount: row.record_changed_certification_count,
    activeTemplateCount: row.active_template_count,
    isNewerStandardTemplateAvailable: row.newer_standard_template_available,
    contractDraftCount: row.contract_draft_count,
    offerAwaitingWorkerCount: row.offer_awaiting_worker_count,
    amendmentAwaitingWorkerCount: row.amendment_awaiting_worker_count,
    acceptedNotStartedCount: row.accepted_not_started_count,
    activeContractCount: row.active_contract_count,
    relationshipNeedsAttentionCount: row.relationship_needs_attention_count,
    openDisputeCount: row.open_dispute_count,
    disputeResponseNeededCount: row.dispute_response_needed_count,
  }
}

export function mapAdminDashboardSummaryRow(row: SupabaseAdminDashboardSummaryRow): AdminDashboardSummary {
  return {
    shopsPendingReviewCount: row.shops_pending_review_count,
    openPlatformReviewCount: row.open_platform_review_count,
    oldestPlatformReviewOpenedAt: row.oldest_platform_review_opened_at,
    overdueShopReviewRequestCount: row.overdue_shop_review_request_count,
    strandedSuspendedCertificationCount: row.stranded_suspended_certification_count,
    openDisputeCount: row.open_dispute_count,
    unviewedDisputeCount: row.unviewed_dispute_count,
    oldestDisputeOpenedAt: row.oldest_dispute_opened_at,
  }
}
