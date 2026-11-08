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
} from '../../domain/models/JobOpeningModeration'
import type { JobOpeningModerationRepository } from '../../domain/repositories/JobOpeningModerationRepository'
import {
  mapAdminModerationCase,
  mapAdminModerationQueuePageRows,
  mapAdminModerationQueueRow,
  mapJobOpeningReportRecordRow,
  mapModerationCaseRecordRow,
  mapMyJobOpeningReportRow,
  mapOwnerJobOpeningModerationRow,
  type SupabaseAdminModerationQueuePageRow,
  type SupabaseAdminModerationQueueRow,
  type SupabaseJobOpeningReportRecordRow,
  type SupabaseModerationCaseRecordRow,
  type SupabaseMyJobOpeningReportRow,
  type SupabaseOwnerJobOpeningModerationRow,
} from '../supabase/supabaseJobOpeningModerationRows'
import { callRpcRows, callRpcSingle } from './supabaseRpcCalls'

/**
 * W14 report and moderation RPCs only (w14d, w14e). None of them edits opening content or an
 * application snapshot; the reporter, owner and administrator are always taken from the JWT.
 */
export class SupabaseJobOpeningModerationRepository implements JobOpeningModerationRepository {
  public async report(input: ReportJobOpeningInput): Promise<JobOpeningReportRecord> {
    const recordRow = await callRpcSingle<SupabaseJobOpeningReportRecordRow>(
      'report_job_opening',
      { p_job_opening_id: input.jobOpeningId, p_category: input.category, p_statement: input.statement },
      'Could not send the report.',
    )
    return mapJobOpeningReportRecordRow(recordRow)
  }

  public async withdrawReport(reportId: string): Promise<JobOpeningReportRecord> {
    const recordRow = await callRpcSingle<SupabaseJobOpeningReportRecordRow>(
      'withdraw_job_opening_report',
      { p_report_id: reportId },
      'Could not withdraw the report.',
    )
    return mapJobOpeningReportRecordRow(recordRow)
  }

  public async listMyReports(): Promise<MyJobOpeningReport[]> {
    const reportRows = await callRpcRows<SupabaseMyJobOpeningReportRow>('my_job_opening_reports', undefined, 'Could not load your reports.')
    return reportRows.map(mapMyJobOpeningReportRow)
  }

  public async listOwnerModeration(): Promise<OwnerJobOpeningModeration[]> {
    const caseRows = await callRpcRows<SupabaseOwnerJobOpeningModerationRow>(
      'owner_job_opening_moderation',
      undefined,
      'Could not load WashLink notices for your job openings.',
    )
    return caseRows.map(mapOwnerJobOpeningModerationRow)
  }

  public async submitChanges(caseId: string, note: string | null): Promise<ModerationCaseRecord> {
    const recordRow = await callRpcSingle<SupabaseModerationCaseRecordRow>(
      'submit_job_opening_changes',
      { p_case_id: caseId, p_note: note },
      'Could not ask WashLink to check the job opening.',
    )
    return mapModerationCaseRecordRow(recordRow)
  }

  public async listAdminQueue(filter: ModerationQueueFilter): Promise<AdminModerationQueueItem[]> {
    const queueRows = await callRpcRows<SupabaseAdminModerationQueueRow>(
      'admin_job_opening_moderation_queue',
      { p_status: filter },
      'Could not load the posting reports.',
    )
    return queueRows.map(mapAdminModerationQueueRow)
  }

  /** Both cursor parts or neither are sent; the database refuses one part alone (22023). */
  public async listAdminQueuePage(
    filter: ModerationQueueFilter,
    cursor: AdminModerationQueueCursor | null,
    pageSize: number,
  ): Promise<AdminModerationQueuePage> {
    const pageRows = await callRpcRows<SupabaseAdminModerationQueuePageRow>(
      'admin_job_opening_moderation_queue_page',
      {
        p_status: filter,
        p_after_opened_at: cursor === null ? null : cursor.afterOpenedAt,
        p_after_id: cursor === null ? null : cursor.afterCaseId,
        p_limit: pageSize,
      },
      'Could not load the posting reports.',
    )
    return mapAdminModerationQueuePageRows(pageRows)
  }

  public async fetchAdminCase(caseId: string): Promise<AdminModerationCase> {
    const caseJson = await callRpcSingle<unknown>('admin_job_opening_moderation_case', { p_case_id: caseId }, 'Could not load this case.')
    return mapAdminModerationCase(caseJson)
  }

  public async moderate(input: ModerateJobOpeningInput): Promise<ModerationCaseRecord> {
    const recordRow = await callRpcSingle<SupabaseModerationCaseRecordRow>(
      'moderate_job_opening',
      {
        p_case_id: input.caseId,
        p_expected_revision: input.expectedRevision,
        p_action: input.action,
        p_reason_kind: input.reasonKind,
        p_owner_message: input.ownerMessage,
        p_admin_note: input.adminNote,
      },
      'Could not record the moderation decision.',
    )
    return mapModerationCaseRecordRow(recordRow)
  }
}
