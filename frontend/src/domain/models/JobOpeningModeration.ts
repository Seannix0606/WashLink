import type { JobApplicationOpeningSnapshot } from './JobApplication'
import type { JobOpeningStatus } from './JobOpening'

/**
 * W14 job opening reports and WashLink moderation (P72, P73, D-50..D-53). A worker reports an
 * opening; a platform administrator may pause (with a hold) or close it, with a reason kind and a
 * message to the owner. A moderation decision is a platform action on a listing, not a legal
 * finding. Owners never see reports, statements, counts or who reported (D-53).
 */

export const jobOpeningReportCategories = [
  'age_requirement',
  'other_discriminatory_requirement',
  'worker_fee_or_deposit',
  'unpaid_trial_or_training',
  'misleading_terms',
  'other',
] as const

export type JobOpeningReportCategory = (typeof jobOpeningReportCategories)[number]

export type JobOpeningReportStatus = 'open' | 'closed' | 'withdrawn'

export type JobOpeningReportOutcome = 'no_action' | 'opening_paused' | 'opening_closed' | 'pause_lifted_after_changes'

export const moderationCaseStatuses = [
  'open',
  'dismissed',
  'paused_by_washlink',
  'changes_submitted',
  'lifted',
  'closed_by_washlink',
  'resolved_owner_closed',
] as const

export type ModerationCaseStatus = (typeof moderationCaseStatuses)[number]

/** The queue filter: `active` = open + paused_by_washlink + changes_submitted (w14e). */
export type ModerationQueueFilter = 'active' | ModerationCaseStatus

export const moderationQueueFilters: readonly ModerationQueueFilter[] = ['active', ...moderationCaseStatuses]

export const moderationActionKinds = ['dismiss', 'pause', 'close', 'keep_paused', 'lift'] as const

export type ModerationActionKind = (typeof moderationActionKinds)[number]

/** Rows of `job_opening_moderation_actions` (history). */
export type ModerationHistoryAction = 'paused' | 'closed' | 'dismissed' | 'changes_submitted' | 'pause_kept' | 'lifted' | 'owner_closed'

/** Mirrors the W14 CHECKs and RPC rules (w14b, w14d). The database stays the authority. */
export const jobOpeningModerationLimits = {
  statementMinLength: 20,
  statementMaxLength: 1000,
  ownerMessageMinLength: 20,
  ownerMessageMaxLength: 500,
  adminNoteMinLength: 20,
  adminNoteMaxLength: 1000,
  changeNoteMaxLength: 500,
  maximumOpenReportsPerWorker: 10,
  maximumReportsPerOpening: 3,
} as const

/** `my_job_opening_reports()` (w14e): the reporter's own reports and the outcome kind only. */
export interface MyJobOpeningReport {
  readonly reportId: string
  readonly jobOpeningId: string | null
  readonly openingTitleSnapshot: string | null
  readonly shopNameSnapshot: string | null
  readonly category: JobOpeningReportCategory
  readonly statement: string
  readonly status: JobOpeningReportStatus
  readonly outcome: JobOpeningReportOutcome | null
  readonly createdAt: string
  readonly closedAt: string | null
  readonly canWithdraw: boolean
}

/** Row returned by `report_job_opening` / `withdraw_job_opening_report` (w14d). */
export interface JobOpeningReportRecord {
  readonly reportId: string
  readonly status: JobOpeningReportStatus
  readonly changedAt: string | null
}

export interface OwnerModerationHistoryItem {
  readonly action: ModerationHistoryAction
  readonly reasonKind: JobOpeningReportCategory | null
  readonly ownerMessage: string | null
  readonly createdAt: string
}

/**
 * `owner_job_opening_moderation()` (w14e): decided cases of the owner's own openings only. Never
 * a report, a statement, a count, an admin note or who decided.
 */
export interface OwnerJobOpeningModeration {
  readonly caseId: string
  readonly jobOpeningId: string
  readonly status: ModerationCaseStatus
  readonly reasonKind: JobOpeningReportCategory | null
  readonly ownerMessage: string | null
  readonly ownerChangeNote: string | null
  readonly statusChangedAt: string
  readonly canSubmitChanges: boolean
  readonly history: readonly OwnerModerationHistoryItem[]
}

/** Row returned by `moderate_job_opening` / `submit_job_opening_changes` (w14d). */
export interface ModerationCaseRecord {
  readonly caseId: string
  readonly status: ModerationCaseStatus
  readonly revision: number
  readonly statusChangedAt: string
}

/** `admin_job_opening_moderation_queue(p_status)` (w14e). No statements. */
export interface AdminModerationQueueItem {
  readonly caseId: string
  readonly status: ModerationCaseStatus
  readonly revision: number
  readonly reportCount: number
  readonly openReportCount: number
  readonly categories: readonly JobOpeningReportCategory[]
  readonly openingStatus: JobOpeningStatus | null
  readonly isOpeningPresent: boolean
  readonly openingTitleSnapshot: string | null
  readonly shopNameSnapshot: string | null
  readonly openedAt: string
  readonly statusChangedAt: string
}

export interface AdminModerationCaseSummary {
  readonly caseId: string
  readonly jobOpeningId: string | null
  readonly status: ModerationCaseStatus
  readonly revision: number
  readonly reasonKind: JobOpeningReportCategory | null
  readonly ownerMessage: string | null
  readonly adminNote: string | null
  readonly ownerChangeNote: string | null
  readonly openingTitleSnapshot: string | null
  readonly shopNameSnapshot: string | null
  readonly openedAt: string
  readonly statusChangedAt: string
}

/** The current opening: its content as the application snapshot shape plus status stamps. */
export interface AdminModerationCaseOpening {
  readonly content: JobApplicationOpeningSnapshot | null
  readonly status: JobOpeningStatus
  readonly firstPublishedAt: string | null
  readonly statusChangedAt: string | null
  readonly updatedAt: string | null
}

export interface AdminModerationCaseShop {
  readonly name: string
  readonly verificationStatus: string
  readonly isActive: boolean
  readonly hasRecordedVerification: boolean
}

/** Reporters appear only as "Reporter n" (P73). */
export interface AdminModerationCaseReport {
  readonly reporterLabel: string
  readonly category: JobOpeningReportCategory
  readonly statement: string
  readonly status: JobOpeningReportStatus
  readonly outcome: JobOpeningReportOutcome | null
  readonly createdAt: string
  readonly reportedSnapshot: JobApplicationOpeningSnapshot | null
}

export interface AdminModerationCaseAction {
  readonly action: ModerationHistoryAction
  readonly actorRole: string | null
  readonly reasonKind: JobOpeningReportCategory | null
  readonly ownerMessage: string | null
  readonly openingSnapshot: JobApplicationOpeningSnapshot | null
  readonly createdAt: string
}

/** `admin_job_opening_moderation_case(p_case_id)` (w14e). Every read is audited by the database. */
export interface AdminModerationCase {
  readonly moderationCase: AdminModerationCaseSummary
  readonly opening: AdminModerationCaseOpening | null
  readonly shop: AdminModerationCaseShop | null
  readonly reports: readonly AdminModerationCaseReport[]
  readonly actions: readonly AdminModerationCaseAction[]
  readonly applicationCounts: Readonly<Record<string, number>>
}

export interface ReportJobOpeningInput {
  readonly jobOpeningId: string
  readonly category: JobOpeningReportCategory
  readonly statement: string
}

export interface ModerateJobOpeningInput {
  readonly caseId: string
  readonly expectedRevision: number
  readonly action: ModerationActionKind
  readonly reasonKind: JobOpeningReportCategory | null
  readonly ownerMessage: string | null
  readonly adminNote: string | null
}

/** 55000 from `moderate_job_opening` when the case changed since it was read. */
export const staleModerationCaseMessage = 'This case changed. Refresh and try again.'

/** 23514 from `transition_job_opening` while WashLink holds the opening (P75). */
export const heldOpeningResumeRefusedMessage =
  'WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.'

/** Case statuses during which the owner cannot publish the opening again (P75). */
export const heldModerationStatuses: readonly ModerationCaseStatus[] = ['paused_by_washlink', 'changes_submitted']

/**
 * The actions `moderate_job_opening` accepts from each status (section 4 of the W14 plan). Once the
 * opening is gone only `dismiss` remains for an active case (D4). A hint only: the database decides.
 */
export function availableModerationActions(status: ModerationCaseStatus, isOpeningPresent: boolean): readonly ModerationActionKind[] {
  const isActive = status === 'open' || status === 'paused_by_washlink' || status === 'changes_submitted'
  if (!isActive) {
    return []
  }
  if (!isOpeningPresent) {
    return ['dismiss']
  }
  switch (status) {
    case 'open':
      return ['dismiss', 'pause', 'close']
    case 'changes_submitted':
      return ['keep_paused', 'lift', 'close']
    default:
      return ['lift', 'close']
  }
}

/** Actions that need a reason kind and a message to the owner (pause, close, keep the pause). */
export function moderationActionNeedsReason(action: ModerationActionKind): boolean {
  return action === 'pause' || action === 'close' || action === 'keep_paused'
}
