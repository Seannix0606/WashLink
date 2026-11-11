import type { ReactElement } from 'react'
import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import type { MyTraining } from '../../../../domain/models/TrainingEnrollment'
import { workerTrainingActions } from '../../../../domain/utilities/trainingEnrollmentLifecycle'
import type { TrainingDependencies } from '../../../dependencyInjection/createTrainingDependencies'
import { Button, Card, EmptyState, Modal, Skeleton } from '../../../design/ui'
import { useMyTrainings } from '../../../hooks/useMyTrainings'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { leaveTrainingConfirmationText } from '../../../utilities/trainingNoticeCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { TrainingVersusPaidWorkNote } from '../../training/TrainingNotices'
import { TrainingProgressSummary } from '../../training/TrainingProgressSummary'
import { MyTrainingProgress } from './MyTrainingProgress'
import { TrainingInvitationDetail } from './TrainingInvitationDetail'

interface MyTrainingsPanelProps {
  readonly trainingDependencies: TrainingDependencies
}

interface PendingWorkerAction {
  readonly kind: 'decline' | 'leave'
  readonly myTraining: MyTraining
}

/** The worker's training: invitations first, then live and ended training. */
export function MyTrainingsPanel({ trainingDependencies }: MyTrainingsPanelProps): ReactElement {
  const trainingsState = useMyTrainings(trainingDependencies.trainingEnrollmentService)
  const { myTrainings, pendingEnrollmentId } = trainingsState
  const [openEnrollmentId, setOpenEnrollmentId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingWorkerAction | null>(null)
  const openTraining = myTrainings.find((myTraining) => myTraining.enrollment.id === openEnrollmentId) ?? null

  const confirmPendingAction = async (): Promise<void> => {
    if (pendingAction === null) {
      return
    }
    const didSucceed =
      pendingAction.kind === 'decline'
        ? await trainingsState.declineInvitation(pendingAction.myTraining)
        : await trainingsState.leaveTraining(pendingAction.myTraining)
    setPendingAction(null)
    if (didSucceed) {
      setOpenEnrollmentId(null)
    }
  }

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <GraduationCap className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          My training
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">Required initial training from shops that accepted your application. WashLink rule: it is free for you.</p>
      </header>
      <TrainingVersusPaidWorkNote />

      {trainingsState.isLoadingTrainings ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your training">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : trainingsState.trainingsErrorMessage !== null ? (
        <LoadErrorNotice title="Your training could not be loaded" errorMessage={trainingsState.trainingsErrorMessage}
          onRetry={(): void => { void trainingsState.reloadTrainings() }} />
      ) : trainingsState.isTrainingListEmpty ? (
        <EmptyState icon={<GraduationCap className="h-5 w-5" />} title="Not enrolled"
          description="When a shop that accepted your application invites you to training, the invitation appears here." />
      ) : (
        <ul aria-label="My training list" className="space-y-3">
          {myTrainings.map((myTraining) => {
            const { enrollment, progress } = myTraining
            const isInvitation = enrollment.status === 'invited'
            const canLeave = workerTrainingActions(enrollment.status, progress?.progressStatus ?? null, myTraining.program?.status ?? null).includes('leave')
            return (
              <li key={enrollment.id} className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{enrollment.programTitleSnapshot}</h3>
                  <p className="text-xs break-words text-[var(--color-ink-500)]">
                    {enrollment.shopNameSnapshot} - invited {formatShortDateTime(enrollment.invitedAt)}
                  </p>
                </div>
                {progress === null ? null : (
                  <TrainingProgressSummary
                    progressStatus={progress.progressStatus}
                    attendedTrainingDays={progress.attendedTrainingDays}
                    requiredTrainingDays={progress.requiredTrainingDays}
                    currentAssessmentResult={progress.currentAssessmentResult}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={isInvitation ? 'primary' : 'secondary'} onClick={(): void => { setOpenEnrollmentId(enrollment.id) }}>
                    {isInvitation ? 'Review invitation' : 'View progress and records'}
                  </Button>
                  {canLeave ? (
                    <Button size="sm" variant="ghost" disabled={pendingEnrollmentId === enrollment.id}
                      onClick={(): void => { setPendingAction({ kind: 'leave', myTraining }) }}>
                      Leave training
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        isOpen={openTraining !== null && pendingAction === null}
        onClose={(): void => { setOpenEnrollmentId(null) }}
        title={openTraining?.enrollment.status === 'invited' ? 'Training invitation' : 'My training'}
        maxWidthClassName="max-w-2xl"
      >
        {openTraining === null ? null : (
          <div className="max-h-[70dvh] overflow-y-auto pr-1">
            {openTraining.enrollment.status === 'invited' ? (
              <TrainingInvitationDetail
                key={openTraining.enrollment.id}
                trainingEnrollmentService={trainingDependencies.trainingEnrollmentService}
                myTraining={openTraining}
                isDeclinePending={pendingEnrollmentId === openTraining.enrollment.id}
                refreshTrainings={trainingsState.refreshTrainings}
                onDeclineRequested={(myTraining): void => { setPendingAction({ kind: 'decline', myTraining }) }}
                onAccepted={(): void => { setOpenEnrollmentId(null) }}
              />
            ) : (
              <MyTrainingProgress trainingEvidenceService={trainingDependencies.trainingEvidenceService} myTraining={openTraining} />
            )}
          </div>
        )}
      </Modal>

      <TrainingConfirmModal
        isOpen={pendingAction !== null}
        title={pendingAction?.kind === 'decline' ? 'Decline this invitation?' : 'Leave this training?'}
        subjectText={pendingAction?.myTraining.enrollment.programTitleSnapshot ?? ''}
        message={
          pendingAction?.kind === 'decline'
            ? 'The shop is told you declined. You cannot accept this invitation later.'
            : leaveTrainingConfirmationText
        }
        confirmButtonLabel={pendingAction?.kind === 'decline' ? 'Decline invitation' : 'Leave training'}
        isDestructive
        isSubmitting={pendingAction !== null && pendingEnrollmentId === pendingAction.myTraining.enrollment.id}
        onConfirm={(): void => { void confirmPendingAction() }}
        onCancel={(): void => { setPendingAction(null) }}
      />
    </Card>
  )
}
