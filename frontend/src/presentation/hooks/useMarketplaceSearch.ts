import { useCallback, useEffect, useRef, useState } from 'react'
import type { MarketplaceService } from '../../application/services/MarketplaceService'
import type { JobApplicationStatus } from '../../domain/models/JobApplication'
import {
  emptyMarketplaceSearchFilters,
  marketplaceSearchLimits,
  type MarketplaceJobOpening,
  type MarketplaceSearchFilters,
} from '../../domain/models/MarketplaceJobOpening'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const searchFailedMessage = 'Could not search job openings.'

export interface UseMarketplaceSearchResult {
  readonly appliedFilters: MarketplaceSearchFilters
  readonly jobOpenings: readonly MarketplaceJobOpening[]
  readonly isLoadingJobOpenings: boolean
  readonly isLoadingMoreJobOpenings: boolean
  readonly searchErrorMessage: string | null
  /** True once loaded without error and nothing matched. */
  readonly isSearchResultEmpty: boolean
  /** A full page came back and the offset limit is not reached. */
  readonly hasMoreJobOpenings: boolean
  readonly searchJobOpenings: (marketplaceSearchFilters: MarketplaceSearchFilters) => Promise<void>
  readonly loadMoreJobOpenings: () => Promise<void>
  readonly reloadJobOpenings: () => Promise<void>
  /** Shows the new status on the card right after applying, before the next search. */
  readonly markApplicationStatus: (jobOpeningId: string, status: JobApplicationStatus) => void
}

export function useMarketplaceSearch(marketplaceService: MarketplaceService): UseMarketplaceSearchResult {
  const [appliedFilters, setAppliedFilters] = useState<MarketplaceSearchFilters>(
    emptyMarketplaceSearchFilters,
  )
  const [jobOpenings, setJobOpenings] = useState<readonly MarketplaceJobOpening[]>([])
  const [isLoadingJobOpenings, setIsLoadingJobOpenings] = useState<boolean>(true)
  const [isLoadingMoreJobOpenings, setIsLoadingMoreJobOpenings] = useState<boolean>(false)
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null)
  const [hasMoreJobOpenings, setHasMoreJobOpenings] = useState<boolean>(false)
  // Only the latest request may update state, so an older, slower response never wins.
  const latestRequestNumberRef = useRef<number>(0)
  const isHookMountedRef = useRef<boolean>(true)

  const fetchPage = useCallback(
    async (marketplaceSearchFilters: MarketplaceSearchFilters, offset: number): Promise<void> => {
      latestRequestNumberRef.current += 1
      const requestNumber = latestRequestNumberRef.current
      const isLatestRequest = (): boolean =>
        isHookMountedRef.current && requestNumber === latestRequestNumberRef.current
      const pageSize = marketplaceSearchLimits.pageSize
      try {
        const pageOfOpenings = await marketplaceService.searchJobOpenings(marketplaceSearchFilters, {
          limit: pageSize,
          offset,
        })
        if (isLatestRequest()) {
          setJobOpenings((previousOpenings) =>
            offset === 0 ? pageOfOpenings : [...previousOpenings, ...pageOfOpenings],
          )
          setHasMoreJobOpenings(
            pageOfOpenings.length === pageSize &&
              offset + pageSize <= marketplaceSearchLimits.offsetMaximum,
          )
          setSearchErrorMessage(null)
        }
      } catch (searchError) {
        if (isLatestRequest()) {
          const errorMessage = toDisplayErrorMessage(searchError, searchFailedMessage)
          // A failed "load more" keeps the results already shown.
          if (offset === 0) {
            setSearchErrorMessage(errorMessage)
          } else {
            applicationToast.error(errorMessage)
          }
        }
      } finally {
        if (isLatestRequest()) {
          setIsLoadingJobOpenings(false)
          setIsLoadingMoreJobOpenings(false)
        }
      }
    },
    [marketplaceService],
  )

  useEffect(() => {
    isHookMountedRef.current = true
    void fetchPage(emptyMarketplaceSearchFilters, 0)
    return (): void => {
      isHookMountedRef.current = false
    }
  }, [fetchPage])

  const searchJobOpenings = useCallback(
    async (marketplaceSearchFilters: MarketplaceSearchFilters): Promise<void> => {
      setAppliedFilters(marketplaceSearchFilters)
      setIsLoadingJobOpenings(true)
      setSearchErrorMessage(null)
      await fetchPage(marketplaceSearchFilters, 0)
    },
    [fetchPage],
  )

  const loadMoreJobOpenings = useCallback(async (): Promise<void> => {
    setIsLoadingMoreJobOpenings(true)
    await fetchPage(appliedFilters, jobOpenings.length)
  }, [appliedFilters, fetchPage, jobOpenings.length])

  const reloadJobOpenings = useCallback(
    async (): Promise<void> => searchJobOpenings(appliedFilters),
    [appliedFilters, searchJobOpenings],
  )

  const markApplicationStatus = useCallback(
    (jobOpeningId: string, status: JobApplicationStatus): void => {
      setJobOpenings((previousOpenings) =>
        previousOpenings.map((jobOpening) =>
          jobOpening.jobOpeningId === jobOpeningId
            ? { ...jobOpening, myApplicationStatus: status }
            : jobOpening,
        ),
      )
    },
    [],
  )

  return {
    appliedFilters,
    jobOpenings,
    isLoadingJobOpenings,
    isLoadingMoreJobOpenings,
    searchErrorMessage,
    isSearchResultEmpty:
      !isLoadingJobOpenings && searchErrorMessage === null && jobOpenings.length === 0,
    hasMoreJobOpenings,
    searchJobOpenings,
    loadMoreJobOpenings,
    reloadJobOpenings,
    markApplicationStatus,
  }
}
