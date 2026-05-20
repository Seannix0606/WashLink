import { useEffect, useState } from 'react'
import type { WorkerService } from '../../application/services/WorkerService'

interface UseWorkerProfileResolutionResult {
  readonly workerIdentifier: string
  readonly isResolvingWorkerProfile: boolean
  readonly workerResolutionErrorMessage: string
  readonly hasResolvedWorkerProfile: boolean
}

export function useWorkerProfileResolution(
  workerService: WorkerService,
  workerUserIdentifier: string,
): UseWorkerProfileResolutionResult {
  const [workerIdentifier, setWorkerIdentifier] = useState<string>('')
  const [isResolvingWorkerProfile, setIsResolvingWorkerProfile] =
    useState<boolean>(true)
  const [workerResolutionErrorMessage, setWorkerResolutionErrorMessage] =
    useState<string>('')

  useEffect(() => {
    let isComponentMounted = true

    const loadWorkerIdentifierForAuthenticatedUser =
      async (): Promise<void> => {
        try {
          const workerProfile =
            await workerService.fetchWorkerByUserIdentifier(
              workerUserIdentifier,
            )
          if (isComponentMounted) {
            setWorkerIdentifier(workerProfile.workerIdentifier)
            setWorkerResolutionErrorMessage('')
          }
        } catch (workerProfileLookupError) {
          if (isComponentMounted) {
            setWorkerIdentifier('')
            setWorkerResolutionErrorMessage(
              workerProfileLookupError instanceof Error
                ? workerProfileLookupError.message
                : 'Unable to load worker profile for this account.',
            )
          }
        } finally {
          if (isComponentMounted) {
            setIsResolvingWorkerProfile(false)
          }
        }
      }

    void loadWorkerIdentifierForAuthenticatedUser()

    return (): void => {
      isComponentMounted = false
    }
  }, [workerService, workerUserIdentifier])

  return {
    workerIdentifier,
    isResolvingWorkerProfile,
    workerResolutionErrorMessage,
    hasResolvedWorkerProfile: workerIdentifier.length > 0,
  }
}
