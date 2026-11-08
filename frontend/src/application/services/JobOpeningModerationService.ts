import {
  availableModerationActions,
  moderationActionNeedsReason,
  type AdminModerationCase,
  moderationQueuePageLimits,
  type AdminModerationQueueCursor,
  type AdminModerationQueuePage,
  type JobOpeningReportRecord,
  type ModerationActionKind,
  type ModerationCaseRecord,
  type ModerationQueueFilter,
  type MyJobOpeningReport,
  type OwnerJobOpeningModeration,
} from '../../domain/models/JobOpeningModeration'
import type { JobOpeningModerationRepository } from '../../domain/repositories/JobOpeningModerationRepository'
import {
  adminNoteSchema,
  changeNoteSchema,
  moderationActionSchema,
  moderationReasonSchema,
  ownerMessageSchema,
  parseModerationInput,
  queueCursorSchema,
  queueFilterSchema,
  queuePageSizeSchema,
  reportCategorySchema,
  reportStatementSchema,
} from '../validation/moderationSchemas'

export const reportNotOpenMessage = 'This report is no longer open.'
export const actionNotAvailableMessage = 'This action is not available for this case.'
export const notWaitingForChangesMessage = 'This job opening is not waiting for your changes.'

export interface ModerationDecisionRequest {
  readonly action: string
  readonly reasonKind: string
  readonly ownerMessage: string
  readonly adminNote: string
}

/**
 * W14 job opening reports and WashLink moderation (D-50..D-53). A moderation decision only pauses
 * or closes a listing; it is not a legal finding and never edits the opening or an application.
 * Client checks mirror the database, which decides.
 */
export class JobOpeningModerationService {
  public constructor(private readonly moderationRepository: JobOpeningModerationRepository) {}

  public async listMyReports(): Promise<MyJobOpeningReport[]> {
    return this.moderationRepository.listMyReports()
  }

  public async reportOpening(jobOpeningId: string, category: string, statement: string): Promise<JobOpeningReportRecord> {
    return this.moderationRepository.report({
      jobOpeningId,
      category: parseModerationInput(reportCategorySchema, category),
      statement: parseModerationInput(reportStatementSchema, statement),
    })
  }

  public async withdrawReport(report: MyJobOpeningReport): Promise<JobOpeningReportRecord> {
    if (!report.canWithdraw) {
      throw new Error(reportNotOpenMessage)
    }
    return this.moderationRepository.withdrawReport(report.reportId)
  }

  public async listOwnerModeration(): Promise<OwnerJobOpeningModeration[]> {
    return this.moderationRepository.listOwnerModeration()
  }

  /** The owner asks WashLink to check an edited opening; an empty note is sent as no note. */
  public async submitChanges(moderation: OwnerJobOpeningModeration, note: string): Promise<ModerationCaseRecord> {
    if (moderation.status !== 'paused_by_washlink') {
      throw new Error(notWaitingForChangesMessage)
    }
    const validNote = parseModerationInput(changeNoteSchema, note)
    return this.moderationRepository.submitChanges(moderation.caseId, validNote.length === 0 ? null : validNote)
  }

  /**
   * One keyset page of the moderation queue (W13, D-71), oldest first. The filter, page size and
   * cursor are checked before the request with the database's own messages; the database re-checks.
   */
  public async listAdminQueuePage(
    filter: ModerationQueueFilter,
    cursor: AdminModerationQueueCursor | null,
    pageSize: number = moderationQueuePageLimits.defaultPageSize,
  ): Promise<AdminModerationQueuePage> {
    const validFilter = parseModerationInput(queueFilterSchema, filter)
    const validPageSize = parseModerationInput(queuePageSizeSchema, pageSize)
    parseModerationInput(queueCursorSchema, cursor)
    return this.moderationRepository.listAdminQueuePage(validFilter, cursor, validPageSize)
  }

  /** Each call is a new audited read in the database; callers load it once per opening. */
  public async loadAdminCase(caseId: string): Promise<AdminModerationCase> {
    return this.moderationRepository.fetchAdminCase(caseId)
  }

  /** The actions this case allows now (a hint; the database re-checks). */
  public availableActions(moderationCase: AdminModerationCase): readonly ModerationActionKind[] {
    return availableModerationActions(moderationCase.moderationCase.status, moderationCase.opening !== null)
  }

  /** Sends the revision the administrator read; a newer server revision fails with 55000. */
  public async moderate(moderationCase: AdminModerationCase, request: ModerationDecisionRequest): Promise<ModerationCaseRecord> {
    const action = parseModerationInput(moderationActionSchema, request.action)
    if (!this.availableActions(moderationCase).includes(action)) {
      throw new Error(actionNotAvailableMessage)
    }
    const isReasonNeeded = moderationActionNeedsReason(action)
    const trimmedOwnerMessage = request.ownerMessage.trim()
    const trimmedAdminNote = request.adminNote.trim()
    return this.moderationRepository.moderate({
      caseId: moderationCase.moderationCase.caseId,
      expectedRevision: moderationCase.moderationCase.revision,
      action,
      reasonKind: isReasonNeeded ? parseModerationInput(moderationReasonSchema, request.reasonKind) : null,
      ownerMessage:
        isReasonNeeded || (action === 'lift' && trimmedOwnerMessage.length > 0)
          ? parseModerationInput(ownerMessageSchema, trimmedOwnerMessage)
          : null,
      adminNote:
        action === 'dismiss' || trimmedAdminNote.length > 0 ? parseModerationInput(adminNoteSchema, trimmedAdminNote) : null,
    })
  }
}
