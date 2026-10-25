import type { ReactElement } from 'react'
import { useState } from 'react'
import { certificationReasonSchema } from '../../../../application/validation/certificationSchemas'
import {
  certificationLimits,
  type CertificationReviewDecision,
  type CertificationStatusChange,
  type OwnerCertification,
} from '../../../../domain/models/Certification'
import { statusChangeGuidance } from '../../../utilities/certificationCopy'
import { statusChangeCopy } from '../../../utilities/certificationDisplay'
import { CertificationTextConfirmModal } from '../../certifications/CertificationTextConfirmModal'

const reasonLabel = 'Reason (required, 20 to 500 characters)'

interface CertificationStatusChangeModalProps {
  readonly target: { readonly certification: OwnerCertification; readonly statusChange: CertificationStatusChange } | null
  readonly isSubmitting: boolean
  readonly onConfirm: (certification: OwnerCertification, statusChange: CertificationStatusChange, reason: string) => Promise<boolean>
  readonly onClose: () => void
}

/** Suspend, revoke or reinstate (D-21). A reason is always required; nothing is sent before confirming. */
export function CertificationStatusChangeModal({ target, isSubmitting, onConfirm, onClose }: CertificationStatusChangeModalProps): ReactElement {
  const copy = target === null ? null : statusChangeCopy[target.statusChange]
  return (
    <CertificationTextConfirmModal
      isOpen={target !== null}
      title={copy?.title ?? ''}
      subjectText={target === null ? '' : `${target.certification.workerDisplayName}: ${target.certification.certificationTitle}`}
      message={<p>{copy?.message}</p>}
      textLabel={reasonLabel}
      guidanceText={statusChangeGuidance}
      textSchema={certificationReasonSchema}
      maximumLength={certificationLimits.reasonMaxLength}
      confirmButtonLabel={copy?.confirmButtonLabel ?? 'Confirm'}
      isDestructive={copy?.isDestructive ?? false}
      isSubmitting={isSubmitting}
      onConfirm={async (validReason): Promise<boolean> =>
        target === null ? false : onConfirm(target.certification, target.statusChange, validReason)
      }
      onCancel={onClose}
    />
  )
}

interface CertificationReviewDecisionModalProps {
  readonly certification: OwnerCertification | null
  /** Reinstating needs a verified shop; uphold is always possible. */
  readonly canReinstate: boolean
  readonly isSubmitting: boolean
  readonly onConfirm: (certification: OwnerCertification, decision: CertificationReviewDecision, reason: string) => Promise<boolean>
  readonly onClose: () => void
}

/** The issuing owner's decision on an open review request: reinstate or uphold, with a reason. */
export function CertificationReviewDecisionModal({
  certification,
  canReinstate,
  isSubmitting,
  onConfirm,
  onClose,
}: CertificationReviewDecisionModalProps): ReactElement {
  const [decision, setDecision] = useState<CertificationReviewDecision | null>(null)
  const closeAndReset = (): void => {
    setDecision(null)
    onClose()
  }
  return (
    <CertificationTextConfirmModal
      isOpen={certification !== null}
      title="Decide this review request"
      subjectText={certification === null ? '' : `${certification.workerDisplayName}: ${certification.certificationTitle}`}
      message={
        <p className="whitespace-pre-line break-words">
          Worker statement: {certification?.openReviewStatement ?? 'No statement recorded.'}
        </p>
      }
      textLabel={reasonLabel}
      guidanceText={statusChangeGuidance}
      textSchema={certificationReasonSchema}
      maximumLength={certificationLimits.reasonMaxLength}
      confirmButtonLabel="Record decision"
      isDestructive={false}
      isSubmitting={isSubmitting}
      extraErrorText={decision === null ? 'Choose reinstate or uphold.' : null}
      onConfirm={async (validReason): Promise<boolean> =>
        certification === null || decision === null ? false : onConfirm(certification, decision, validReason)
      }
      onCancel={closeAndReset}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--color-ink-900)]">Decision</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="certification-review-decision"
            className="mt-0.5"
            disabled={!canReinstate}
            checked={decision === 'reinstate'}
            onChange={(): void => {
              setDecision('reinstate')
            }}
          />
          <span>Reinstate: the certificate becomes active again with its original expiry.</span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="certification-review-decision"
            className="mt-0.5"
            checked={decision === 'uphold'}
            onChange={(): void => {
              setDecision('uphold')
            }}
          />
          <span>Uphold: the decision stays. The worker sees your reason.</span>
        </label>
        {!canReinstate ? (
          <p className="text-xs text-[var(--color-ink-500)]">Only a verified shop can reinstate certifications.</p>
        ) : null}
      </fieldset>
    </CertificationTextConfirmModal>
  )
}
