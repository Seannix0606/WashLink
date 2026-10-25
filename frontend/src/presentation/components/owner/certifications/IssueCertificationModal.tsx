import type { ReactElement } from 'react'
import { useState } from 'react'
import { Award, Check, X } from 'lucide-react'
import type { CertificationService } from '../../../../application/services/CertificationService'
import type { CertifiableEnrollment } from '../../../../domain/models/Certification'
import { Button, Modal, Skeleton } from '../../../design/ui'
import { useIssueEvidence } from '../../../hooks/useCertificationSupportData'
import { shopIssuedDisclaimer } from '../../../utilities/certificationCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { IssuerAttestationField } from '../../certifications/IssuerAttestationField'

interface IssueCertificationModalProps {
  readonly certificationService: CertificationService
  readonly programTitle: string
  /** The current server row; null once the trainee is no longer certifiable. */
  readonly enrollment: CertifiableEnrollment | null
  readonly isSubmitting: boolean
  /** Shown after a 55000: the record changed and was reloaded. */
  readonly staleMessage: string | null
  /** Resolves true when issued. */
  readonly onIssue: (enrollment: CertifiableEnrollment, hasConfirmedAttestation: boolean) => Promise<boolean>
  readonly onClose: () => void
}

function IssueForm({
  certificationService,
  programTitle,
  enrollment,
  isSubmitting,
  staleMessage,
  onIssue,
  onClose,
}: IssueCertificationModalProps & { readonly enrollment: CertifiableEnrollment }): ReactElement {
  const { currentAssessment, isLoadingEvidence, evidenceErrorMessage, reloadEvidence } = useIssueEvidence(
    certificationService,
    enrollment.enrollmentId,
    enrollment.currentAssessmentId,
  )
  const [hasConfirmed, setHasConfirmed] = useState<boolean>(false)

  return (
    <div className="space-y-4 text-sm text-[var(--color-ink-700)]">
      <div>
        <p className="font-semibold break-words text-[var(--color-ink-900)]">{enrollment.workerDisplayName}</p>
        <p className="break-words">{programTitle}</p>
      </div>
      {staleMessage !== null ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-[var(--color-warning-600)]">
          {staleMessage}
        </p>
      ) : null}
      <section aria-label="Training record summary" className="space-y-2">
        <p>
          {String(enrollment.attendedTrainingDays)} of {String(enrollment.requiredTrainingDays)} required training days attended
        </p>
        {isLoadingEvidence ? (
          <div aria-busy="true" aria-label="Loading the assessment">
            <Skeleton heightClassName="h-16" />
          </div>
        ) : evidenceErrorMessage !== null || currentAssessment === null ? (
          <LoadErrorNotice
            title="The assessment could not be loaded"
            errorMessage={evidenceErrorMessage ?? 'The current assessment was not found. Reload and try again.'}
            onRetry={(): void => {
              void reloadEvidence()
            }}
          />
        ) : (
          <div className="space-y-1">
            <p>
              Assessment: {currentAssessment.result === 'passed' ? 'Passed' : 'Not passed'}, by {currentAssessment.recordedByDisplayName} (
              {currentAssessment.recorderRole === 'trainer' ? 'trainer' : 'shop owner'}), {enrollment.assessedOn ?? 'date not recorded'}
            </p>
            <ul aria-label="Assessment checklist" className="space-y-0.5">
              {currentAssessment.checklistSnapshot.map((checklistItem, itemIndex) => (
                <li key={`${String(itemIndex)}-${checklistItem}`} className="flex items-start gap-1.5 break-words">
                  {currentAssessment.itemsMet.at(itemIndex) === true ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success-600)]" aria-label="Met" />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger-600)]" aria-label="Not met" />
                  )}
                  {checklistItem}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>Validity that applies: {String(enrollment.validityMonths)} months from the moment you issue it.</p>
        <p className="text-xs text-[var(--color-ink-500)]">{shopIssuedDisclaimer}</p>
      </section>
      <IssuerAttestationField hasConfirmed={hasConfirmed} onConfirmedChange={setHasConfirmed} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          leadingIcon={<Award className="h-4 w-4" />}
          isLoading={isSubmitting}
          disabled={!hasConfirmed || currentAssessment === null || isSubmitting}
          onClick={(): void => {
            void onIssue(enrollment, hasConfirmed).then((didIssue) => {
              if (!didIssue) {
                setHasConfirmed(false)
              }
            })
          }}
        >
          Issue certification
        </Button>
      </div>
    </div>
  )
}

/** Issue from a completed enrollment with the w7_issuer_v1 confirmation and the reviewed assessment id. */
export function IssueCertificationModal(modalProps: IssueCertificationModalProps): ReactElement {
  const { enrollment } = modalProps
  return (
    <Modal isOpen onClose={modalProps.onClose} title="Issue a shop certification" maxWidthClassName="max-w-lg">
      {enrollment === null ? (
        <div className="space-y-3 text-sm text-[var(--color-ink-700)]">
          <p role="alert">The training record changed and this trainee can no longer be certified from it.</p>
          <Button variant="secondary" onClick={modalProps.onClose}>
            Close
          </Button>
        </div>
      ) : (
        <IssueForm key={enrollment.currentAssessmentId} {...modalProps} enrollment={enrollment} />
      )}
    </Modal>
  )
}
