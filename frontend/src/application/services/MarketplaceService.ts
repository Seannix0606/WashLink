import type { JobOpening } from '../../domain/models/JobOpening'
import type {
  MarketplaceJobOpening,
  MarketplaceSearchFilters,
  MarketplaceSearchPage,
} from '../../domain/models/MarketplaceJobOpening'
import type { MarketplaceRepository } from '../../domain/repositories/MarketplaceRepository'
import {
  marketplaceSearchFiltersSchema,
  marketplaceSearchPageSchema,
} from '../validation/jobApplicationSchemas'

export class MarketplaceSearchValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'MarketplaceSearchValidationError'
  }
}

/** Worker job search. Filters are checked here and again by search_job_openings. */
export class MarketplaceService {
  public constructor(private readonly marketplaceRepository: MarketplaceRepository) {}

  public async searchJobOpenings(
    marketplaceSearchFilters: MarketplaceSearchFilters,
    marketplaceSearchPage: MarketplaceSearchPage,
  ): Promise<MarketplaceJobOpening[]> {
    const filtersResult = marketplaceSearchFiltersSchema.safeParse(marketplaceSearchFilters)
    if (!filtersResult.success) {
      throw new MarketplaceSearchValidationError(
        filtersResult.error.issues.at(0)?.message ?? 'Check the search filters.',
      )
    }
    const pageResult = marketplaceSearchPageSchema.safeParse(marketplaceSearchPage)
    if (!pageResult.success) {
      throw new MarketplaceSearchValidationError(
        pageResult.error.issues.at(0)?.message ?? 'Check the search filters.',
      )
    }
    return this.marketplaceRepository.searchJobOpenings(filtersResult.data, pageResult.data)
  }

  public async fetchJobOpening(jobOpeningId: string): Promise<JobOpening | null> {
    return this.marketplaceRepository.fetchJobOpening(jobOpeningId)
  }
}
