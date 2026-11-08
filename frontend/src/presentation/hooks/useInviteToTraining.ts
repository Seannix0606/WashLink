import { useCallback, useState } from 'react'
import type { TrainingEnrollmentService } from '../../application/services/TrainingEnrollmentService'
import type { TrainingProgramService } from '../../application/services/TrainingProgramService'
import type { JobApplication } from '../../domain/models/JobApplication'
import type { TrainingProgram } from '../../domain/models/TrainingProgram'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

const noPrograms: readonly TrainingProgram[] = []

export interface UseInviteToTrainingResult {
  readonly invitablePrograms: readonly TrainingProgram[]
  readonly isLoadingPrograms: boolean
  readonly programsErrorMessage: string | null
  readonly isInviting: boolean
  readonly reloadPrograms: () => Promise<void>
  readonly inviteToProgram: (program: TrainingProgram) => Promise<boolean>
}

/** Open programs of the application's shop and the invitation itself (D-15). */
export function useInviteToTraining(
  trainingProgramService: TrainingProgramService,
  trainingEnrollmentService: TrainingEnrollmentService,
  jobApplication: JobApplication,
): UseInviteToTrainingResult {
  const [isInviting, setIsInviting] = useState<boolean>(false)
  const loadPrograms = useCallback(
    async (): Promise<readonly TrainingProgram[]> => trainingProgramService.listInvitablePrograms(jobApplication),
    [jobApplication, trainingProgramService],
  )
  const { resource, isLoading, errorMessage, reload } = useLatestResource({
    load: loadPrograms,
    initialResource: noPrograms,
    loadFailedMessage: 'Could not load your open training programs.',
  })

  const inviteToProgram = useCallback(
    async (program: TrainingProgram): Promise<boolean> => {
      setIsInviting(true)
      const enrollment = await runServiceActionWithToast(
        () => trainingEnrollmentService.invite(program, jobApplication),
        { successMessage: 'Training invitation sent.', fallbackErrorMessage: 'Could not send the training invitation.' },
      )
      setIsInviting(false)
      return enrollment !== null
    },
    [jobApplication, trainingEnrollmentService],
  )

  return {
    invitablePrograms: resource,
    isLoadingPrograms: isLoading,
    programsErrorMessage: errorMessage,
    isInviting,
    reloadPrograms: reload,
    inviteToProgram,
  }
}
