import type { JobOpening } from '../models/JobOpening'
import type {
  MarketplaceJobOpening,
  MarketplaceSearchFilters,
  MarketplaceSearchPage,
} from '../models/MarketplaceJobOpening'

/** Worker job search. Row visibility is decided by RLS (search_job_openings is security invoker). */
export interface MarketplaceRepository {
  searchJobOpenings(
    marketplaceSearchFilters: MarketplaceSearchFilters,
    marketplaceSearchPage: MarketplaceSearchPage,
  ): Promise<MarketplaceJobOpening[]>
  /** The current opening, or null when the worker can no longer read it. */
  fetchJobOpening(jobOpeningId: string): Promise<JobOpening | null>
}
