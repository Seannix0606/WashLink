import type { ReactElement } from 'react'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { OwnerCertification } from '../../../../domain/models/Certification'
import { Button, Modal } from '../../../design/ui'
import { renewalRuleText } from '../../../utilities/certificationCopy'
import { describeExpiryLine } from '../../../utilities/certificationDisplay'
import { IssuerAttestationField } from '../../certifications/IssuerAttestationField'

interface RenewCertificationModalProps {
  readonly certification: OwnerCertification | null
  readonly isSubmitting: boolean
  /** Resolves true when renewed; false (also on a stale record) keeps the dialog open. */
  readonly onConfirm: (certification: OwnerCertification, hasConfirmedAttestation: boolean) => Promise<boolean>
  readonly onClose: () => void
}

function RenewForm({
  certification,
  isSubmitting,
  onConfirm,
  onClose,
}: RenewCertificationModalProps & { readonly certification: OwnerCertification }): ReactElement {
  const [hasConfirmed, setHasConfirmed] = useState<boolean>(false)
  return (
    <div className="space-y-3 text-sm text-[var(--color-ink-700)]">
      <p className="font-medium break-words text-[var(--color-ink-900)]">
        {certification.workerDisplayName}: {certification.certificationTitle}
      </p>
      <p>{renewalRuleText}</p>
      <p>
        Current certificate: {describeExpiryLine(certification.effectiveStatus, certification.expiresAt)}. Latest re-assessment:
        passed on {certification.latestReassessmentAssessedOn ?? 'an unrecorded date'}.
      </p>
      <p>The new certificate starts now and uses your shop's current validity setting.</p>
      <IssuerAttestationField hasConfirmed={hasConfirmed} onConfirmedChange={setHasConfirmed} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          leadingIcon={<RefreshCw className="h-4 w-4" />}
          isLoading={isSubmitting}
          disabled={!hasConfirmed || isSubmitting}
          onClick={(): void => {
            void onConfirm(certification, hasConfirmed).then((didRenew) => {
              if (didRenew) {
                onClose()
              } else {
                setHasConfirmed(false)
              }
            })
          }}
        >
          Renew certificate
        </Button>
      </div>
    </div>
  )
}

/** D-22: renewal after a passed re-assessment issues a new certificate; the old one is marked renewed. */
export function RenewCertificationModal(modalProps: RenewCertificationModalProps): ReactElement {
  return (
    <Modal isOpen={modalProps.certification !== null} onClose={modalProps.onClose} title="Renew this certificate?" maxWidthClassName="max-w-lg">
      {modalProps.certification === null ? null : <RenewForm {...modalProps} certification={modalProps.certification} />}
    </Modal>
  )
}
