import { useCallback, useEffect, useState } from 'react'
import type { WorkerService } from '../../application/services/WorkerService'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseWorkerAvailabilityForJobsPageResult {
  isWorkerAvailableForJobs: boolean
  hasLoadedWorkerAvailabilityProfile: boolean
  isUpdatingWorkerAvailability: boolean
  workerAvailabilityLoadErrorMessage: string | null
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
  const [
    workerAvailabilityLoadErrorMessage,
    setWorkerAvailabilityLoadErrorMessage,
  ] = useState<string | null>(null)

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
          setWorkerAvailabilityLoadErrorMessage(null)
        }
      } catch (error) {
        console.error('Unable to load worker availability profile.', error)
        if (isComponentMounted) {
          setWorkerAvailabilityLoadErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to load your availability status.',
          )
        }
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
        const updatedWorkerProfile = await runServiceActionWithToast(
          () =>
            workerService.updateAvailability(
              workerIdentifier,
              isAvailableForNewJobsSelection,
            ),
          {
            successMessage: 'Availability updated.',
            fallbackErrorMessage: 'Could not update your availability.',
          },
        )
        if (updatedWorkerProfile !== null) {
          setIsWorkerAvailableForJobs(updatedWorkerProfile.isAvailable)
          setWorkerAvailabilityLoadErrorMessage(null)
        }
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
    workerAvailabilityLoadErrorMessage,
    updateWorkerAvailabilityForJobs,
  }
}
