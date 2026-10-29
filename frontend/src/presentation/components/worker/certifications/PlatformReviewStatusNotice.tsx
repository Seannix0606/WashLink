import type { ReactElement } from 'react'
import { Scale } from 'lucide-react'
import type { MyCertificationPlatformReview } from '../../../../domain/models/CertificationPlatformReview'
import { Button } from '../../../design/ui'
import { formatCertificationDate } from '../../../utilities/certificationDisplay'
import {
  askWashLinkReviewButtonLabel,
  platformReviewBasisText,
  platformReviewDecisionReasonLabel,
  platformReviewOpenText,
  platformReviewStatusLabel,
  withdrawPlatformReviewButtonLabel,
} from '../../../utilities/platformReviewCopy'

interface PlatformReviewStatusNoticeProps {
  readonly platformReview: MyCertificationPlatformReview
  readonly isActionPending: boolean
  readonly onAskRequested: () => void
  readonly onWithdrawRequested: () => void
}

/**
 * One certificate's WashLink review state for its worker. "Ask WashLink" appears only when the
 * database says the worker may ask (can_open); the decision is labelled "WashLink review", never
 * with the administrator's name.
 */
export function PlatformReviewStatusNotice({
  platformReview,
  isActionPending,
  onAskRequested,
  onWithdrawRequested,
}: PlatformReviewStatusNoticeProps): ReactElement | null {
  const { latestStatus, openReviewId, canOpen, basis } = platformReview
  const isOpen = openReviewId !== null
  const hasDecision = latestStatus === 'reinstated' || latestStatus === 'upheld'

  if (!isOpen && !canOpen && latestStatus === null) {
    return null
  }

  return (
    <div role="note" aria-label="WashLink review" className="space-y-2 rounded-[var(--radius-control)] bg-[var(--color-brand-50)] px-3 py-2 text-xs text-[var(--color-ink-900)]">
      {latestStatus !== null ? (
        <p className="flex items-center gap-1.5 font-medium">
          <Scale className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
          {platformReviewStatusLabel[latestStatus]}
          {hasDecision && platformReview.latestDecidedAt !== null ? ` on ${formatCertificationDate(platformReview.latestDecidedAt)}` : ''}
        </p>
      ) : null}
      {isOpen ? <p>{platformReviewOpenText}</p> : null}
      {hasDecision && platformReview.latestDecisionReason !== null ? (
        <p className="whitespace-pre-line break-words">{`${platformReviewDecisionReasonLabel}: ${platformReview.latestDecisionReason}`}</p>
      ) : null}
      {isOpen ? (
        <Button size="sm" variant="ghost" disabled={isActionPending} onClick={onWithdrawRequested}>
          {withdrawPlatformReviewButtonLabel}
        </Button>
      ) : canOpen ? (
        <div className="space-y-1">
          {basis !== null ? <p>{platformReviewBasisText[basis]}</p> : null}
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Scale className="h-4 w-4" aria-hidden="true" />}
            disabled={isActionPending}
            onClick={onAskRequested}
          >
            {askWashLinkReviewButtonLabel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
