import type {
  AdminModerationCase,
  AdminModerationQueueItem,
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
  listAdminQueue(filter: ModerationQueueFilter): Promise<AdminModerationQueueItem[]>
  /** Audited by the database on every call; never polled. */
  fetchAdminCase(caseId: string): Promise<AdminModerationCase>
  moderate(input: ModerateJobOpeningInput): Promise<ModerationCaseRecord>
}
