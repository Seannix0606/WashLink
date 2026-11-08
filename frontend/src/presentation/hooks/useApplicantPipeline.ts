import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApplicantPipeline,
  ApplicantPipelineService,
} from '../../application/services/ApplicantPipelineService'
import type { JobApplication } from '../../domain/models/JobApplication'
import type { JobOpeningStatus } from '../../domain/models/JobOpening'
import type { OwnerJobApplicationTransition } from '../../domain/utilities/jobApplicationLifecycle'
import { ownerTransitionCopy } from '../utilities/jobApplicationDisplay'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { usePollWhileVisible } from './usePollWhileVisible'

const loadFailedMessage = 'Could not load the applications.'

const emptyPipeline: ApplicantPipeline = {
  applications: [],
  applicantProfileByApplicationId: new Map(),
}

export interface UseApplicantPipelineResult {
  readonly pipeline: ApplicantPipeline
  readonly isLoadingPipeline: boolean
  readonly pipelineErrorMessage: string | null
  readonly isPipelineEmpty: boolean
  readonly pendingApplicationId: string | null
  readonly reloadPipeline: () => Promise<void>
  /** Resolves true when the change was recorded; the pipeline is refreshed either way. */
  readonly transitionApplication: (
    application: JobApplication,
    toStatus: OwnerJobApplicationTransition,
  ) => Promise<boolean>
}

/** Applicants of one opening; refreshed every 60 s while visible and on focus. */
export function useApplicantPipeline(
  applicantPipelineService: ApplicantPipelineService,
  jobOpeningId: string,
  openingStatus: JobOpeningStatus,
): UseApplicantPipelineResult {
  const [pipeline, setPipeline] = useState<ApplicantPipeline>(emptyPipeline)
  const [isLoadingPipeline, setIsLoadingPipeline] = useState<boolean>(true)
  const [pipelineErrorMessage, setPipelineErrorMessage] = useState<string | null>(null)
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)
  const latestRequestNumberRef = useRef<number>(0)
  const isHookMountedRef = useRef<boolean>(true)

  const fetchPipeline = useCallback(async (): Promise<void> => {
    latestRequestNumberRef.current += 1
    const requestNumber = latestRequestNumberRef.current
    const isLatestRequest = (): boolean =>
      isHookMountedRef.current && requestNumber === latestRequestNumberRef.current
    try {
      const loadedPipeline = await applicantPipelineService.loadPipeline(jobOpeningId)
      if (isLatestRequest()) {
        setPipeline(loadedPipeline)
        setPipelineErrorMessage(null)
      }
    } catch (loadError) {
      if (isLatestRequest()) {
        setPipelineErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isLatestRequest()) {
        setIsLoadingPipeline(false)
      }
    }
  }, [applicantPipelineService, jobOpeningId])

  useEffect(() => {
    isHookMountedRef.current = true
    void fetchPipeline()
    return (): void => {
      isHookMountedRef.current = false
    }
  }, [fetchPipeline])

  const refreshInBackground = useCallback((): void => {
    void fetchPipeline()
  }, [fetchPipeline])
  usePollWhileVisible(refreshInBackground, true)

  const reloadPipeline = useCallback(async (): Promise<void> => {
    setIsLoadingPipeline(true)
    setPipelineErrorMessage(null)
    await fetchPipeline()
  }, [fetchPipeline])

  const transitionApplication = useCallback(
    async (application: JobApplication, toStatus: OwnerJobApplicationTransition): Promise<boolean> => {
      setPendingApplicationId(application.id)
      const transitionedApplication = await runServiceActionWithToast(
        () => applicantPipelineService.transition(application, toStatus, openingStatus),
        {
          successMessage: ownerTransitionCopy[toStatus].successMessage,
          fallbackErrorMessage: 'Could not change the application status.',
        },
      )
      // Refresh either way: a stale status ("changed. Refresh and try again.") shows the current row.
      await fetchPipeline()
      setPendingApplicationId(null)
      return transitionedApplication !== null
    },
    [applicantPipelineService, fetchPipeline, openingStatus],
  )

  return {
    pipeline,
    isLoadingPipeline,
    pipelineErrorMessage,
    isPipelineEmpty:
      !isLoadingPipeline && pipelineErrorMessage === null && pipeline.applications.length === 0,
    pendingApplicationId,
    reloadPipeline,
    transitionApplication,
  }
}
