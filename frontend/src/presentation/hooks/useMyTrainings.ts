import { useCallback, useState } from 'react'
import type { TrainingEnrollmentService } from '../../application/services/TrainingEnrollmentService'
import type { MyTraining } from '../../domain/models/TrainingEnrollment'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

const noTrainings: readonly MyTraining[] = []

export interface UseMyTrainingsResult {
  readonly myTrainings: readonly MyTraining[]
  readonly isLoadingTrainings: boolean
  readonly trainingsErrorMessage: string | null
  readonly isTrainingListEmpty: boolean
  readonly pendingEnrollmentId: string | null
  readonly reloadTrainings: () => Promise<void>
  readonly refreshTrainings: () => Promise<void>
  readonly declineInvitation: (myTraining: MyTraining) => Promise<boolean>
  readonly leaveTraining: (myTraining: MyTraining) => Promise<boolean>
}

/** The worker's training, invitations first; refreshed every 60 s while visible and on focus. */
export function useMyTrainings(trainingEnrollmentService: TrainingEnrollmentService): UseMyTrainingsResult {
  const [pendingEnrollmentId, setPendingEnrollmentId] = useState<string | null>(null)
  const loadTrainings = useCallback(
    async (): Promise<readonly MyTraining[]> => trainingEnrollmentService.listMyTrainings(),
    [trainingEnrollmentService],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadTrainings,
    initialResource: noTrainings,
    loadFailedMessage: 'Could not load your training.',
    isPolling: true,
  })

  const runWorkerAction = useCallback(
    async (myTraining: MyTraining, performAction: () => Promise<unknown>, successMessage: string, fallbackErrorMessage: string): Promise<boolean> => {
      setPendingEnrollmentId(myTraining.enrollment.id)
      const actionResult = await runServiceActionWithToast(performAction, { successMessage, fallbackErrorMessage })
      // Refresh either way: a failure is often a changed status.
      await refresh()
      setPendingEnrollmentId(null)
      return actionResult !== null
    },
    [refresh],
  )

  const declineInvitation = useCallback(
    async (myTraining: MyTraining): Promise<boolean> =>
      runWorkerAction(
        myTraining,
        () => trainingEnrollmentService.decline(myTraining),
        'Invitation declined.',
        'Could not decline the invitation.',
      ),
    [runWorkerAction, trainingEnrollmentService],
  )

  const leaveTraining = useCallback(
    async (myTraining: MyTraining): Promise<boolean> =>
      runWorkerAction(
        myTraining,
        () => trainingEnrollmentService.leave(myTraining),
        'You left the training.',
        'Could not leave the training.',
      ),
    [runWorkerAction, trainingEnrollmentService],
  )

  return {
    myTrainings: resource,
    isLoadingTrainings: isLoading,
    trainingsErrorMessage: errorMessage,
    isTrainingListEmpty: !isLoading && errorMessage === null && resource.length === 0,
    pendingEnrollmentId,
    reloadTrainings: reload,
    refreshTrainings: refresh,
    declineInvitation,
    leaveTraining,
  }
}
