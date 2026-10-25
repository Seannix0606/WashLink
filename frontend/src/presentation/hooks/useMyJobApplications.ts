import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobApplicationService } from '../../application/services/JobApplicationService'
import type { JobApplication, MyJobApplication } from '../../domain/models/JobApplication'
import { describeWithdrawAction } from '../utilities/jobApplicationDisplay'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { usePollWhileVisible } from './usePollWhileVisible'

const loadFailedMessage = 'Could not load your applications.'

export interface UseMyJobApplicationsResult {
  readonly myApplications: readonly MyJobApplication[]
  readonly isLoadingApplications: boolean
  readonly applicationsErrorMessage: string | null
  readonly isApplicationListEmpty: boolean
  /** Application with a withdraw or delete in flight. */
  readonly pendingApplicationId: string | null
  readonly reloadApplications: () => Promise<void>
  /** Re-reads the list without showing the loading state. */
  readonly refreshApplications: () => Promise<void>
  readonly withdrawApplication: (application: JobApplication) => Promise<boolean>
  readonly deleteApplicationDraft: (draft: JobApplication) => Promise<boolean>
}

/** The worker's applications; refreshed every 60 s while visible and on focus. */
export function useMyJobApplications(jobApplicationService: JobApplicationService): UseMyJobApplicationsResult {
  const [myApplications, setMyApplications] = useState<readonly MyJobApplication[]>([])
  const [isLoadingApplications, setIsLoadingApplications] = useState<boolean>(true)
  const [applicationsErrorMessage, setApplicationsErrorMessage] = useState<string | null>(null)
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)
  const latestRequestNumberRef = useRef<number>(0)
  const isHookMountedRef = useRef<boolean>(true)

  const fetchApplications = useCallback(async (): Promise<void> => {
    latestRequestNumberRef.current += 1
    const requestNumber = latestRequestNumberRef.current
    const isLatestRequest = (): boolean =>
      isHookMountedRef.current && requestNumber === latestRequestNumberRef.current
    try {
      const loadedApplications = await jobApplicationService.listMyApplications()
      if (isLatestRequest()) {
        setMyApplications(loadedApplications)
        setApplicationsErrorMessage(null)
      }
    } catch (loadError) {
      if (isLatestRequest()) {
        setApplicationsErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isLatestRequest()) {
        setIsLoadingApplications(false)
      }
    }
  }, [jobApplicationService])

  useEffect(() => {
    isHookMountedRef.current = true
    void fetchApplications()
    return (): void => {
      isHookMountedRef.current = false
    }
  }, [fetchApplications])

  const refreshInBackground = useCallback((): void => {
    void fetchApplications()
  }, [fetchApplications])
  usePollWhileVisible(refreshInBackground, true)

  const reloadApplications = useCallback(async (): Promise<void> => {
    setIsLoadingApplications(true)
    setApplicationsErrorMessage(null)
    await fetchApplications()
  }, [fetchApplications])

  const withdrawApplication = useCallback(
    async (application: JobApplication): Promise<boolean> => {
      setPendingApplicationId(application.id)
      const withdrawnApplication = await runServiceActionWithToast(
        () => jobApplicationService.withdraw(application),
        {
          successMessage: describeWithdrawAction(application.status).successMessage,
          fallbackErrorMessage: 'Could not withdraw the application.',
        },
      )
      // Refresh either way: a failure is often a stale status.
      await fetchApplications()
      setPendingApplicationId(null)
      return withdrawnApplication !== null
    },
    [fetchApplications, jobApplicationService],
  )

  const deleteApplicationDraft = useCallback(
    async (draft: JobApplication): Promise<boolean> => {
      setPendingApplicationId(draft.id)
      const didDelete = await runServiceActionWithToast(
        async () => {
          await jobApplicationService.deleteDraft(draft)
          return true
        },
        {
          successMessage: describeWithdrawAction('draft').successMessage,
          fallbackErrorMessage: 'Could not delete the draft.',
        },
      )
      await fetchApplications()
      setPendingApplicationId(null)
      return didDelete !== null
    },
    [fetchApplications, jobApplicationService],
  )

  return {
    myApplications,
    isLoadingApplications,
    applicationsErrorMessage,
    isApplicationListEmpty:
      !isLoadingApplications && applicationsErrorMessage === null && myApplications.length === 0,
    pendingApplicationId,
    reloadApplications,
    refreshApplications: fetchApplications,
    withdrawApplication,
    deleteApplicationDraft,
  }
}
