import { useCallback, useEffect, useState } from 'react'
import type { WorkerProfileService } from '../../application/services/WorkerProfileService'
import type {
  OwnWorkerProfile,
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerPrivateContact,
  WorkerProfile,
} from '../../domain/models/WorkerProfile'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const loadFailedMessage = 'Could not load your worker profile.'

export interface UseWorkerProfileResult {
  readonly workerProfile: WorkerProfile | null
  readonly workerPrivateContact: WorkerPrivateContact | null
  readonly isLoadingWorkerProfile: boolean
  readonly workerProfileErrorMessage: string | null
  /** True once loaded without error and no profile row exists. */
  readonly isWorkerProfileEmpty: boolean
  readonly isSavingWorkerProfile: boolean
  readonly isDeletingWorkerProfile: boolean
  readonly reloadWorkerProfile: () => Promise<void>
  readonly saveWorkerProfile: (
    saveWorkerProfileInput: SaveWorkerProfileInput,
    saveWorkerPrivateContactInput: SaveWorkerPrivateContactInput,
  ) => Promise<boolean>
  readonly deleteWorkerProfile: () => Promise<boolean>
}

const emptyOwnWorkerProfile: OwnWorkerProfile = {
  workerProfile: null,
  workerPrivateContact: null,
}

export function useWorkerProfile(
  workerProfileService: WorkerProfileService,
): UseWorkerProfileResult {
  const [ownWorkerProfile, setOwnWorkerProfile] =
    useState<OwnWorkerProfile>(emptyOwnWorkerProfile)
  const [isLoadingWorkerProfile, setIsLoadingWorkerProfile] = useState<boolean>(true)
  const [workerProfileErrorMessage, setWorkerProfileErrorMessage] = useState<
    string | null
  >(null)
  const [isSavingWorkerProfile, setIsSavingWorkerProfile] = useState<boolean>(false)
  const [isDeletingWorkerProfile, setIsDeletingWorkerProfile] =
    useState<boolean>(false)

  const reloadWorkerProfile = useCallback(async (): Promise<void> => {
    setIsLoadingWorkerProfile(true)
    setWorkerProfileErrorMessage(null)
    try {
      setOwnWorkerProfile(await workerProfileService.loadOwnWorkerProfile())
    } catch (loadError) {
      setWorkerProfileErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
    } finally {
      setIsLoadingWorkerProfile(false)
    }
  }, [workerProfileService])

  useEffect(() => {
    let isHookMounted = true
    const loadInitialWorkerProfile = async (): Promise<void> => {
      try {
        const loadedOwnWorkerProfile = await workerProfileService.loadOwnWorkerProfile()
        if (isHookMounted) {
          setOwnWorkerProfile(loadedOwnWorkerProfile)
        }
      } catch (loadError) {
        if (isHookMounted) {
          setWorkerProfileErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
        }
      } finally {
        if (isHookMounted) {
          setIsLoadingWorkerProfile(false)
        }
      }
    }
    void loadInitialWorkerProfile()
    return (): void => {
      isHookMounted = false
    }
  }, [workerProfileService])

  const saveWorkerProfile = useCallback(
    async (
      saveWorkerProfileInput: SaveWorkerProfileInput,
      saveWorkerPrivateContactInput: SaveWorkerPrivateContactInput,
    ): Promise<boolean> => {
      setIsSavingWorkerProfile(true)
      const savedOwnWorkerProfile = await runServiceActionWithToast(
        () =>
          workerProfileService.saveOwnWorkerProfile(
            saveWorkerProfileInput,
            saveWorkerPrivateContactInput,
          ),
        {
          successMessage: 'Worker profile saved.',
          fallbackErrorMessage: 'Could not save your worker profile.',
        },
      )
      setIsSavingWorkerProfile(false)
      if (savedOwnWorkerProfile === null) {
        return false
      }
      setOwnWorkerProfile(savedOwnWorkerProfile)
      setWorkerProfileErrorMessage(null)
      return true
    },
    [workerProfileService],
  )

  const deleteWorkerProfile = useCallback(async (): Promise<boolean> => {
    setIsDeletingWorkerProfile(true)
    const didDelete = await runServiceActionWithToast(
      async () => {
        await workerProfileService.deleteOwnWorkerProfile()
        return true
      },
      {
        successMessage: 'Worker profile deleted.',
        fallbackErrorMessage: 'Could not delete your worker profile.',
      },
    )
    setIsDeletingWorkerProfile(false)
    if (didDelete === null) {
      return false
    }
    setOwnWorkerProfile(emptyOwnWorkerProfile)
    return true
  }, [workerProfileService])

  return {
    workerProfile: ownWorkerProfile.workerProfile,
    workerPrivateContact: ownWorkerProfile.workerPrivateContact,
    isLoadingWorkerProfile,
    workerProfileErrorMessage,
    isWorkerProfileEmpty:
      !isLoadingWorkerProfile &&
      workerProfileErrorMessage === null &&
      ownWorkerProfile.workerProfile === null,
    isSavingWorkerProfile,
    isDeletingWorkerProfile,
    reloadWorkerProfile,
    saveWorkerProfile,
    deleteWorkerProfile,
  }
}
