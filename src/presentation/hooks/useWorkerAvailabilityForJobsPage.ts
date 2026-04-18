import { useCallback, useEffect, useState } from 'react'
import type { WorkerService } from '../../application/services/WorkerService'

interface UseWorkerAvailabilityForJobsPageResult {
  isWorkerAvailableForJobs: boolean
  hasLoadedWorkerAvailabilityProfile: boolean
  isUpdatingWorkerAvailability: boolean
  updateWorkerAvailabilityForJobs: (
    isAvailableForNewJobsSelection: boolean,
  ) => Promise<void>
}

export function useWorkerAvailabilityForJobsPage(
  workerService: WorkerService,
  workerIdentifier: string,
): UseWorkerAvailabilityForJobsPageResult {
  const [isWorkerAvailableForJobs, setIsWorkerAvailableForJobs] =
    useState<boolean>(false)
  const [hasLoadedWorkerAvailabilityProfile, setHasLoadedWorkerAvailabilityProfile] =
    useState<boolean>(false)
  const [isUpdatingWorkerAvailability, setIsUpdatingWorkerAvailability] =
    useState<boolean>(false)

  useEffect(() => {
    if (workerIdentifier.length === 0) {
      return
    }

    let isComponentMounted = true

    const loadWorkerAvailabilityProfile = async (): Promise<void> => {
      try {
        const workerProfile = await workerService.fetchWorkerByIdentifier(
          workerIdentifier,
        )
        if (isComponentMounted) {
          setIsWorkerAvailableForJobs(workerProfile.isAvailable)
          setHasLoadedWorkerAvailabilityProfile(true)
        }
      } catch (error) {
        console.error('Unable to load worker availability profile.', error)
      }
    }

    void loadWorkerAvailabilityProfile()

    return (): void => {
      isComponentMounted = false
    }
  }, [workerIdentifier, workerService])

  const updateWorkerAvailabilityForJobs = useCallback(
    async (isAvailableForNewJobsSelection: boolean): Promise<void> => {
      if (workerIdentifier.length === 0) {
        return
      }
      setIsUpdatingWorkerAvailability(true)
      try {
        const updatedWorkerProfile = await workerService.updateAvailability(
          workerIdentifier,
          isAvailableForNewJobsSelection,
        )
        setIsWorkerAvailableForJobs(updatedWorkerProfile.isAvailable)
      } finally {
        setIsUpdatingWorkerAvailability(false)
      }
    },
    [workerIdentifier, workerService],
  )

  return {
    isWorkerAvailableForJobs,
    hasLoadedWorkerAvailabilityProfile,
    isUpdatingWorkerAvailability,
    updateWorkerAvailabilityForJobs,
  }
}
