import type { ReactElement } from 'react'
import { Scale } from 'lucide-react'
import type { OwnerCertificationPlatformReview } from '../../../../domain/models/CertificationPlatformReview'
import { formatCertificationDate } from '../../../utilities/certificationDisplay'
import {
  ownerPlatformReviewOpenText,
  ownerPlatformReviewWorkerStatementLabel,
  platformReviewBasisText,
  platformReviewDecisionReasonLabel,
  platformReviewStatusLabel,
} from '../../../utilities/platformReviewCopy'

interface OwnerPlatformReviewNoticeProps {
  readonly platformReview: OwnerCertificationPlatformReview
}

/** The issuing owner's view of a WashLink review of its decision: status, basis, statement and reason. Never a reviewer name. */
export function OwnerPlatformReviewNotice({ platformReview }: OwnerPlatformReviewNoticeProps): ReactElement {
  const isOpen = platformReview.status === 'open'
  const dateText =
    platformReview.decidedAt === null
      ? `Asked on ${formatCertificationDate(platformReview.openedAt)}`
      : `Decided on ${formatCertificationDate(platformReview.decidedAt)}`
  return (
    <div role="note" aria-label="WashLink review" className="space-y-1 rounded-[var(--radius-control)] bg-[var(--color-brand-50)] px-3 py-2 text-xs text-[var(--color-ink-900)]">
      <p className="flex items-center gap-1.5 font-medium">
        <Scale className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
        {`${platformReviewStatusLabel[platformReview.status]} · ${dateText}`}
      </p>
      <p>{platformReviewBasisText[platformReview.basis]}</p>
      {isOpen ? <p>{ownerPlatformReviewOpenText}</p> : null}
      <p className="whitespace-pre-line break-words">{`${ownerPlatformReviewWorkerStatementLabel}: ${platformReview.workerStatement}`}</p>
      {platformReview.decisionReason !== null ? (
        <p className="whitespace-pre-line break-words">{`${platformReviewDecisionReasonLabel}: ${platformReview.decisionReason}`}</p>
      ) : null}
    </div>
  )
}
