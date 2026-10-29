/**
 * W11 role-scoped dashboard counts (P65, D-43). Every number comes from one database summary
 * function scoped to the signed-in user; the client never counts rows itself. No names, texts
 * or other parties' ids are part of a summary.
 */

export const workerProfileMissingFields = ['headline', 'experience_summary', 'skills', 'preferred_locations', 'availability'] as const

export type WorkerProfileMissingField = (typeof workerProfileMissingFields)[number]

/** `my_worker_dashboard_summary()` (w11h). */
export interface WorkerDashboardSummary {
  readonly hasWorkerProfile: boolean
  readonly profileMissingFields: readonly WorkerProfileMissingField[]
  readonly openOpeningCount: number
  readonly draftApplicationCount: number
  readonly activeApplicationCount: number
  readonly acceptedApplicationCount: number
  readonly trainingInvitationCount: number
  readonly trainingInProgressCount: number
  /** Manila calendar date (YYYY-MM-DD) of the next scheduled training day, if any. */
  readonly nextTrainingDate: string | null
  readonly currentCertificationCount: number
  readonly expiringCertificationCount: number
  readonly suspendedOrRevokedCertificationCount: number
  readonly platformReviewAvailableCount: number
  readonly openPlatformReviewCount: number
  readonly contractOfferCount: number
  readonly amendmentOfferCount: number
  readonly acceptedNotStartedCount: number
  readonly activeContractCount: number
  readonly openDisputeCount: number
  readonly disputeResponseNeededCount: number
  readonly countedAsOf: string
}

/** `owner_dashboard_summary()` (w11h): the owner's own shops only. */
export interface OwnerDashboardSummary {
  readonly shopCount: number
  readonly verifiedShopCount: number
  readonly shopsNeedingVerificationCount: number
  readonly publishedOpeningCount: number
  readonly draftOpeningCount: number
  readonly newApplicationCount: number
  readonly inReviewApplicationCount: number
  readonly trainingInvitationPendingCount: number
  readonly traineeInProgressCount: number
  readonly readyToCertifyCount: number
  readonly openShopReviewRequestCount: number
  readonly openPlatformReviewCount: number
  readonly expiringCertificationCount: number
  readonly recordChangedCertificationCount: number
  readonly activeTemplateCount: number
  readonly isNewerStandardTemplateAvailable: boolean
  readonly contractDraftCount: number
  readonly offerAwaitingWorkerCount: number
  readonly amendmentAwaitingWorkerCount: number
  readonly acceptedNotStartedCount: number
  readonly activeContractCount: number
  readonly relationshipNeedsAttentionCount: number
  readonly openDisputeCount: number
  readonly disputeResponseNeededCount: number
}

/** `admin_dashboard_summary()` (w11h): super_admin only. */
export interface AdminDashboardSummary {
  readonly shopsPendingReviewCount: number
  readonly openPlatformReviewCount: number
  readonly oldestPlatformReviewOpenedAt: string | null
  readonly overdueShopReviewRequestCount: number
  readonly strandedSuspendedCertificationCount: number
  readonly openDisputeCount: number
  readonly unviewedDisputeCount: number
  readonly oldestDisputeOpenedAt: string | null
}

export type WorkforceDashboardRole = 'worker' | 'owner' | 'super_admin'

export interface WorkforceDashboardSummaryByRole {
  readonly worker: WorkerDashboardSummary
  readonly owner: OwnerDashboardSummary
  readonly super_admin: AdminDashboardSummary
}
