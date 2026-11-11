import type { ReactElement } from 'react'
import { useState } from 'react'
import { Award } from 'lucide-react'
import type { TrainingProgram } from '../../../../domain/models/TrainingProgram'
import type { CertificationDependencies } from '../../../dependencyInjection/createCertificationDependencies'
import { Button, Skeleton } from '../../../design/ui'
import { staleIssueReviewMessage, useCertificationActions } from '../../../hooks/useCertificationActions'
import { useCertifiableEnrollments } from '../../../hooks/useOwnerCertifications'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { IssueCertificationModal } from './IssueCertificationModal'

interface CertifiableTraineesSectionProps {
  readonly certificationDependencies: CertificationDependencies
  readonly program: TrainingProgram
  /** Issuing needs an approved shop verification (J3); otherwise the button is not offered. */
  readonly isShopVerified: boolean
}

/**
 * Trainees the server reports as completed (>= required days and a passed current
 * assessment) and without a certificate. Only those rows get "Issue certification".
 */
export function CertifiableTraineesSection({ certificationDependencies, program, isShopVerified }: CertifiableTraineesSectionProps): ReactElement {
  const { certificationService, certificationReviewService } = certificationDependencies
  const certifiable = useCertifiableEnrollments(certificationService, program.id)
  const actions = useCertificationActions(certificationService, certificationReviewService, certifiable.refresh)
  const [issueEnrollmentId, setIssueEnrollmentId] = useState<string | null>(null)
  const [staleMessage, setStaleMessage] = useState<string | null>(null)
  const issueEnrollment = certifiable.items.find((enrollment) => enrollment.enrollmentId === issueEnrollmentId) ?? null

  return (
    <section aria-label="Ready for certification" className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
        <Award className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Ready for certification
      </h4>
      {certifiable.isLoading ? (
        <div aria-busy="true" aria-label="Loading trainees ready for certification">
          <Skeleton heightClassName="h-12" />
        </div>
      ) : certifiable.errorMessage !== null ? (
        <LoadErrorNotice
          title="Trainees ready for certification could not be loaded"
          errorMessage={certifiable.errorMessage}
          onRetry={(): void => {
            void certifiable.reload()
          }}
        />
      ) : certifiable.isEmpty ? (
        <p className="text-sm text-[var(--color-ink-500)]">
          No trainee is ready. A trainee is ready after the required training days and a passed assessment, and only once per training.
        </p>
      ) : (
        <ul aria-label="Trainees ready for certification" className="space-y-2">
          {certifiable.items.map((enrollment) => (
            <li
              key={enrollment.enrollmentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium break-words text-[var(--color-ink-900)]">{enrollment.workerDisplayName}</p>
                <p className="text-xs text-[var(--color-ink-500)]">
                  {String(enrollment.attendedTrainingDays)} of {String(enrollment.requiredTrainingDays)} days attended, assessment passed
                </p>
              </div>
              {isShopVerified ? (
                <Button
                  size="sm"
                  leadingIcon={<Award className="h-4 w-4" />}
                  disabled={actions.pendingSubjectId === enrollment.enrollmentId}
                  onClick={(): void => {
                    setStaleMessage(null)
                    setIssueEnrollmentId(enrollment.enrollmentId)
                  }}
                >
                  Issue certification
                </Button>
              ) : (
                <p className="text-xs text-[var(--color-ink-500)]">Only a verified shop can issue certifications.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {issueEnrollmentId !== null ? (
        <IssueCertificationModal
          certificationService={certificationService}
          programTitle={program.title}
          enrollment={issueEnrollment}
          isSubmitting={actions.pendingSubjectId === issueEnrollmentId}
          staleMessage={staleMessage}
          onIssue={async (enrollment, hasConfirmedAttestation): Promise<boolean> => {
            const outcome = await actions.issue(enrollment, hasConfirmedAttestation)
            if (outcome === 'done') {
              setIssueEnrollmentId(null)
            } else if (outcome === 'stale') {
              setStaleMessage(staleIssueReviewMessage)
            }
            return outcome === 'done'
          }}
          onClose={(): void => {
            setIssueEnrollmentId(null)
          }}
        />
      ) : null}
    </section>
  )
}
