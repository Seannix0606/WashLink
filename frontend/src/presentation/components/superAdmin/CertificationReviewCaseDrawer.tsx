import type { ReactElement } from 'react'
import type { CertificationPlatformReviewService } from '../../../application/services/CertificationPlatformReviewService'
import type { AdminPlatformReviewCase } from '../../../domain/models/CertificationPlatformReview'
import { Badge, Drawer, Skeleton } from '../../design/ui'
import { useAdminCertificationReviewCase } from '../../hooks/useAdminCertificationReviewCase'
import { describeShopVerificationAtIssue, formatCertificationDate } from '../../utilities/certificationDisplay'
import {
  adminCaseAuditedText,
  platformReviewBasisText,
  platformReviewDecisionReasonLabel,
  platformReviewStatusLabel,
  washLinkReviewLabel,
} from '../../utilities/platformReviewCopy'
import { ShopIssuedBadge } from '../certifications/ShopIssuedNotice'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { DecidePlatformReviewForm } from './DecidePlatformReviewForm'

const sectionHeadingClassName = 'text-xs font-semibold tracking-wide text-[var(--color-ink-500)] uppercase'

function yesNo(isTrue: boolean): string {
  return isTrue ? 'yes' : 'no'
}

function CaseDetails({ reviewCase }: { readonly reviewCase: AdminPlatformReviewCase }): ReactElement {
  const { review, certification } = reviewCase
  return (
    <div className="space-y-4 text-xs text-[var(--color-ink-700)]">
      <section className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={review.status === 'open' ? 'warning' : 'neutral'}>{platformReviewStatusLabel[review.status]}</Badge>
          <ShopIssuedBadge />
        </div>
        <p>{platformReviewBasisText[review.basis]}</p>
        <p>{`Asked on ${formatCertificationDate(review.openedAt)} by ${reviewCase.workerDisplayName}`}</p>
        <p className="whitespace-pre-line break-words text-[var(--color-ink-900)]">{`Worker statement: ${review.workerStatement}`}</p>
        {review.decisionReason !== null ? (
          <p className="whitespace-pre-line break-words">{`${platformReviewDecisionReasonLabel}: ${review.decisionReason}`}</p>
        ) : null}
      </section>
      <section className="space-y-1">
        <h3 className={sectionHeadingClassName}>Certificate (issued by the shop)</h3>
        <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{certification.certificationTitle}</p>
        <p className="break-words">{`Shop at issue: ${certification.shopNameSnapshot ?? 'not recorded'}`}</p>
        <p>{`Issued ${formatCertificationDate(certification.issuedAt)} · Expires ${formatCertificationDate(certification.expiresAt)} · Status ${certification.effectiveStatus}`}</p>
        {certification.statusReason !== null ? <p className="whitespace-pre-line break-words">{`Shop reason: ${certification.statusReason}`}</p> : null}
        <p>{`${String(certification.attendedTrainingDays)} of ${String(certification.requiredTrainingDays)} required training days attended`}</p>
        {certification.shopVerificationStatusAtIssue !== null ? (
          <p>{describeShopVerificationAtIssue(certification.shopVerificationStatusAtIssue, certification.shopVerifiedAtAtIssue)}</p>
        ) : null}
        <p>
          {`Issuing shop present: ${yesNo(certification.isIssuingShopPresent)} · same owner: ${yesNo(certification.isIssuingOwnerCurrent)} · verified now: ${yesNo(certification.isIssuingShopCurrentlyVerified)}`}
        </p>
        {certification.isTrainingRecordChangedAfterIssue ? <p className="text-[var(--color-warning-600)]">Training record changed after issue.</p> : null}
      </section>
      <section className="space-y-1">
        <h3 className={sectionHeadingClassName}>Status history</h3>
        <ol aria-label="Status history" className="space-y-1">
          {reviewCase.statusEvents.map((statusEvent, eventIndex) => (
            <li key={`${statusEvent.createdAt}-${String(eventIndex)}`} className="break-words">
              {`${formatCertificationDate(statusEvent.createdAt)}: ${statusEvent.event}`}
              {statusEvent.actorDisplayName === null ? '' : ` (${statusEvent.actorDisplayName})`}
              {statusEvent.reason === null ? '' : ` - ${statusEvent.reason}`}
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-1">
        <h3 className={sectionHeadingClassName}>Review requests to the shop</h3>
        {reviewCase.shopRequests.length === 0 ? (
          <p>None.</p>
        ) : (
          <ol aria-label="Review requests to the shop" className="space-y-2">
            {reviewCase.shopRequests.map((shopRequest, requestIndex) => (
              <li key={`${shopRequest.requestedAt}-${String(requestIndex)}`} className="space-y-0.5 break-words">
                <p>{`${formatCertificationDate(shopRequest.requestedAt)} · ${shopRequest.status}`}</p>
                <p className="whitespace-pre-line">{shopRequest.workerStatement}</p>
                {shopRequest.decisionReason !== null ? <p className="whitespace-pre-line">{`Shop reason: ${shopRequest.decisionReason}`}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

interface CaseBodyProps {
  readonly platformReviewService: CertificationPlatformReviewService
  readonly reviewId: string
  readonly onDecided: () => Promise<void>
}

function CaseBody({ platformReviewService, reviewId, onDecided }: CaseBodyProps): ReactElement {
  const caseState = useAdminCertificationReviewCase(platformReviewService, reviewId, onDecided)
  if (caseState.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading this review" className="space-y-2">
        <Skeleton heightClassName="h-24" />
        <Skeleton heightClassName="h-24" />
      </div>
    )
  }
  if (caseState.errorMessage !== null || caseState.reviewCase === null) {
    return (
      <LoadErrorNotice
        title="This review could not be loaded"
        errorMessage={caseState.errorMessage ?? 'Could not load this review.'}
        onRetry={(): void => {
          void caseState.reload()
        }}
      />
    )
  }
  return (
    <div className="space-y-5">
      <p className="text-[11px] text-[var(--color-ink-500)]">{adminCaseAuditedText}</p>
      <CaseDetails reviewCase={caseState.reviewCase} />
      {caseState.reviewCase.review.status === 'open' ? (
        <DecidePlatformReviewForm isSubmitting={caseState.isDeciding} onDecide={caseState.decide} />
      ) : null}
    </div>
  )
}

interface CertificationReviewCaseDrawerProps {
  readonly platformReviewService: CertificationPlatformReviewService
  /** The review to show; the case is read (and audited) only while the drawer is open. */
  readonly reviewId: string | null
  readonly onClose: () => void
  readonly onDecided: () => Promise<void>
}

/** Super_admin: one WashLink review case with the decision form while it is open. */
export function CertificationReviewCaseDrawer({ platformReviewService, reviewId, onClose, onDecided }: CertificationReviewCaseDrawerProps): ReactElement {
  return (
    <Drawer isOpen={reviewId !== null} onClose={onClose} title={washLinkReviewLabel} description="Certification review case">
      {reviewId !== null ? <CaseBody key={reviewId} platformReviewService={platformReviewService} reviewId={reviewId} onDecided={onDecided} /> : null}
    </Drawer>
  )
}
