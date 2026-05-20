import { useEffect, useState } from 'react'
import type { WorkerService } from '../../application/services/WorkerService'
import type { Worker } from '../../domain/models/Worker'

interface UseOwnerWorkersRealtimeResult {
  readonly workers: Worker[]
  readonly replaceLocalWorkerList: (nextWorkerList: Worker[]) => void
}

export function useOwnerWorkersRealtime(
  workerService: WorkerService,
  ownerIdentifier: string,
): UseOwnerWorkersRealtimeResult {
  const [workers, setWorkers] = useState<Worker[]>([])

  useEffect(() => {
    let isComponentMounted = true

    const loadWorkers = async (): Promise<void> => {
      try {
        const fetchedWorkerList =
          await workerService.fetchWorkersForOwner(ownerIdentifier)
        if (isComponentMounted) {
          setWorkers(fetchedWorkerList)
        }
      } catch (loadWorkersError) {
        console.error('Unable to load workers for owner.', loadWorkersError)
      }
    }

    void loadWorkers()

    return (): void => {
      isComponentMounted = false
    }
  }, [ownerIdentifier, workerService])

  useEffect(() => {
    const workerRealtimeChannel =
      workerService.subscribeToWorkerRowUpdatesForOwner(
        ownerIdentifier,
        (updatedWorkerProfile) => {
          setWorkers((previousWorkerList) =>
            mergeWorkerListWithUpdatedWorker(
              previousWorkerList,
              updatedWorkerProfile,
            ),
          )
        },
      )

    return (): void => {
      void workerService.removeWorkerRealtimeSubscription(workerRealtimeChannel)
    }
  }, [ownerIdentifier, workerService])

  return { workers, replaceLocalWorkerList: setWorkers }
}

function mergeWorkerListWithUpdatedWorker(
  previousWorkerList: Worker[],
  updatedWorker: Worker,
): Worker[] {
  const updatedWorkerIndex = previousWorkerList.findIndex(
    (existingWorker) =>
      existingWorker.workerIdentifier === updatedWorker.workerIdentifier,
  )
  if (updatedWorkerIndex === -1) {
    return [...previousWorkerList, updatedWorker]
  }
  const nextWorkerList = [...previousWorkerList]
  nextWorkerList[updatedWorkerIndex] = updatedWorker
  return nextWorkerList
}
