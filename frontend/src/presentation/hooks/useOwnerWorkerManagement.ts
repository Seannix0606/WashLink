import { useCallback, useState } from 'react'
import type { WorkerService } from '../../application/services/WorkerService'
import type { CreateWorkerInput, Worker } from '../../domain/models/Worker'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseOwnerWorkerManagementOptions {
  readonly ownerIdentifier: string
  readonly workerService: WorkerService
  readonly workers: readonly Worker[]
  readonly onWorkersChanged: (nextWorkers: Worker[]) => void
}

interface UseOwnerWorkerManagementResult {
  readonly isSubmittingWorkerCreation: boolean
  readonly deletingWorkerIdentifier: string | null
  readonly createWorkerForOwner: (
    createWorkerInput: CreateWorkerInput,
  ) => Promise<Worker | null>
  readonly removeWorker: (worker: Worker) => Promise<void>
}

export function useOwnerWorkerManagement({
  ownerIdentifier,
  workerService,
  workers,
  onWorkersChanged,
}: UseOwnerWorkerManagementOptions): UseOwnerWorkerManagementResult {
  const [isSubmittingWorkerCreation, setIsSubmittingWorkerCreation] =
    useState<boolean>(false)
  const [deletingWorkerIdentifier, setDeletingWorkerIdentifier] = useState<
    string | null
  >(null)

  const createWorkerForOwner = useCallback(
    async (
      createWorkerInput: CreateWorkerInput,
    ): Promise<Worker | null> => {
      setIsSubmittingWorkerCreation(true)
      const createdWorker = await runServiceActionWithToast(
        () =>
          workerService.createWorkerForOwner(
            ownerIdentifier,
            createWorkerInput,
          ),
        {
          successMessage: (worker) => `${worker.workerName} added.`,
          fallbackErrorMessage: 'Could not add this worker.',
        },
      )
      setIsSubmittingWorkerCreation(false)
      if (createdWorker !== null) {
        onWorkersChanged([...workers, createdWorker])
      }
      return createdWorker
    },
    [ownerIdentifier, workerService, workers, onWorkersChanged],
  )

  const removeWorker = useCallback(
    async (worker: Worker): Promise<void> => {
      const shouldDelete =
        typeof window === 'undefined'
          ? true
          : window.confirm(`Remove ${worker.workerName} from your team?`)
      if (!shouldDelete) {
        return
      }
      setDeletingWorkerIdentifier(worker.workerIdentifier)
      const deleteActionResult = await runServiceActionWithToast(
        () => workerService.deleteWorker(worker.workerIdentifier),
        {
          successMessage: `${worker.workerName} removed.`,
          fallbackErrorMessage: 'Could not remove this worker.',
        },
      )
      setDeletingWorkerIdentifier(null)
      if (deleteActionResult !== null) {
        onWorkersChanged(
          workers.filter(
            (existingWorker) =>
              existingWorker.workerIdentifier !== worker.workerIdentifier,
          ),
        )
      }
    },
    [workerService, workers, onWorkersChanged],
  )

  return {
    isSubmittingWorkerCreation,
    deletingWorkerIdentifier,
    createWorkerForOwner,
    removeWorker,
  }
}
