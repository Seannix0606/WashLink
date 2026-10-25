import { useCallback } from 'react'
import type { TrainingProgramService } from '../../application/services/TrainingProgramService'
import type { DesignatedTrainingProgram } from '../../domain/models/TrainingTrainer'
import { useLatestResource } from './useLatestResource'

const noDesignatedPrograms: readonly DesignatedTrainingProgram[] = []

export interface UseTrainerProgramsResult {
  readonly designatedPrograms: readonly DesignatedTrainingProgram[]
  readonly isLoadingDesignatedPrograms: boolean
  readonly designatedProgramsErrorMessage: string | null
  readonly isDesignatedTrainer: boolean
  readonly reloadDesignatedPrograms: () => Promise<void>
}

/** Programs the signed-in worker currently trains for (unrevoked designations only). */
export function useTrainerPrograms(trainingProgramService: TrainingProgramService): UseTrainerProgramsResult {
  const loadDesignatedPrograms = useCallback(
    async (): Promise<readonly DesignatedTrainingProgram[]> => trainingProgramService.listDesignatedPrograms(),
    [trainingProgramService],
  )
  const { resource, isLoading, errorMessage, reload } = useLatestResource({
    load: loadDesignatedPrograms,
    initialResource: noDesignatedPrograms,
    loadFailedMessage: 'Could not load the training you run.',
    isPolling: true,
  })
  return {
    designatedPrograms: resource,
    isLoadingDesignatedPrograms: isLoading,
    designatedProgramsErrorMessage: errorMessage,
    isDesignatedTrainer: resource.length > 0,
    reloadDesignatedPrograms: reload,
  }
}
