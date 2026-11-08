import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  testAssessmentIdentifier,
  testCertificationIdentifier,
  testReassessmentIdentifier,
  testReviewRequestIdentifier,
} from '../../test/certificationFixtures'
import { testShopIdentifier } from '../../test/fixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { testTrainingEnrollmentIdentifier } from '../../test/trainingFixtures'
import { SupabaseCertificationActionRepository } from './SupabaseCertificationActionRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

describe('Certification repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_certification_repository_writes_only_through_rpcs', async () => {
    supabaseDouble.rpcResult = {
      data: { id: testCertificationIdentifier, shop_id: testShopIdentifier, status: 'active', result: 'passed', validity_months: 12 },
      error: null,
    }
    const actionRepository = new SupabaseCertificationActionRepository()
    await actionRepository.issue(testTrainingEnrollmentIdentifier, testAssessmentIdentifier, 'w7_issuer_v1')
    await actionRepository.setShopValidity(testShopIdentifier, 24)
    await actionRepository.recordReassessment({
      certificationId: testCertificationIdentifier, itemsMet: [true, true], result: 'passed', assessorComment: null, failureReason: 'ignored',
    })
    await actionRepository.renew(testCertificationIdentifier, testReassessmentIdentifier, 'w7_issuer_v1')
    await actionRepository.transition({
      certificationId: testCertificationIdentifier, fromStatus: 'active', toStatus: 'suspended', reason: 'Repeated unsafe chemical handling.',
    })
    await actionRepository.requestReview(testCertificationIdentifier, 'I completed the safety refresher last week.')
    await actionRepository.withdrawReview(testReviewRequestIdentifier)
    await actionRepository.decideReview(testReviewRequestIdentifier, 'uphold', 'The handling issue was seen again this week.')

    // No table write at all: the certificate tables are read-only for clients.
    expect(recordedArgumentsOf('from')).toEqual([])
    expect(recordedArgumentsOf('insert')).toEqual([])
    expect(recordedArgumentsOf('update')).toEqual([])
    expect(recordedArgumentsOf('delete')).toEqual([])
    const rpcCalls = recordedArgumentsOf('rpc') as [string, Record<string, unknown>][]
    expect(rpcCalls.map(([rpcName]) => rpcName)).toEqual([
      'issue_certification',
      'set_shop_certification_validity',
      'record_certification_reassessment',
      'renew_certification',
      'transition_certification',
      'request_certification_review',
      'withdraw_certification_review',
      'decide_certification_review',
    ])
    // A pass sends no fail reason; no argument names a worker, owner, approver, stamp or expiry.
    expect(rpcCalls[2]?.[1].p_failure_reason).toBeNull()
    for (const [, rpcArguments] of rpcCalls) {
      for (const argumentName of Object.keys(rpcArguments)) {
        expect(argumentName).not.toMatch(/worker_id|owner_id|approved|issued_at|expires_at|_at$/)
      }
    }
  })

  it('j17_certification_rpc_without_a_row_is_a_failure', async () => {
    supabaseDouble.rpcResult = { data: { id: null }, error: null }
    await expect(
      new SupabaseCertificationActionRepository().withdrawReview(testReviewRequestIdentifier),
    ).rejects.toThrow('This certification changed or is no longer available. Refresh and try again.')
  })
})
