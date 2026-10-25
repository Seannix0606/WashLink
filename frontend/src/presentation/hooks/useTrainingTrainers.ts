import { useCallback, useState } from 'react'
import type { TrainingProgramService } from '../../application/services/TrainingProgramService'
import type { TrainingProgram } from '../../domain/models/TrainingProgram'
import type { TrainingTrainer } from '../../domain/models/TrainingTrainer'
import type { Worker } from '../../domain/models/Worker'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

const noTrainers: readonly TrainingTrainer[] = []

export interface UseTrainingTrainersResult {
  readonly trainers: readonly TrainingTrainer[]
  readonly isLoadingTrainers: boolean
  readonly trainersErrorMessage: string | null
  readonly isTrainerActionPending: boolean
  readonly reloadTrainers: () => Promise<void>
  readonly designateTrainer: (rosterWorker: Worker) => Promise<boolean>
  readonly revokeTrainer: (trainer: TrainingTrainer) => Promise<boolean>
}

/** Designated trainers of one program (D-16). */
export function useTrainingTrainers(
  trainingProgramService: TrainingProgramService,
  program: TrainingProgram,
): UseTrainingTrainersResult {
  const programId = program.id
  const [isTrainerActionPending, setIsTrainerActionPending] = useState<boolean>(false)
  const loadTrainers = useCallback(
    async (): Promise<readonly TrainingTrainer[]> => trainingProgramService.listTrainers(programId),
    [programId, trainingProgramService],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadTrainers,
    initialResource: noTrainers,
    loadFailedMessage: 'Could not load the trainers.',
  })

  const runTrainerAction = useCallback(
    async (performAction: () => Promise<void>, successMessage: string, fallbackErrorMessage: string): Promise<boolean> => {
      setIsTrainerActionPending(true)
      const didSucceed = await runServiceActionWithToast(
        async () => {
          await performAction()
          return true
        },
        { successMessage, fallbackErrorMessage },
      )
      await refresh()
      setIsTrainerActionPending(false)
      return didSucceed !== null
    },
    [refresh],
  )

  const designateTrainer = useCallback(
    async (rosterWorker: Worker): Promise<boolean> =>
      runTrainerAction(
        () => trainingProgramService.designateTrainer(program, rosterWorker),
        'Trainer added.',
        'Could not add the trainer.',
      ),
    [program, runTrainerAction, trainingProgramService],
  )

  const revokeTrainer = useCallback(
    async (trainer: TrainingTrainer): Promise<boolean> =>
      runTrainerAction(
        () => trainingProgramService.revokeTrainer(program, trainer),
        'Trainer role ended.',
        'Could not remove the trainer.',
      ),
    [program, runTrainerAction, trainingProgramService],
  )

  return {
    trainers: resource,
    isLoadingTrainers: isLoading,
    trainersErrorMessage: errorMessage,
    isTrainerActionPending,
    reloadTrainers: reload,
    designateTrainer,
    revokeTrainer,
  }
}
