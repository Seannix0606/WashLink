import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  JobOpeningService,
  ShopPublishEligibility,
} from '../../application/services/JobOpeningService'
import {
  jobOpeningLimits,
  type JobOpening,
  type JobOpeningStatus,
  type SaveJobOpeningInput,
} from '../../domain/models/JobOpening'
import {
  jobOpeningActionCopy,
  toTransitionAction,
} from '../utilities/jobOpeningActionDisplay'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const loadFailedMessage = 'Could not load your job openings.'

interface JobOpeningsSnapshot {
  readonly jobOpenings: readonly JobOpening[]
  readonly shopPublishEligibility: ShopPublishEligibility
  /** When this snapshot was read; publish readiness (deadline) is judged against it. */
  readonly loadedAt: Date
}

const emptySnapshot: JobOpeningsSnapshot = {
  jobOpenings: [],
  shopPublishEligibility: {},
  loadedAt: new Date(0),
}

export interface UseOwnerJobOpeningsResult {
  readonly jobOpenings: readonly JobOpening[]
  readonly shopPublishEligibility: ShopPublishEligibility
  readonly loadedAt: Date
  readonly isLoadingJobOpenings: boolean
  readonly jobOpeningsErrorMessage: string | null
  /** True once loaded without error and the owner has no openings. */
  readonly isJobOpeningListEmpty: boolean
  /** True when the list hit the page size, so older openings may be missing. */
  readonly isJobOpeningListTruncated: boolean
  /** Opening with a status change or delete in flight (its actions are disabled). */
  readonly pendingJobOpeningId: string | null
  readonly reloadJobOpenings: () => Promise<void>
  readonly transitionJobOpening: (
    jobOpening: JobOpening,
    toStatus: JobOpeningStatus,
  ) => Promise<boolean>
  readonly deleteJobOpeningDraft: (jobOpening: JobOpening) => Promise<boolean>
  readonly saveJobOpening: (
    existingJobOpening: JobOpening | null,
    shopId: string,
    saveJobOpeningInput: SaveJobOpeningInput,
  ) => Promise<boolean>
}

export function useOwnerJobOpenings(
  jobOpeningService: JobOpeningService,
  ownerShopIds: readonly string[],
): UseOwnerJobOpeningsResult {
  const ownerShopIdsKey = ownerShopIds.join(',')
  const [snapshot, setSnapshot] = useState<JobOpeningsSnapshot>(emptySnapshot)
  const [isLoadingJobOpenings, setIsLoadingJobOpenings] = useState<boolean>(true)
  const [jobOpeningsErrorMessage, setJobOpeningsErrorMessage] = useState<string | null>(null)
  const [pendingJobOpeningId, setPendingJobOpeningId] = useState<string | null>(null)
  // Only the latest request may update state, so a slow, older response never overwrites a newer one.
  const latestRequestNumberRef = useRef<number>(0)
  const isHookMountedRef = useRef<boolean>(true)

  const fetchLatestSnapshot = useCallback(async (): Promise<void> => {
    latestRequestNumberRef.current += 1
    const requestNumber = latestRequestNumberRef.current
    const isLatestRequest = (): boolean =>
      isHookMountedRef.current && requestNumber === latestRequestNumberRef.current
    try {
      const shopIds = ownerShopIdsKey === '' ? [] : ownerShopIdsKey.split(',')
      const [jobOpenings, shopPublishEligibility] = await Promise.all([
        jobOpeningService.listOwnJobOpenings(),
        jobOpeningService.loadShopPublishEligibility(shopIds),
      ])
      if (isLatestRequest()) {
        setSnapshot({ jobOpenings, shopPublishEligibility, loadedAt: new Date() })
        setJobOpeningsErrorMessage(null)
      }
    } catch (loadError) {
      if (isLatestRequest()) {
        setJobOpeningsErrorMessage(toDisplayErrorMessage(loadError, loadFailedMessage))
      }
    } finally {
      if (isLatestRequest()) {
        setIsLoadingJobOpenings(false)
      }
    }
  }, [jobOpeningService, ownerShopIdsKey])

  useEffect(() => {
    isHookMountedRef.current = true
    void fetchLatestSnapshot()
    return (): void => {
      isHookMountedRef.current = false
    }
  }, [fetchLatestSnapshot])

  const reloadJobOpenings = useCallback(async (): Promise<void> => {
    setIsLoadingJobOpenings(true)
    setJobOpeningsErrorMessage(null)
    await fetchLatestSnapshot()
  }, [fetchLatestSnapshot])

  const transitionJobOpening = useCallback(
    async (jobOpening: JobOpening, toStatus: JobOpeningStatus): Promise<boolean> => {
      const actionCopy = jobOpeningActionCopy[toTransitionAction(jobOpening.status, toStatus)]
      setPendingJobOpeningId(jobOpening.id)
      const transitionedJobOpening = await runServiceActionWithToast(
        () => jobOpeningService.transition(jobOpening, toStatus),
        {
          successMessage: actionCopy.successMessage,
          fallbackErrorMessage: 'Could not change the job opening status.',
        },
      )
      // Refresh either way: a failure is often a stale status ("changed. Refresh and try again.").
      await fetchLatestSnapshot()
      setPendingJobOpeningId(null)
      return transitionedJobOpening !== null
    },
    [fetchLatestSnapshot, jobOpeningService],
  )

  const deleteJobOpeningDraft = useCallback(
    async (jobOpening: JobOpening): Promise<boolean> => {
      setPendingJobOpeningId(jobOpening.id)
      const didDelete = await runServiceActionWithToast(
        async () => {
          await jobOpeningService.deleteDraft(jobOpening)
          return true
        },
        {
          successMessage: jobOpeningActionCopy.delete.successMessage,
          fallbackErrorMessage: 'Could not delete the job opening draft.',
        },
      )
      await fetchLatestSnapshot()
      setPendingJobOpeningId(null)
      return didDelete !== null
    },
    [fetchLatestSnapshot, jobOpeningService],
  )

  const saveJobOpening = useCallback(
    async (
      existingJobOpening: JobOpening | null,
      shopId: string,
      saveJobOpeningInput: SaveJobOpeningInput,
    ): Promise<boolean> => {
      const savedJobOpening = await runServiceActionWithToast(
        () =>
          existingJobOpening === null
            ? jobOpeningService.createDraft(shopId, saveJobOpeningInput)
            : jobOpeningService.updateJobOpening(existingJobOpening, saveJobOpeningInput),
        {
          successMessage: existingJobOpening === null ? 'Draft saved.' : 'Job opening saved.',
          fallbackErrorMessage: 'Could not save the job opening.',
        },
      )
      await fetchLatestSnapshot()
      return savedJobOpening !== null
    },
    [fetchLatestSnapshot, jobOpeningService],
  )

  return {
    jobOpenings: snapshot.jobOpenings,
    shopPublishEligibility: snapshot.shopPublishEligibility,
    loadedAt: snapshot.loadedAt,
    isLoadingJobOpenings,
    jobOpeningsErrorMessage,
    isJobOpeningListEmpty:
      !isLoadingJobOpenings &&
      jobOpeningsErrorMessage === null &&
      snapshot.jobOpenings.length === 0,
    isJobOpeningListTruncated: snapshot.jobOpenings.length >= jobOpeningLimits.ownListMaximum,
    pendingJobOpeningId,
    reloadJobOpenings,
    transitionJobOpening,
    deleteJobOpeningDraft,
    saveJobOpening,
  }
}
