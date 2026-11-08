import type { ReactElement } from 'react'
import { useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { TrainingEnrollmentService } from '../../../../application/services/TrainingEnrollmentService'
import type { MyTraining } from '../../../../domain/models/TrainingEnrollment'
import { workerTrainingActions } from '../../../../domain/utilities/trainingEnrollmentLifecycle'
import { Button } from '../../../design/ui'
import { useTrainingInvitation } from '../../../hooks/useTrainingInvitation'
import {
  enrollmentIsNotContractText,
  trainingNoticeAcknowledgementLabel,
  trainingSnapshotNotice,
} from '../../../utilities/trainingNoticeCopy'
import { FreeTrainingNotice } from '../../training/TrainingNotices'
import { TrainingProgramDetailsView } from '../../training/TrainingProgramDetailsView'
import { TrainingSessionList } from '../../training/TrainingSessionList'

interface TrainingInvitationDetailProps {
  readonly trainingEnrollmentService: TrainingEnrollmentService
  readonly myTraining: MyTraining
  readonly isDeclinePending: boolean
  readonly refreshTrainings: () => Promise<void>
  readonly onDeclineRequested: (myTraining: MyTraining) => void
  readonly onAccepted: () => void
}

/**
 * The free-training notice comes first, then the details that will be recorded as the
 * agreed terms. Accept stays disabled until the worker acknowledges the notice.
 */
export function TrainingInvitationDetail({
  trainingEnrollmentService,
  myTraining,
  isDeclinePending,
  refreshTrainings,
  onDeclineRequested,
  onAccepted,
}: TrainingInvitationDetailProps): ReactElement {
  const acknowledgementId = useId()
  const { hasAcknowledgedNotice, setHasAcknowledgedNotice, isAccepting, staleScheduleMessage, acceptInvitation } =
    useTrainingInvitation(trainingEnrollmentService, myTraining, refreshTrainings)
  const { enrollment, program, progress } = myTraining
  const actions = workerTrainingActions(enrollment.status, progress?.progressStatus ?? null, program?.status ?? null)
  const canAccept = actions.includes('accept')
  const scheduledSessions = myTraining.sessions.filter((session) => session.status === 'scheduled')

  return (
    <div className="space-y-5">
      <FreeTrainingNotice>
        {canAccept ? (
          <label htmlFor={acknowledgementId} className="flex items-start gap-2 text-sm text-[var(--color-ink-900)]">
            <input
              id={acknowledgementId}
              type="checkbox"
              className="mt-0.5"
              checked={hasAcknowledgedNotice}
              onChange={(changeEvent): void => {
                setHasAcknowledgedNotice(changeEvent.target.checked)
              }}
            />
            <span>{trainingNoticeAcknowledgementLabel}</span>
          </label>
        ) : null}
      </FreeTrainingNotice>

      {staleScheduleMessage === null ? null : (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-2 text-sm text-[var(--color-warning-600)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {staleScheduleMessage}
        </p>
      )}

      {program === null ? (
        <p className="text-sm text-[var(--color-ink-700)]">
          {enrollment.programTitleSnapshot} at {enrollment.shopNameSnapshot}. The program details are no longer available.
        </p>
      ) : (
        <>
          <TrainingProgramDetailsView content={program} shopName={enrollment.shopNameSnapshot} />
          <section aria-label="Training dates" className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">Training dates</h4>
            <TrainingSessionList sessions={scheduledSessions} accessibleLabel="Training dates list" emptyText="No dates scheduled yet." />
          </section>
        </>
      )}

      <p className="text-xs text-[var(--color-ink-500)]">
        {canAccept ? `${trainingSnapshotNotice} ` : ''}
        {enrollmentIsNotContractText}
      </p>
      {!canAccept && actions.includes('decline') ? (
        <p className="text-xs text-[var(--color-ink-500)]">This invitation can no longer be accepted. You can decline it.</p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {actions.includes('decline') ? (
          <Button variant="secondary" disabled={isAccepting || isDeclinePending} onClick={(): void => { onDeclineRequested(myTraining) }}>
            Decline
          </Button>
        ) : null}
        {canAccept ? (
          <Button
            disabled={!hasAcknowledgedNotice}
            isLoading={isAccepting}
            aria-describedby={hasAcknowledgedNotice ? undefined : `${acknowledgementId}-hint`}
            onClick={(): void => {
              void acceptInvitation().then((didAccept) => {
                if (didAccept) {
                  onAccepted()
                }
              })
            }}
          >
            Accept and enroll
          </Button>
        ) : null}
      </div>
      {canAccept && !hasAcknowledgedNotice ? (
        <p id={`${acknowledgementId}-hint`} className="text-right text-xs text-[var(--color-ink-500)]">
          Read and acknowledge the free training notice to accept.
        </p>
      ) : null}
    </div>
  )
}
