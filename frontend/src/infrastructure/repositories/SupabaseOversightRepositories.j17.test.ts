import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseCertificationPlatformReviewRepository } from './SupabaseCertificationPlatformReviewRepository'
import { SupabaseContractDisputeRepository } from './SupabaseContractDisputeRepository'
import { SupabaseWorkforceDashboardRepository } from './SupabaseWorkforceDashboardRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

const reviewId = '11111111-aaaa-4111-8111-111111111111'
const certificationId = '34343434-3434-4343-8343-343434343434'
const disputeId = '22222222-bbbb-4222-8222-222222222222'
const contractId = 'c9c9c9c9-c9c9-49c9-89c9-c9c9c9c9c9c9'
const versionId = '33333333-cccc-4333-8333-333333333333'
const statement = 'The shop kept its decision but I was not on shift that day.'

describe('W11 repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_w11_repositories_use_rpcs_only', async () => {
    const dashboardRepository = new SupabaseWorkforceDashboardRepository()
    const reviewRepository = new SupabaseCertificationPlatformReviewRepository()
    const disputeRepository = new SupabaseContractDisputeRepository()

    // Summaries: one row for the right role, none otherwise (no invented zeros).
    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await dashboardRepository.fetchWorkerSummary()).toBeNull()
    expect(await dashboardRepository.fetchOwnerSummary()).toBeNull()
    supabaseDouble.rpcResult = {
      data: [{
        shops_pending_review_count: 2, open_platform_review_count: 1, oldest_platform_review_opened_at: '2026-10-20T02:00:00Z',
        overdue_shop_review_request_count: 0, stranded_suspended_certification_count: 1, open_dispute_count: 3, unviewed_dispute_count: 1,
        oldest_dispute_opened_at: null,
      }],
      error: null,
    }
    expect(await dashboardRepository.fetchAdminSummary()).toMatchObject({ shopsPendingReviewCount: 2, strandedSuspendedCertificationCount: 1, openDisputeCount: 3 })

    // Reads and writes of WashLink reviews.
    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await reviewRepository.listMyReviews()).toEqual([])
    expect(await reviewRepository.listOwnerReviews()).toEqual([])
    expect(await reviewRepository.listAdminQueue('open')).toEqual([])
    supabaseDouble.rpcResult = { data: { review: { id: reviewId, status: 'open', revision: 1 }, worker_display_name: 'Test Worker', status_events: [], shop_requests: [] }, error: null }
    expect((await reviewRepository.fetchAdminCase(reviewId)).review).toMatchObject({ reviewId, status: 'open', revision: 1 })
    supabaseDouble.rpcResult = { data: { id: reviewId, status: 'open', revision: 1, worker_statement: statement }, error: null }
    expect(await reviewRepository.openReview(certificationId, 'suspended', statement)).toEqual({ reviewId, status: 'open', revision: 1 })
    expect(await reviewRepository.withdrawReview(reviewId)).toMatchObject({ reviewId })
    expect(await reviewRepository.decideReview(reviewId, 1, 'uphold', 'The shop record supports the decision.')).toMatchObject({ reviewId })

    // Reads and writes of reported contract problems.
    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await disputeRepository.listMyDisputes()).toEqual([])
    expect(await disputeRepository.listAdminQueue('closed')).toEqual([])
    expect(await disputeRepository.fetchAdminVersionDocument(disputeId, versionId)).toBeNull()
    supabaseDouble.rpcResult = { data: { dispute: { id: disputeId, status: 'closed', revision: 2 } }, error: null }
    expect(await disputeRepository.fetchAdminCase(disputeId)).toMatchObject({ contract: null, versions: [], acceptances: [], relationship: null })
    supabaseDouble.rpcResult = { data: { id: disputeId, status: 'open', revision: 1 }, error: null }
    await disputeRepository.raise({ contractId, category: 'contract_terms', statement })
    await disputeRepository.respond(disputeId, statement)
    await disputeRepository.withdraw(disputeId)
    await disputeRepository.close({ disputeId, expectedRevision: 1, resolutionKind: 'no_platform_action', resolutionNote: 'Nothing for WashLink to do here.' })

    // Never a table read or write, never a role, actor or decider sent by the client.
    expect(recordedArgumentsOf('from')).toEqual([])
    for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
      expect(recordedArgumentsOf(tableWrite)).toEqual([])
    }
    expect(recordedArgumentsOf('rpc')).toEqual([
      ['my_worker_dashboard_summary'],
      ['owner_dashboard_summary'],
      ['admin_dashboard_summary'],
      ['my_certification_platform_reviews'],
      ['owner_certification_platform_reviews'],
      ['admin_certification_platform_review_queue', { p_status: 'open' }],
      ['admin_certification_platform_review_case', { p_review_id: reviewId }],
      ['open_certification_platform_review', { p_certification_id: certificationId, p_expected_status: 'suspended', p_statement: statement }],
      ['withdraw_certification_platform_review', { p_review_id: reviewId }],
      ['decide_certification_platform_review', { p_review_id: reviewId, p_expected_revision: 1, p_decision: 'uphold', p_reason: 'The shop record supports the decision.' }],
      ['my_contract_disputes'],
      ['admin_contract_dispute_queue', { p_status: 'closed' }],
      ['admin_contract_dispute_version_document', { p_dispute_id: disputeId, p_version_id: versionId }],
      ['admin_contract_dispute_case', { p_dispute_id: disputeId }],
      ['raise_contract_dispute', { p_contract_id: contractId, p_category: 'contract_terms', p_statement: statement }],
      ['respond_to_contract_dispute', { p_dispute_id: disputeId, p_statement: statement }],
      ['withdraw_contract_dispute', { p_dispute_id: disputeId }],
      ['close_contract_dispute', { p_dispute_id: disputeId, p_expected_revision: 1, p_resolution_kind: 'no_platform_action', p_resolution_note: 'Nothing for WashLink to do here.' }],
    ])

    // A refusal is shown as the database's own text; an unknown error as plain text.
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'Only a platform administrator can decide WashLink reviews.' } }
    await expect(reviewRepository.decideReview(reviewId, 1, 'reinstate', 'The shop record supports the decision.')).rejects.toThrow(
      'Only a platform administrator can decide WashLink reviews.',
    )
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'permission denied for function admin_contract_dispute_queue' } }
    await expect(disputeRepository.listAdminQueue('open')).rejects.toThrow('Your account is not allowed to do this.')
  })
})
