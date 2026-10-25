import type {
  CertificationReassessmentRecord,
  CertificationReviewDecision,
  CertificationReviewRequestRecord,
  IssuedCertificationRecord,
  RecordCertificationReassessmentInput,
  ShopCertificationPolicy,
  TransitionCertificationInput,
} from '../../domain/models/Certification'
import type { CertificationActionRepository } from '../../domain/repositories/CertificationRepository'
import {
  certificationNoRowMessage,
  hasCompositeKey,
  mapCertificationRecordRow,
  mapReassessmentRecordRow,
  mapReviewRequestRecordRow,
  mapShopCertificationPolicyRow,
  type SupabaseCertificationRecordRow,
  type SupabaseReassessmentRecordRow,
  type SupabaseReviewRequestRecordRow,
  type SupabaseShopCertificationPolicyRow,
} from '../supabase/supabaseCertificationRows'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

/**
 * One write RPC that returns a single composite row. An error is mapped to plain text;
 * an answer without the key column (zero affected rows) is a failure, never success.
 */
async function callWriteRpc<Row>(
  rpcName: string,
  rpcArguments: Record<string, unknown>,
  keyColumn: string,
  fallbackMessage: string,
): Promise<Row> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasCompositeKey(rpcResponse.data, keyColumn)) {
    throw new Error(certificationNoRowMessage)
  }
  return rpcResponse.data as Row
}

type CertificationRow = SupabaseCertificationRecordRow & { id: string }
type ReviewRow = SupabaseReviewRequestRecordRow & { id: string }

/**
 * Certificate writes, RPC only. Nothing here names a worker, owner, approver, status
 * stamp or expiry: the database derives every one of them.
 */
export class SupabaseCertificationActionRepository implements CertificationActionRepository {
  public async issue(enrollmentId: string, expectedAssessmentId: string, attestationVersion: string): Promise<IssuedCertificationRecord> {
    const issuedRow = await callWriteRpc<CertificationRow>(
      'issue_certification',
      { p_enrollment_id: enrollmentId, p_expected_assessment_id: expectedAssessmentId, p_issuer_attestation_version: attestationVersion },
      'id',
      'Could not issue the certification.',
    )
    return mapCertificationRecordRow(issuedRow)
  }

  public async setShopValidity(shopId: string, validityMonths: number): Promise<ShopCertificationPolicy> {
    const policyRow = await callWriteRpc<SupabaseShopCertificationPolicyRow>(
      'set_shop_certification_validity',
      { p_shop_id: shopId, p_validity_months: validityMonths },
      'shop_id',
      'Could not save the certification validity.',
    )
    return mapShopCertificationPolicyRow(policyRow, shopId)
  }

  public async recordReassessment(reassessmentInput: RecordCertificationReassessmentInput): Promise<CertificationReassessmentRecord> {
    const reassessmentRow = await callWriteRpc<SupabaseReassessmentRecordRow & { id: string }>(
      'record_certification_reassessment',
      {
        p_certification_id: reassessmentInput.certificationId,
        p_items_met: [...reassessmentInput.itemsMet],
        p_result: reassessmentInput.result,
        p_assessor_comment: reassessmentInput.assessorComment,
        p_failure_reason: reassessmentInput.result === 'failed' ? reassessmentInput.failureReason : null,
      },
      'id',
      'Could not record the re-assessment.',
    )
    return mapReassessmentRecordRow(reassessmentRow)
  }

  public async renew(certificationId: string, reassessmentId: string, attestationVersion: string): Promise<IssuedCertificationRecord> {
    const renewedRow = await callWriteRpc<CertificationRow>(
      'renew_certification',
      { p_certification_id: certificationId, p_reassessment_id: reassessmentId, p_issuer_attestation_version: attestationVersion },
      'id',
      'Could not renew the certification.',
    )
    return mapCertificationRecordRow(renewedRow)
  }

  public async transition(transitionInput: TransitionCertificationInput): Promise<IssuedCertificationRecord> {
    const changedRow = await callWriteRpc<CertificationRow>(
      'transition_certification',
      {
        p_certification_id: transitionInput.certificationId,
        p_from_status: transitionInput.fromStatus,
        p_to_status: transitionInput.toStatus,
        p_reason: transitionInput.reason,
      },
      'id',
      'Could not change the certification status.',
    )
    return mapCertificationRecordRow(changedRow)
  }

  public async requestReview(certificationId: string, statement: string): Promise<CertificationReviewRequestRecord> {
    const reviewRow = await callWriteRpc<ReviewRow>(
      'request_certification_review',
      { p_certification_id: certificationId, p_statement: statement },
      'id',
      'Could not send the review request.',
    )
    return mapReviewRequestRecordRow(reviewRow)
  }

  public async withdrawReview(requestId: string): Promise<CertificationReviewRequestRecord> {
    const reviewRow = await callWriteRpc<ReviewRow>(
      'withdraw_certification_review',
      { p_request_id: requestId },
      'id',
      'Could not withdraw the review request.',
    )
    return mapReviewRequestRecordRow(reviewRow)
  }

  public async decideReview(
    requestId: string,
    decision: CertificationReviewDecision,
    reason: string,
  ): Promise<CertificationReviewRequestRecord> {
    const reviewRow = await callWriteRpc<ReviewRow>(
      'decide_certification_review',
      { p_request_id: requestId, p_decision: decision, p_reason: reason },
      'id',
      'Could not record the review decision.',
    )
    return mapReviewRequestRecordRow(reviewRow)
  }
}
