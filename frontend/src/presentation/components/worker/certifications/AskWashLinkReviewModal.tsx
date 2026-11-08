import type { ReactElement } from 'react'
import { platformReviewStatementSchema } from '../../../../application/validation/oversightSchemas'
import type { MyCertification } from '../../../../domain/models/Certification'
import { platformReviewLimits, type MyCertificationPlatformReview } from '../../../../domain/models/CertificationPlatformReview'
import {
  askWashLinkReviewExplanation,
  askWashLinkReviewHoldText,
  askWashLinkReviewTitle,
  askWashLinkReviewWithdrawsShopRequestText,
  platformReviewBasisText,
  platformReviewStatementGuidance,
  platformReviewStatementLabel,
  sendPlatformReviewButtonLabel,
} from '../../../utilities/platformReviewCopy'
import { CertificationTextConfirmModal } from '../../certifications/CertificationTextConfirmModal'

interface AskWashLinkReviewModalProps {
  readonly certification: MyCertification | null
  readonly platformReview: MyCertificationPlatformReview | undefined
  readonly isSubmitting: boolean
  /** Resolves true when WashLink was asked; database errors are shown as plain-text toasts. */
  readonly onSubmit: (certification: MyCertification, statement: string) => Promise<boolean>
  readonly onClose: () => void
}

/** D-44: the worker asks WashLink to review the shop's decision, with a statement of 20 to 1000 characters. */
export function AskWashLinkReviewModal({ certification, platformReview, isSubmitting, onSubmit, onClose }: AskWashLinkReviewModalProps): ReactElement {
  const basis = platformReview?.basis ?? null
  return (
    <CertificationTextConfirmModal
      isOpen={certification !== null}
      title={askWashLinkReviewTitle}
      subjectText={certification === null ? '' : `${certification.certificationTitle} (issued by ${certification.shopName})`}
      message={
        <div className="space-y-2">
          {basis !== null ? <p className="font-medium text-[var(--color-ink-900)]">{platformReviewBasisText[basis]}</p> : null}
          <p>{askWashLinkReviewExplanation}</p>
          <p>{askWashLinkReviewHoldText}</p>
          <p className="text-xs">{askWashLinkReviewWithdrawsShopRequestText}</p>
        </div>
      }
      textLabel={platformReviewStatementLabel}
      guidanceText={platformReviewStatementGuidance}
      textSchema={platformReviewStatementSchema}
      maximumLength={platformReviewLimits.statementMaxLength}
      confirmButtonLabel={sendPlatformReviewButtonLabel}
      isDestructive={false}
      isSubmitting={isSubmitting}
      onConfirm={async (validStatement): Promise<boolean> => (certification === null ? false : onSubmit(certification, validStatement))}
      onCancel={onClose}
    />
  )
}
