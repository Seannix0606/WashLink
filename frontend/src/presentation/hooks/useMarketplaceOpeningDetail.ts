import { useCallback, useEffect, useState } from 'react'
import type { MarketplaceService } from '../../application/services/MarketplaceService'
import type { JobOpening } from '../../domain/models/JobOpening'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const loadFailedMessage = 'Could not load the job opening.'
export const openingNoLongerAvailableMessage =
  'This job opening is no longer available. It may have been paused or closed.'

interface OpeningDetailState {
  readonly requestKey: string
  readonly jobOpening: JobOpening | null
  readonly errorMessage: string | null
}

export interface UseMarketplaceOpeningDetailResult {
  readonly jobOpening: JobOpening | null
  readonly isLoadingJobOpening: boolean
  readonly jobOpeningErrorMessage: string | null
  readonly reloadJobOpening: () => void
}

/** The current opening for the detail view; a null id means nothing is selected. */
export function useMarketplaceOpeningDetail(
  marketplaceService: MarketplaceService,
  jobOpeningId: string | null,
): UseMarketplaceOpeningDetailResult {
  const [reloadNumber, setReloadNumber] = useState<number>(0)
  const [detailState, setDetailState] = useState<OpeningDetailState | null>(null)
  const requestKey = `${String(reloadNumber)}:${jobOpeningId ?? ''}`

  useEffect(() => {
    if (jobOpeningId === null) {
      return
    }
    let isEffectCurrent = true
    const loadOpening = async (): Promise<void> => {
      try {
        const loadedOpening = await marketplaceService.fetchJobOpening(jobOpeningId)
        if (isEffectCurrent) {
          setDetailState({
            requestKey,
            jobOpening: loadedOpening,
            errorMessage: loadedOpening === null ? openingNoLongerAvailableMessage : null,
          })
        }
      } catch (loadError) {
        if (isEffectCurrent) {
          setDetailState({
            requestKey,
            jobOpening: null,
            errorMessage: toDisplayErrorMessage(loadError, loadFailedMessage),
          })
        }
      }
    }
    void loadOpening()
    return (): void => {
      isEffectCurrent = false
    }
  }, [jobOpeningId, marketplaceService, requestKey])

  const reloadJobOpening = useCallback((): void => {
    setReloadNumber((previousNumber) => previousNumber + 1)
  }, [])

  const isCurrent = jobOpeningId !== null && detailState?.requestKey === requestKey
  return {
    jobOpening: isCurrent ? detailState.jobOpening : null,
    isLoadingJobOpening: jobOpeningId !== null && !isCurrent,
    jobOpeningErrorMessage: isCurrent ? detailState.errorMessage : null,
    reloadJobOpening,
  }
}
