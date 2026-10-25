import type { ReactElement } from 'react'
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { CertificationService } from '../../../../application/services/CertificationService'
import type { OwnerCertification } from '../../../../domain/models/Certification'
import type { OwnerCertificationAction } from '../../../../domain/utilities/certificationLifecycle'
import { Button } from '../../../design/ui'
import { trainingRecordChangedFlag, trainingRecordChangedOwnerDetail } from '../../../utilities/certificationCopy'
import { describeExpiryLine, formatCertificationDate, statusChangeCopy } from '../../../utilities/certificationDisplay'
import { CertificationHistoryList } from '../../certifications/CertificationHistoryList'
import { CertificationStatusBadge } from '../../certifications/CertificationStatusBadge'
import { ShopIssuedBadge } from '../../certifications/ShopIssuedNotice'

const actionButtonLabels: Readonly<Record<OwnerCertificationAction, string>> = {
  decide_review: 'Decide review',
  suspend: statusChangeCopy.suspend.buttonLabel,
  reinstate: statusChangeCopy.reinstate.buttonLabel,
  revoke: statusChangeCopy.revoke.buttonLabel,
  record_reassessment: 'Record re-assessment',
  renew: 'Renew',
}

interface OwnerCertificationListItemProps {
  readonly certificationService: CertificationService
  readonly certification: OwnerCertification
  readonly availableActions: readonly OwnerCertificationAction[]
  readonly currentInstant: Date
  readonly isActionPending: boolean
  readonly onActionRequested: (certification: OwnerCertification, action: OwnerCertificationAction) => void
}

/** One issued certificate in the owner's list, with only the actions the lifecycle allows. */
export function OwnerCertificationListItem({
  certificationService,
  certification,
  availableActions,
  currentInstant,
  isActionPending,
  onActionRequested,
}: OwnerCertificationListItemProps): ReactElement {
  const [isHistoryShown, setIsHistoryShown] = useState<boolean>(false)

  return (
    <li className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{certification.workerDisplayName}</p>
          <p className="text-xs break-words text-[var(--color-ink-700)]">{certification.certificationTitle}</p>
          <p className="text-xs text-[var(--color-ink-500)]">
            Issued {formatCertificationDate(certification.issuedAt)}. {describeExpiryLine(certification.effectiveStatus, certification.expiresAt)}{' '}
            ({String(certification.validityMonths)} months)
          </p>
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

      {certification.isTrainingRecordChangedAfterIssue ? (
        <div role="note" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-xs text-[var(--color-warning-600)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{trainingRecordChangedFlag}.</span> {trainingRecordChangedOwnerDetail}
          </span>
        </div>
      ) : null}

      {certification.statusReason !== null ? (
        <p className="text-xs whitespace-pre-line break-words text-[var(--color-ink-700)]">Your recorded reason: {certification.statusReason}</p>
      ) : null}

      {certification.openReviewRequestId !== null ? (
        <div className="space-y-0.5 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-900)]">
          <p className="font-medium">
            Review requested
            {certification.openReviewRequestedAt === null ? '' : ` on ${formatCertificationDate(certification.openReviewRequestedAt)}`}
          </p>
          {certification.openReviewStatement !== null ? (
            <p className="whitespace-pre-line break-words">Worker statement: {certification.openReviewStatement}</p>
          ) : null}
        </div>
      ) : null}

      {certification.isRenewalWindowOpen && certification.status === 'active' ? (
        <p className="text-xs text-[var(--color-ink-700)]">
          Renewal window open.{' '}
          {certification.latestReassessmentResult === null
            ? 'No re-assessment recorded yet.'
            : `Latest re-assessment: ${certification.latestReassessmentResult === 'passed' ? 'passed' : 'not passed'}${
                certification.latestReassessmentAssessedOn === null ? '' : ` on ${certification.latestReassessmentAssessedOn}`
              }${certification.isLatestReassessmentUsed ? ' (already used)' : ''}.`}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {availableActions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={action === 'revoke' || action === 'suspend' ? 'ghost' : 'secondary'}
            disabled={isActionPending}
            onClick={(): void => {
              onActionRequested(certification, action)
            }}
          >
            {actionButtonLabels[action]}
          </Button>
        ))}
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
      </div>
      {isHistoryShown ? (
        <CertificationHistoryList certificationService={certificationService} certificationId={certification.certificationId} />
      ) : null}
    </li>
  )
}
