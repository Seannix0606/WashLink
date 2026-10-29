import type { JobApplicationOpeningSnapshot } from '../../domain/models/JobApplication'
import type { JobOpeningStatus } from '../../domain/models/JobOpening'
import type {
  AdminModerationCase,
  AdminModerationCaseOpening,
  AdminModerationQueueItem,
  JobOpeningReportCategory,
  JobOpeningReportOutcome,
  JobOpeningReportRecord,
  JobOpeningReportStatus,
  ModerationCaseRecord,
  ModerationCaseStatus,
  ModerationHistoryAction,
  MyJobOpeningReport,
  OwnerJobOpeningModeration,
} from '../../domain/models/JobOpeningModeration'
import { jsonReaders } from './supabaseCertificationPlatformReviewRows'
import { mapOpeningSnapshot, type SupabaseJobApplicationSnapshotJson } from './supabaseJobApplicationRow'

const { textOrNull, textOrEmpty, numberOrZero, objectOrEmpty, objectList } = jsonReaders

/** `my_job_opening_reports()` (w14e). */
export interface SupabaseMyJobOpeningReportRow {
  report_id: string
  job_opening_id: string | null
  opening_title_snapshot: string | null
  shop_name_snapshot: string | null
  category: JobOpeningReportCategory
  statement: string
  status: JobOpeningReportStatus
  outcome: JobOpeningReportOutcome | null
  created_at: string
  closed_at: string | null
  can_withdraw: boolean
}

/** `report_job_opening` (created_at) and `withdraw_job_opening_report` (withdrawn_at) (w14d). */
export interface SupabaseJobOpeningReportRecordRow {
  report_id: string
  status: JobOpeningReportStatus
  created_at?: string | null
  withdrawn_at?: string | null
}

/** `owner_job_opening_moderation()` (w14e): never reports, counts, statements or the admin note. */
export interface SupabaseOwnerJobOpeningModerationRow {
  case_id: string
  job_opening_id: string
  status: ModerationCaseStatus
  reason_kind: JobOpeningReportCategory | null
  owner_message: string | null
  owner_change_note: string | null
  status_changed_at: string
  can_submit_changes: boolean
  history: unknown
}

/** `moderate_job_opening` / `submit_job_opening_changes` (w14d). */
export interface SupabaseModerationCaseRecordRow {
  case_id: string
  status: ModerationCaseStatus
  revision: number
  status_changed_at: string
}

/** `admin_job_opening_moderation_queue(p_status)` (w14e). */
export interface SupabaseAdminModerationQueueRow {
  case_id: string
  status: ModerationCaseStatus
  revision: number
  report_count: number
  open_report_count: number
  categories: JobOpeningReportCategory[] | null
  opening_status: JobOpeningStatus | null
  opening_present: boolean
  opening_title_snapshot: string | null
  shop_name_snapshot: string | null
  opened_at: string
  status_changed_at: string
}

function snapshotOrNull(snapshotJson: unknown): JobApplicationOpeningSnapshot | null {
  if (typeof snapshotJson !== 'object' || snapshotJson === null || Array.isArray(snapshotJson)) {
    return null
  }
  return mapOpeningSnapshot(snapshotJson as SupabaseJobApplicationSnapshotJson)
}

export function mapMyJobOpeningReportRow(row: SupabaseMyJobOpeningReportRow): MyJobOpeningReport {
  return {
    reportId: row.report_id,
    jobOpeningId: row.job_opening_id,
    openingTitleSnapshot: row.opening_title_snapshot,
    shopNameSnapshot: row.shop_name_snapshot,
    category: row.category,
    statement: row.statement,
    status: row.status,
    outcome: row.outcome,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    canWithdraw: row.can_withdraw,
  }
}

export function mapJobOpeningReportRecordRow(row: SupabaseJobOpeningReportRecordRow): JobOpeningReportRecord {
  return { reportId: row.report_id, status: row.status, changedAt: row.withdrawn_at ?? row.created_at ?? null }
}

export function mapOwnerJobOpeningModerationRow(row: SupabaseOwnerJobOpeningModerationRow): OwnerJobOpeningModeration {
  return {
    caseId: row.case_id,
    jobOpeningId: row.job_opening_id,
    status: row.status,
    reasonKind: row.reason_kind,
    ownerMessage: row.owner_message,
    ownerChangeNote: row.owner_change_note,
    statusChangedAt: row.status_changed_at,
    canSubmitChanges: row.can_submit_changes,
    history: objectList(row.history).map((item) => ({
      action: textOrEmpty(item.action) as ModerationHistoryAction,
      reasonKind: textOrNull(item.reason_kind) as JobOpeningReportCategory | null,
      ownerMessage: textOrNull(item.owner_message),
      createdAt: textOrEmpty(item.created_at),
    })),
  }
}

export function mapModerationCaseRecordRow(row: SupabaseModerationCaseRecordRow): ModerationCaseRecord {
  return { caseId: row.case_id, status: row.status, revision: row.revision, statusChangedAt: row.status_changed_at }
}

export function mapAdminModerationQueueRow(row: SupabaseAdminModerationQueueRow): AdminModerationQueueItem {
  return {
    caseId: row.case_id,
    status: row.status,
    revision: row.revision,
    reportCount: row.report_count,
    openReportCount: row.open_report_count,
    categories: row.categories ?? [],
    openingStatus: row.opening_status,
    isOpeningPresent: row.opening_present,
    openingTitleSnapshot: row.opening_title_snapshot,
    shopNameSnapshot: row.shop_name_snapshot,
    openedAt: row.opened_at,
    statusChangedAt: row.status_changed_at,
  }
}

function mapCaseOpening(openingJson: unknown): AdminModerationCaseOpening | null {
  if (typeof openingJson !== 'object' || openingJson === null) {
    return null
  }
  const opening = objectOrEmpty(openingJson)
  return {
    content: snapshotOrNull(openingJson),
    status: textOrEmpty(opening.status) as JobOpeningStatus,
    firstPublishedAt: textOrNull(opening.first_published_at),
    statusChangedAt: textOrNull(opening.status_changed_at),
    updatedAt: textOrNull(opening.updated_at),
  }
}

function numberRecord(countsJson: unknown): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [status, count] of Object.entries(objectOrEmpty(countsJson))) {
    counts[status] = numberOrZero(count)
  }
  return counts
}

/** The jsonb of `admin_job_opening_moderation_case(p_case_id)` (w14e). Reporters only as "Reporter n". */
export function mapAdminModerationCase(caseJson: unknown): AdminModerationCase {
  const caseObject = objectOrEmpty(caseJson)
  const moderationCase = objectOrEmpty(caseObject.case)
  const shopJson = caseObject.shop
  const shop = typeof shopJson === 'object' && shopJson !== null ? objectOrEmpty(shopJson) : null
  return {
    moderationCase: {
      caseId: textOrEmpty(moderationCase.id),
      jobOpeningId: textOrNull(moderationCase.job_opening_id),
      status: textOrEmpty(moderationCase.status) as ModerationCaseStatus,
      revision: numberOrZero(moderationCase.revision),
      reasonKind: textOrNull(moderationCase.reason_kind) as JobOpeningReportCategory | null,
      ownerMessage: textOrNull(moderationCase.owner_message),
      adminNote: textOrNull(moderationCase.admin_note),
      ownerChangeNote: textOrNull(moderationCase.owner_change_note),
      openingTitleSnapshot: textOrNull(moderationCase.opening_title_snapshot),
      shopNameSnapshot: textOrNull(moderationCase.shop_name_snapshot),
      openedAt: textOrEmpty(moderationCase.opened_at),
      statusChangedAt: textOrEmpty(moderationCase.status_changed_at),
    },
    opening: mapCaseOpening(caseObject.opening),
    shop:
      shop === null
        ? null
        : {
            name: textOrEmpty(shop.name),
            verificationStatus: textOrEmpty(shop.verification_status),
            isActive: shop.is_active === true,
            hasRecordedVerification: shop.has_recorded_verification === true,
          },
    reports: objectList(caseObject.reports).map((report) => ({
      reporterLabel: textOrEmpty(report.reporter_label),
      category: textOrEmpty(report.category) as JobOpeningReportCategory,
      statement: textOrEmpty(report.statement),
      status: textOrEmpty(report.status) as JobOpeningReportStatus,
      outcome: textOrNull(report.outcome) as JobOpeningReportOutcome | null,
      createdAt: textOrEmpty(report.created_at),
      reportedSnapshot: snapshotOrNull(report.reported_snapshot),
    })),
    actions: objectList(caseObject.actions).map((action) => ({
      action: textOrEmpty(action.action) as ModerationHistoryAction,
      actorRole: textOrNull(action.actor_role),
      reasonKind: textOrNull(action.reason_kind) as JobOpeningReportCategory | null,
      ownerMessage: textOrNull(action.owner_message),
      openingSnapshot: snapshotOrNull(action.opening_snapshot),
      createdAt: textOrEmpty(action.created_at),
    })),
    applicationCounts: numberRecord(caseObject.application_counts),
  }
}
