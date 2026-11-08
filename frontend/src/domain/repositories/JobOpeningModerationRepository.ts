import type {
  AdminModerationCase,
  AdminModerationQueueCursor,
  AdminModerationQueueItem,
  AdminModerationQueuePage,
  JobOpeningReportRecord,
  ModerateJobOpeningInput,
  ModerationCaseRecord,
  ModerationQueueFilter,
  MyJobOpeningReport,
  OwnerJobOpeningModeration,
  ReportJobOpeningInput,
} from '../models/JobOpeningModeration'

/**
 * W14 job opening reports and WashLink moderation: RPCs only (w14d, w14e). The four W14 tables
 * are never selected or written by the client; the database checks every role.
 */
export interface JobOpeningModerationRepository {
  report(input: ReportJobOpeningInput): Promise<JobOpeningReportRecord>
  withdrawReport(reportId: string): Promise<JobOpeningReportRecord>
  listMyReports(): Promise<MyJobOpeningReport[]>
  listOwnerModeration(): Promise<OwnerJobOpeningModeration[]>
  submitChanges(caseId: string, note: string | null): Promise<ModerationCaseRecord>
  /** W14 200-row queue (w14e). Kept for compatibility only; the UI pages through `listAdminQueuePage`. */
  listAdminQueue(filter: ModerationQueueFilter): Promise<AdminModerationQueueItem[]>
  /** W13 keyset page (w13c, D-71); `cursor` null = the first page. Not audited (no personal data). */
  listAdminQueuePage(filter: ModerationQueueFilter, cursor: AdminModerationQueueCursor | null, pageSize: number): Promise<AdminModerationQueuePage>
  /** Audited by the database on every call; never polled. */
  fetchAdminCase(caseId: string): Promise<AdminModerationCase>
  moderate(input: ModerateJobOpeningInput): Promise<ModerationCaseRecord>
}
