import type { ReactElement } from 'react'
import { certificationLimits, type MyCertification } from '../../../../domain/models/Certification'
import { reviewStatementSchema } from '../../../../application/validation/certificationSchemas'
import { reviewRequestGuidance, reviewRuleText } from '../../../utilities/certificationCopy'
import { CertificationTextConfirmModal } from '../../certifications/CertificationTextConfirmModal'

interface RequestCertificationReviewModalProps {
  readonly certification: MyCertification | null
  readonly isSubmitting: boolean
  readonly onSubmit: (certification: MyCertification, statement: string) => Promise<boolean>
  readonly onClose: () => void
}

/** D-21: the worker's review request with a statement of 20 to 1000 characters. */
export function RequestCertificationReviewModal({
  certification,
  isSubmitting,
  onSubmit,
  onClose,
}: RequestCertificationReviewModalProps): ReactElement {
  const usedReviews = certification?.reviewRequestsUsed ?? 0
  return (
    <CertificationTextConfirmModal
      isOpen={certification !== null}
      title="Ask for a review"
      subjectText={certification === null ? '' : `${certification.certificationTitle} (${certification.shopName})`}
      message={
        <p>
          {reviewRuleText} Used so far: {String(usedReviews)} of {String(certificationLimits.reviewRequestsMaximum)}.
        </p>
      }
      textLabel="Your statement (required, 20 to 1000 characters)"
      guidanceText={reviewRequestGuidance}
      textSchema={reviewStatementSchema}
      maximumLength={certificationLimits.statementMaxLength}
      confirmButtonLabel="Send review request"
      isDestructive={false}
      isSubmitting={isSubmitting}
      onConfirm={async (validStatement): Promise<boolean> =>
        certification === null ? false : onSubmit(certification, validStatement)
      }
      onCancel={onClose}
    />
  )
}
