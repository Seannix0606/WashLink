/**
 * W14 super_admin oversight reads (P77, D-54..D-56): approved shops without a recorded review,
 * audited relationship lookups, the audited workforce audit log, the N6 flag on long-open contract
 * disputes and the moderation summary. Every read is checked (and where it touches personal data,
 * audited) by the database.
 */

export const shopReviewerStates = ['reviewer_missing', 'review_time_missing', 'reviewer_not_super_admin'] as const

export type ShopReviewerState = (typeof shopReviewerStates)[number]

/** `admin_unreviewed_approved_shops()` (w14f). */
export interface UnreviewedApprovedShop {
  readonly shopId: string
  readonly shopName: string
  readonly ownerDisplayName: string
  readonly isActive: boolean
  readonly reviewerState: ShopReviewerState
  readonly verificationReviewedAt: string | null
  readonly lastDecisionAt: string | null
  readonly publishedOpeningCount: number
  readonly currentCertificationCount: number
  readonly activeContractCount: number
  readonly suspendedRelationshipCount: number
}

export const shopRereviewDecisions = ['confirm_approval', 'request_changes', 'reject'] as const

export type ShopRereviewDecision = (typeof shopRereviewDecisions)[number]

/** Row returned by `rereview_approved_shop` (w14f). */
export interface ShopRereviewRecord {
  readonly shopId: string
  readonly verificationStatus: string
  readonly verificationReviewedAt: string | null
}

export const relationshipLookupPurposes = [
  'party_support_request',
  'reported_problem_follow_up',
  'moderation_follow_up',
  'policy_monitoring',
  'legal_or_regulatory_request',
] as const

export type RelationshipLookupPurpose = (typeof relationshipLookupPurposes)[number]

export type RelationshipLookupKind = 'worker' | 'owner'

export interface RelationshipLookupRow {
  readonly relationshipId: string
  /** The other party's name as recorded on the relationship (owner name for a worker lookup). */
  readonly counterpartNameSnapshot: string | null
  /** Worker lookups only: whether the owner account still exists. */
  readonly isOwnerPresent: boolean | null
  readonly status: string
  readonly statusReason: string
  readonly countsTowardGoal: boolean
  readonly qualifyingContractCount: number
  readonly firstAcceptedAt: string | null
  readonly lastActiveAt: string | null
  readonly endedAt: string | null
}

/**
 * `admin_worker_relationships` / `admin_owner_relationships` (w14g). An unknown id answers
 * `found: false` (still recorded). The current minimum is not part of the answer (W14 DB D1).
 */
export type RelationshipLookupResult =
  | { readonly kind: RelationshipLookupKind; readonly isFound: false }
  | {
      readonly kind: RelationshipLookupKind
      readonly isFound: true
      readonly displayName: string
      /** Worker lookups only. */
      readonly distinctQualifyingOwnerCount: number | null
      readonly relationships: readonly RelationshipLookupRow[]
    }

export interface RelationshipLookupInput {
  readonly kind: RelationshipLookupKind
  readonly profileId: string
  readonly purpose: RelationshipLookupPurpose
  readonly note: string
}

/** Filters of `admin_workforce_audit_log` (w14h); null means "not filtered". */
export interface AdminAuditLogFilters {
  readonly actionPrefix: string | null
  readonly subjectType: string | null
  readonly subjectId: string | null
  readonly profileId: string | null
  readonly actorId: string | null
  readonly from: string | null
  readonly to: string | null
}

export const emptyAdminAuditLogFilters: AdminAuditLogFilters = {
  actionPrefix: null,
  subjectType: null,
  subjectId: null,
  profileId: null,
  actorId: null,
  from: null,
  to: null,
}

/** A full audit row for the administrator (the read itself is audited). */
export interface AdminAuditLogEvent {
  readonly eventId: number
  readonly createdAt: string
  readonly actorId: string | null
  readonly actorRole: string | null
  readonly actorKind: string | null
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string | null
  readonly subjectProfileId: string | null
  readonly payload: Readonly<Record<string, unknown>>
  readonly accessPurpose: string | null
  readonly accessNote: string | null
}

export interface AdminAuditLogPage {
  readonly events: readonly AdminAuditLogEvent[]
  readonly hasMore: boolean
}

export const adminAuditLogPageSize = 50

/** `admin_oversight_access_flags()` (w14h, N6). */
export interface AdminAccessFlag {
  readonly disputeId: string
  readonly contractId: string
  readonly openedDays: number
  readonly caseViewCount: number
  readonly distinctViewerCount: number
  readonly lastViewedAt: string | null
}

/** The N6 thresholds (`oversight_flag_open_days()`, `oversight_flag_read_count()`). */
export const oversightFlagThresholds = { openDays: 30, readCount: 5 } as const

/** `admin_moderation_summary()` (w14h): one row for a super_admin, none otherwise. */
export interface AdminModerationSummary {
  readonly openReportCaseCount: number
  readonly changesSubmittedCount: number
  readonly pausedByWashLinkCount: number
  readonly oldestOpenCaseAt: string | null
  readonly unreviewedApprovedShopCount: number
  readonly oversightFlagCount: number
  readonly relationshipLookupsLast30Days: number
}

/** Mirrors the W14 CHECKs and RPC rules (w14f, w14g, w14h). */
export const adminOversightLimits = {
  rereviewNotesMinLength: 20,
  rereviewNotesMaxLength: 1000,
  lookupNoteMinLength: 20,
  lookupNoteMaxLength: 300,
  auditFilterMaxLength: 64,
} as const
