import { useCallback, useEffect, useState } from 'react'
import type {
  ApplicantPipelineService,
  ApplicationCountByOpening,
} from '../../application/services/ApplicantPipelineService'

export interface UseJobOpeningApplicationCountsResult {
  /** Missing entries mean zero applications once loaded. */
  readonly applicationCountByOpening: ApplicationCountByOpening
  readonly hasLoadedApplicationCounts: boolean
  readonly refreshApplicationCounts: () => void
}

interface ApplicationCountsState {
  readonly requestKey: string
  readonly applicationCountByOpening: ApplicationCountByOpening
  readonly hasLoaded: boolean
}

/** Application counts per opening for the owner list. A failed count is just not shown. */
export function useJobOpeningApplicationCounts(
  applicantPipelineService: ApplicantPipelineService,
  jobOpeningIds: readonly string[],
): UseJobOpeningApplicationCountsResult {
  const jobOpeningIdsKey = jobOpeningIds.join(',')
  const [refreshNumber, setRefreshNumber] = useState<number>(0)
  const [countsState, setCountsState] = useState<ApplicationCountsState | null>(null)
  const requestKey = `${String(refreshNumber)}:${jobOpeningIdsKey}`

  useEffect(() => {
    let isEffectCurrent = true
    const openingIds = jobOpeningIdsKey === '' ? [] : jobOpeningIdsKey.split(',')
    const loadCounts = async (): Promise<void> => {
      try {
        const loadedCounts = await applicantPipelineService.countApplicationsByOpening(openingIds)
        if (isEffectCurrent) {
          setCountsState({ requestKey, applicationCountByOpening: loadedCounts, hasLoaded: true })
        }
      } catch {
        if (isEffectCurrent) {
          setCountsState({ requestKey, applicationCountByOpening: {}, hasLoaded: false })
        }
      }
    }
    void loadCounts()
    return (): void => {
      isEffectCurrent = false
    }
  }, [applicantPipelineService, jobOpeningIdsKey, requestKey])

  const refreshApplicationCounts = useCallback((): void => {
    setRefreshNumber((previousNumber) => previousNumber + 1)
  }, [])

  return {
    applicationCountByOpening: countsState?.applicationCountByOpening ?? {},
    hasLoadedApplicationCounts: countsState?.hasLoaded === true,
    refreshApplicationCounts,
  }
}
