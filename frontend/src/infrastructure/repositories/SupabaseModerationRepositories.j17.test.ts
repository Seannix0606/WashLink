import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAdminAuditLogFilters } from '../../domain/models/AdminOversight'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseAdminOversightRepository } from './SupabaseAdminOversightRepository'
import { SupabaseJobOpeningModerationRepository } from './SupabaseJobOpeningModerationRepository'
import { SupabasePlatformContractTemplateRepository } from './SupabasePlatformContractTemplateRepository'
import { SupabaseWorkforceActivityRepository } from './SupabaseWorkforceActivityRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

const openingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const caseId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const reportId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const shopId = '33333333-3333-4333-8333-333333333333'
const profileId = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
const templateId = 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3'
const versionId = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2'
const statement = 'The opening asks applicants to pay a uniform deposit first.'
const message = 'Remove the deposit requirement from the opening, then ask us to check.'
const note = 'The worker asked why one relationship shows as ended.'

describe('W14 repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_w14_repositories_use_rpcs_only', async () => {
    const moderationRepository = new SupabaseJobOpeningModerationRepository()
    const activityRepository = new SupabaseWorkforceActivityRepository()
    const oversightRepository = new SupabaseAdminOversightRepository()
    const platformRepository = new SupabasePlatformContractTemplateRepository()

    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await moderationRepository.listMyReports()).toEqual([])
    expect(await moderationRepository.listOwnerModeration()).toEqual([])
    expect(await moderationRepository.listAdminQueue('active')).toEqual([])
    expect(await activityRepository.listMyActivity(null, 50)).toEqual([])
    // A non-admin gets no summary row: null, never invented zeros.
    expect(await oversightRepository.fetchModerationSummary()).toBeNull()
    expect(await oversightRepository.listUnreviewedApprovedShops()).toEqual([])
    expect(await oversightRepository.searchAuditLog(emptyAdminAuditLogFilters, 99, 50)).toEqual([])
    expect(await oversightRepository.listAccessFlags()).toEqual([])
    expect(await platformRepository.fetchCurrentStandard()).toBeNull()
    expect(await platformRepository.listVersionHistory(templateId)).toEqual([])
    expect(await platformRepository.listVersionClauses(versionId)).toEqual([])

    supabaseDouble.rpcResult = { data: [{ report_id: reportId, status: 'open', created_at: '2026-10-29T02:00:00Z' }], error: null }
    expect(await moderationRepository.report({ jobOpeningId: openingId, category: 'worker_fee_or_deposit', statement })).toEqual({
      reportId,
      status: 'open',
      changedAt: '2026-10-29T02:00:00Z',
    })
    await moderationRepository.withdrawReport(reportId)
    supabaseDouble.rpcResult = { data: [{ case_id: caseId, status: 'changes_submitted', revision: 2, status_changed_at: '2026-10-29T02:00:00Z' }], error: null }
    await moderationRepository.submitChanges(caseId, null)
    await moderationRepository.moderate({ caseId, expectedRevision: 2, action: 'pause', reasonKind: 'worker_fee_or_deposit', ownerMessage: message, adminNote: null })
    supabaseDouble.rpcResult = {
      data: { case: { id: caseId, status: 'open', revision: 1 }, opening: null, shop: null, reports: [{ reporter_label: 'Reporter 1', category: 'other', statement }], actions: [], application_counts: {} },
      error: null,
    }
    const moderationCase = await moderationRepository.fetchAdminCase(caseId)
    expect(moderationCase.moderationCase).toMatchObject({ caseId, status: 'open', revision: 1 })
    expect(moderationCase.reports.at(0)?.reporterLabel).toBe('Reporter 1')
    expect(moderationCase.opening).toBeNull()

    supabaseDouble.rpcResult = { data: [{ shop_id: shopId, verification_status: 'approved', verification_reviewed_at: '2026-10-29T02:00:00Z' }], error: null }
    await oversightRepository.rereviewShop(shopId, 'confirm_approval', null)
    supabaseDouble.rpcResult = { data: { found: false }, error: null }
    expect(await oversightRepository.lookupRelationships({ kind: 'worker', profileId, purpose: 'policy_monitoring', note })).toEqual({ kind: 'worker', isFound: false })
    expect(await oversightRepository.lookupRelationships({ kind: 'owner', profileId, purpose: 'policy_monitoring', note })).toEqual({ kind: 'owner', isFound: false })
    supabaseDouble.rpcResult = { data: { id: versionId, version_number: 4 }, error: null }
    expect(await platformRepository.publish({ expectedVersionNumber: 3, clauses: [] })).toEqual({ versionId, versionNumber: 4 })

    // Never a table read or write, never a role, actor, reporter or administrator id sent by the client.
    expect(recordedArgumentsOf('from')).toEqual([])
    for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
      expect(recordedArgumentsOf(tableWrite)).toEqual([])
    }
    expect(recordedArgumentsOf('rpc')).toEqual([
      ['my_job_opening_reports'],
      ['owner_job_opening_moderation'],
      ['admin_job_opening_moderation_queue', { p_status: 'active' }],
      ['my_workforce_activity', { p_before_id: null, p_limit: 50 }],
      ['admin_moderation_summary'],
      ['admin_unreviewed_approved_shops'],
      [
        'admin_workforce_audit_log',
        { p_action_prefix: null, p_subject_type: null, p_subject_id: null, p_profile_id: null, p_actor_id: null, p_from: null, p_to: null, p_before_id: 99, p_limit: 50 },
      ],
      ['admin_oversight_access_flags'],
      ['platform_contract_template_current'],
      ['contract_template_version_history', { p_template_id: templateId }],
      ['contract_template_version_clauses', { p_version_id: versionId }],
      ['report_job_opening', { p_job_opening_id: openingId, p_category: 'worker_fee_or_deposit', p_statement: statement }],
      ['withdraw_job_opening_report', { p_report_id: reportId }],
      ['submit_job_opening_changes', { p_case_id: caseId, p_note: null }],
      [
        'moderate_job_opening',
        { p_case_id: caseId, p_expected_revision: 2, p_action: 'pause', p_reason_kind: 'worker_fee_or_deposit', p_owner_message: message, p_admin_note: null },
      ],
      ['admin_job_opening_moderation_case', { p_case_id: caseId }],
      ['rereview_approved_shop', { p_shop_id: shopId, p_decision: 'confirm_approval', p_notes: null }],
      ['admin_worker_relationships', { p_worker_id: profileId, p_purpose: 'policy_monitoring', p_note: note }],
      ['admin_owner_relationships', { p_owner_id: profileId, p_purpose: 'policy_monitoring', p_note: note }],
      ['publish_platform_contract_template_version', { p_expected_version_number: 3, p_clauses: [] }],
    ])

    // A refusal is shown as the database's own text; an unknown error as plain text.
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'Only a platform administrator can moderate job openings.' } }
    await expect(moderationRepository.moderate({ caseId, expectedRevision: 2, action: 'close', reasonKind: 'other', ownerMessage: message, adminNote: null })).rejects.toThrow(
      'Only a platform administrator can moderate job openings.',
    )
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'permission denied for table job_opening_reports' } }
    await expect(moderationRepository.listMyReports()).rejects.toThrow('Your account is not allowed to do this.')
  })
})
