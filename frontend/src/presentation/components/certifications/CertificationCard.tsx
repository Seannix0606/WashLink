import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import type { CertificationService } from '../../../application/services/CertificationService'
import { certificationLimits, type MyCertification } from '../../../domain/models/Certification'
import { canRequestCertificationReview } from '../../../domain/utilities/certificationLifecycle'
import { Button } from '../../design/ui'
import {
  describeIssuedByLine,
  issuingShopNoLongerVerifiedText,
  issuingShopRemovedText,
  reviewRuleText,
  trainingRecordChangedFlag,
  trainingRecordChangedWorkerDetail,
  workerExpiredCertificateNoticeText,
  workerRenewalGuidanceText,
} from '../../utilities/certificationCopy'
import {
  describeExpiryLine,
  describeShopVerificationAtIssue,
  formatCertificationDate,
} from '../../utilities/certificationDisplay'
import { CertificationHistoryList } from './CertificationHistoryList'
import { CertificationStatusBadge } from './CertificationStatusBadge'
import { ShopIssuedBadge } from './ShopIssuedNotice'

interface CertificationCardProps {
  readonly certificationService: CertificationService
  readonly certification: MyCertification
  readonly currentInstant: Date
  readonly isActionPending: boolean
  readonly onReviewRequested: (certification: MyCertification) => void
  readonly onWithdrawReviewRequested: (certification: MyCertification) => void
  /** W11: the WashLink review notice for this certificate (shown under the shop review controls). */
  readonly platformReviewSlot?: ReactNode
  /** W11 hold: while WashLink reviews the certificate, no new shop review request can be sent. */
  readonly isShopReviewOnHold?: boolean
}

function describeReviewUnavailable(certification: MyCertification): string {
  return certification.reviewRequestsUsed >= certificationLimits.reviewRequestsMaximum
    ? 'This certificate has been reviewed the maximum of 3 times.'
    : 'The 30-day review period for this decision has ended.'
}

/** The worker's view of one certificate. Workers never see status-change controls. */
export function CertificationCard({
  certificationService,
  certification,
  currentInstant,
  isActionPending,
  onReviewRequested,
  onWithdrawReviewRequested,
  platformReviewSlot,
  isShopReviewOnHold = false,
}: CertificationCardProps): ReactElement {
  const [isHistoryShown, setIsHistoryShown] = useState<boolean>(false)
  const isSuspendedOrRevoked = certification.status === 'suspended' || certification.status === 'revoked'
  const canRequestReview = !isShopReviewOnHold && canRequestCertificationReview(certification, currentInstant)

  return (
    <li className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{certification.certificationTitle}</p>
          <p className="text-xs break-words text-[var(--color-ink-700)]">{describeIssuedByLine(certification.shopName)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ShopIssuedBadge />
          <CertificationStatusBadge
            effectiveStatus={certification.effectiveStatus}
            expiresAt={certification.expiresAt}
            currentInstant={currentInstant}
          />
        </div>
      </div>

      <dl className="grid gap-1 text-xs text-[var(--color-ink-700)] sm:grid-cols-2">
        <div>
          <dt className="inline font-medium">Issued: </dt>
          <dd className="inline">{formatCertificationDate(certification.issuedAt)}</dd>
        </div>
        <div>
          <dt className="sr-only">Expiry</dt>
          <dd>
            {describeExpiryLine(certification.effectiveStatus, certification.expiresAt)} ({String(certification.validityMonths)} months)
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Approved by: </dt>
          <dd className="inline break-words">{certification.approverDisplayName}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Assessed by: </dt>
          <dd className="inline break-words">
            {certification.assessorDisplayName} ({certification.assessorRole === 'trainer' ? 'trainer' : 'shop owner'})
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="sr-only">Training days</dt>
          <dd>
            {String(certification.attendedTrainingDays)} of {String(certification.requiredTrainingDays)} required training days attended
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="sr-only">Shop verification</dt>
          <dd>{describeShopVerificationAtIssue(certification.shopVerificationStatusAtIssue, certification.shopVerifiedAtAtIssue)}</dd>
        </div>
      </dl>

      {certification.effectiveStatus === 'active' || certification.effectiveStatus === 'expired' ? (
        <div className="space-y-0.5 text-xs text-[var(--color-ink-500)]">
          <p>{workerRenewalGuidanceText}</p>
          {certification.effectiveStatus === 'expired' ? (
            <p className="font-medium text-[var(--color-warning-600)]">{workerExpiredCertificateNoticeText}</p>
          ) : null}
        </div>
      ) : null}

      {!certification.isIssuingShopPresent ? (
        <p className="text-xs text-[var(--color-ink-500)]">{issuingShopRemovedText}</p>
      ) : certification.isIssuingShopCurrentlyVerified === false ? (
        <p className="text-xs text-[var(--color-ink-500)]">{issuingShopNoLongerVerifiedText}</p>
      ) : null}

      {isSuspendedOrRevoked && certification.statusReason !== null ? (
        <div role="note" className="space-y-0.5 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-xs text-[var(--color-ink-900)]">
          <p className="font-medium">
            {certification.status === 'suspended' ? 'Suspended' : 'Revoked'} by the shop
            {certification.statusChangedAt === null ? '' : ` on ${formatCertificationDate(certification.statusChangedAt)}`}
          </p>
          <p className="whitespace-pre-line break-words">Reason: {certification.statusReason}</p>
        </div>
      ) : null}

      {certification.isTrainingRecordChangedAfterIssue ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-warning-600)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {trainingRecordChangedFlag}. {trainingRecordChangedWorkerDetail}
        </p>
      ) : null}

      {certification.openReviewRequestId !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-ink-700)]">
          <p>Review requested. The issuing shop has not decided yet.</p>
          <Button
            size="sm"
            variant="ghost"
            disabled={isActionPending}
            onClick={(): void => {
              onWithdrawReviewRequested(certification)
            }}
          >
            Withdraw review request
          </Button>
        </div>
      ) : canRequestReview ? (
        <div className="space-y-1">
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<MessageSquare className="h-4 w-4" />}
            disabled={isActionPending}
            onClick={(): void => {
              onReviewRequested(certification)
            }}
          >
            Ask for a review
          </Button>
          <p className="text-xs text-[var(--color-ink-500)]">
            {reviewRuleText}
            {certification.reviewWindowEndsAt === null ? '' : ` Open until ${formatCertificationDate(certification.reviewWindowEndsAt)}.`}
          </p>
        </div>
      ) : isSuspendedOrRevoked && !isShopReviewOnHold ? (
        <p className="text-xs text-[var(--color-ink-500)]">{describeReviewUnavailable(certification)}</p>
      ) : null}

      {platformReviewSlot}

      <Button
        size="sm"
        variant="ghost"
        aria-expanded={isHistoryShown}
        leadingIcon={isHistoryShown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        onClick={(): void => {
          setIsHistoryShown(!isHistoryShown)
        }}
      >
        {isHistoryShown ? 'Hide history' : 'Show history'}
      </Button>
      {isHistoryShown ? (
        <CertificationHistoryList certificationService={certificationService} certificationId={certification.certificationId} />
      ) : null}
    </li>
  )
}
