import { useCallback, useState } from 'react'
import type { CertificationReviewService } from '../../application/services/CertificationReviewService'
import type { CertificationService } from '../../application/services/CertificationService'
import {
  staleCertificationMessage,
  staleTrainingRecordMessage,
  type CertifiableEnrollment,
  type CertificationReviewDecision,
  type CertificationStatusChange,
  type MyCertification,
  type OwnerCertification,
  type RecordCertificationReassessmentInput,
} from '../../domain/models/Certification'
import { applicationToast } from '../design/ui'
import { statusChangeCopy } from '../utilities/certificationDisplay'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

/** 'stale' means the record changed on the server; the caller reloads and asks again. */
export type CertificationActionOutcome = 'done' | 'stale' | 'failed'

export const staleIssueReviewMessage =
  'The training record changed since you opened it. Review the updated record, then confirm again.'

export interface UseCertificationActionsResult {
  /** The certificate or enrollment id whose action is running. */
  readonly pendingSubjectId: string | null
  readonly issue: (enrollment: CertifiableEnrollment, hasConfirmedAttestation: boolean) => Promise<CertificationActionOutcome>
  readonly changeStatus: (
    certification: OwnerCertification,
    statusChange: CertificationStatusChange,
    reason: string,
  ) => Promise<CertificationActionOutcome>
  readonly recordReassessment: (reassessmentInput: RecordCertificationReassessmentInput) => Promise<CertificationActionOutcome>
  readonly renew: (certification: OwnerCertification, hasConfirmedAttestation: boolean) => Promise<CertificationActionOutcome>
  readonly decideReview: (
    certification: OwnerCertification,
    decision: CertificationReviewDecision,
    reason: string,
  ) => Promise<CertificationActionOutcome>
  readonly requestReview: (certification: MyCertification, statement: string) => Promise<CertificationActionOutcome>
  readonly withdrawReview: (certification: MyCertification) => Promise<CertificationActionOutcome>
}

/**
 * Certificate actions with plain-text feedback. Every action re-reads afterwards
 * (`refreshAfterAction`); a stale record (55000) is reported as 'stale', not as success.
 */
export function useCertificationActions(
  certificationService: CertificationService,
  certificationReviewService: CertificationReviewService,
  refreshAfterAction: () => Promise<void>,
): UseCertificationActionsResult {
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null)

  const runAction = useCallback(
    async (
      subjectId: string,
      performAction: () => Promise<unknown>,
      successMessage: string,
      fallbackErrorMessage: string,
    ): Promise<CertificationActionOutcome> => {
      setPendingSubjectId(subjectId)
      let outcome: CertificationActionOutcome = 'failed'
      try {
        await performAction()
        applicationToast.success(successMessage)
        outcome = 'done'
      } catch (actionError) {
        const errorMessage = toDisplayErrorMessage(actionError, fallbackErrorMessage)
        const isStale = errorMessage === staleTrainingRecordMessage || errorMessage === staleCertificationMessage
        applicationToast.error(errorMessage === staleTrainingRecordMessage ? staleIssueReviewMessage : errorMessage)
        outcome = isStale ? 'stale' : 'failed'
      }
      await refreshAfterAction()
      setPendingSubjectId(null)
      return outcome
    },
    [refreshAfterAction],
  )

  const issue = useCallback(
    async (enrollment: CertifiableEnrollment, hasConfirmedAttestation: boolean): Promise<CertificationActionOutcome> =>
      runAction(
        enrollment.enrollmentId,
        () => certificationService.issue(enrollment, hasConfirmedAttestation),
        'Certification issued. The worker has been told.',
        'Could not issue the certification.',
      ),
    [certificationService, runAction],
  )

  const changeStatus = useCallback(
    async (certification: OwnerCertification, statusChange: CertificationStatusChange, reason: string): Promise<CertificationActionOutcome> =>
      runAction(
        certification.certificationId,
        () => certificationService.changeStatus(certification, statusChange, reason, new Date()),
        statusChangeCopy[statusChange].successMessage,
        'Could not change the certification status.',
      ),
    [certificationService, runAction],
  )

  const recordReassessment = useCallback(
    async (reassessmentInput: RecordCertificationReassessmentInput): Promise<CertificationActionOutcome> =>
      runAction(
        reassessmentInput.certificationId,
        () => certificationService.recordReassessment(reassessmentInput),
        reassessmentInput.result === 'passed' ? 'Re-assessment recorded: passed. You can renew now.' : 'Re-assessment recorded: not passed.',
        'Could not record the re-assessment.',
      ),
    [certificationService, runAction],
  )

  const renew = useCallback(
    async (certification: OwnerCertification, hasConfirmedAttestation: boolean): Promise<CertificationActionOutcome> =>
      runAction(
        certification.certificationId,
        () => certificationService.renew(certification, hasConfirmedAttestation, new Date()),
        'Certification renewed. A new certificate was issued.',
        'Could not renew the certification.',
      ),
    [certificationService, runAction],
  )

  const decideReview = useCallback(
    async (certification: OwnerCertification, decision: CertificationReviewDecision, reason: string): Promise<CertificationActionOutcome> =>
      runAction(
        certification.certificationId,
        () => certificationReviewService.decideReview(certification, decision, reason),
        decision === 'reinstate' ? 'Review decided: certificate reinstated.' : 'Review decided: decision upheld.',
        'Could not record the review decision.',
      ),
    [certificationReviewService, runAction],
  )

  const requestReview = useCallback(
    async (certification: MyCertification, statement: string): Promise<CertificationActionOutcome> =>
      runAction(
        certification.certificationId,
        () => certificationReviewService.requestReview(certification, statement, new Date()),
        'Review requested. The issuing shop has been told.',
        'Could not send the review request.',
      ),
    [certificationReviewService, runAction],
  )

  const withdrawReview = useCallback(
    async (certification: MyCertification): Promise<CertificationActionOutcome> => {
      setPendingSubjectId(certification.certificationId)
      const withdrawnRequest = await runServiceActionWithToast(() => certificationReviewService.withdrawReview(certification), {
        successMessage: 'Review request withdrawn.',
        fallbackErrorMessage: 'Could not withdraw the review request.',
      })
      await refreshAfterAction()
      setPendingSubjectId(null)
      return withdrawnRequest === null ? 'failed' : 'done'
    },
    [certificationReviewService, refreshAfterAction],
  )

  return { pendingSubjectId, issue, changeStatus, recordReassessment, renew, decideReview, requestReview, withdrawReview }
}
