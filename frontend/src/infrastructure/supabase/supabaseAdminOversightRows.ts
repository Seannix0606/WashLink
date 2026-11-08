import type {
  AdminAccessFlag,
  AdminAuditLogEvent,
  AdminModerationSummary,
  RelationshipLookupKind,
  RelationshipLookupResult,
  ShopRereviewRecord,
  ShopReviewerState,
  UnreviewedApprovedShop,
} from '../../domain/models/AdminOversight'
import { jsonReaders } from './supabaseCertificationPlatformReviewRows'

const { textOrNull, textOrEmpty, numberOrZero, objectOrEmpty, objectList } = jsonReaders

/** `admin_unreviewed_approved_shops()` (w14f). */
export interface SupabaseUnreviewedApprovedShopRow {
  shop_id: string
  shop_name: string
  owner_display_name: string
  is_active: boolean
  reviewer_state: ShopReviewerState
  verification_reviewed_at: string | null
  last_decision_at: string | null
  published_opening_count: number
  current_certification_count: number
  active_contract_count: number
  suspended_relationship_count: number
}

/** `rereview_approved_shop` (w14f). */
export interface SupabaseShopRereviewRecordRow {
  shop_id: string
  verification_status: string
  verification_reviewed_at: string | null
}

/** `admin_workforce_audit_log(...)` (w14h). */
export interface SupabaseAdminAuditLogRow {
  event_id: number | string
  created_at: string
  actor_id: string | null
  actor_role: string | null
  actor_kind: string | null
  action: string
  subject_type: string
  subject_id: string | null
  subject_profile_id: string | null
  payload: unknown
  access_purpose: string | null
  access_note: string | null
}

/** `admin_oversight_access_flags()` (w14h, N6). */
export interface SupabaseAdminAccessFlagRow {
  dispute_id: string
  contract_id: string
  opened_days: number
  case_view_count: number
  distinct_viewer_count: number
  last_viewed_at: string | null
}

/** `admin_moderation_summary()` (w14h). */
export interface SupabaseAdminModerationSummaryRow {
  open_report_case_count: number
  changes_submitted_count: number
  paused_by_washlink_count: number
  oldest_open_case_at: string | null
  unreviewed_approved_shop_count: number
  oversight_flag_count: number
  relationship_lookups_last_30_days: number
}

export function mapUnreviewedApprovedShopRow(row: SupabaseUnreviewedApprovedShopRow): UnreviewedApprovedShop {
  return {
    shopId: row.shop_id,
    shopName: row.shop_name,
    ownerDisplayName: row.owner_display_name,
    isActive: row.is_active,
    reviewerState: row.reviewer_state,
    verificationReviewedAt: row.verification_reviewed_at,
    lastDecisionAt: row.last_decision_at,
    publishedOpeningCount: row.published_opening_count,
    currentCertificationCount: row.current_certification_count,
    activeContractCount: row.active_contract_count,
    suspendedRelationshipCount: row.suspended_relationship_count,
  }
}

export function mapShopRereviewRecordRow(row: SupabaseShopRereviewRecordRow): ShopRereviewRecord {
  return { shopId: row.shop_id, verificationStatus: row.verification_status, verificationReviewedAt: row.verification_reviewed_at }
}

/** The jsonb of `admin_worker_relationships` / `admin_owner_relationships` (w14g). */
export function mapRelationshipLookup(kind: RelationshipLookupKind, lookupJson: unknown): RelationshipLookupResult {
  const lookup = objectOrEmpty(lookupJson)
  if (lookup.found !== true) {
    return { kind, isFound: false }
  }
  return {
    kind,
    isFound: true,
    displayName: textOrEmpty(kind === 'worker' ? lookup.worker_display_name : lookup.owner_display_name),
    distinctQualifyingOwnerCount: kind === 'worker' ? numberOrZero(lookup.distinct_qualifying_owner_count) : null,
    relationships: objectList(lookup.relationships).map((relationship) => ({
      relationshipId: textOrEmpty(relationship.relationship_id),
      counterpartNameSnapshot: textOrNull(kind === 'worker' ? relationship.owner_name_snapshot : relationship.worker_name_snapshot),
      isOwnerPresent: kind === 'worker' ? relationship.owner_present === true : null,
      status: textOrEmpty(relationship.status),
      statusReason: textOrEmpty(relationship.status_reason),
      countsTowardGoal: relationship.counts_toward_goal === true,
      qualifyingContractCount: numberOrZero(relationship.qualifying_contract_count),
      firstAcceptedAt: textOrNull(relationship.first_accepted_at),
      lastActiveAt: textOrNull(relationship.last_active_at),
      endedAt: textOrNull(relationship.ended_at),
    })),
  }
}

export function mapAdminAuditLogRow(row: SupabaseAdminAuditLogRow): AdminAuditLogEvent {
  return {
    eventId: Number(row.event_id),
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    actorKind: row.actor_kind,
    action: row.action,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectProfileId: row.subject_profile_id,
    payload: objectOrEmpty(row.payload),
    accessPurpose: row.access_purpose,
    accessNote: row.access_note,
  }
}

export function mapAdminAccessFlagRow(row: SupabaseAdminAccessFlagRow): AdminAccessFlag {
  return {
    disputeId: row.dispute_id,
    contractId: row.contract_id,
    openedDays: row.opened_days,
    caseViewCount: row.case_view_count,
    distinctViewerCount: row.distinct_viewer_count,
    lastViewedAt: row.last_viewed_at,
  }
}

export function mapAdminModerationSummaryRow(row: SupabaseAdminModerationSummaryRow): AdminModerationSummary {
  return {
    openReportCaseCount: row.open_report_case_count,
    changesSubmittedCount: row.changes_submitted_count,
    pausedByWashLinkCount: row.paused_by_washlink_count,
    oldestOpenCaseAt: row.oldest_open_case_at,
    unreviewedApprovedShopCount: row.unreviewed_approved_shop_count,
    oversightFlagCount: row.oversight_flag_count,
    relationshipLookupsLast30Days: row.relationship_lookups_last_30_days,
  }
}
