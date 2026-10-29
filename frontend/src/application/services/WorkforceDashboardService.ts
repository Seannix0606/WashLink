import { emptyMarketplaceSearchFilters, type MarketplaceJobOpening } from '../../domain/models/MarketplaceJobOpening'
import type { WorkforceDashboardRole, WorkforceDashboardSummaryByRole } from '../../domain/models/WorkforceDashboardSummary'
import type { MarketplaceRepository } from '../../domain/repositories/MarketplaceRepository'
import type { WorkforceDashboardRepository } from '../../domain/repositories/WorkforceDashboardRepository'

/** D-43: the worker overview shows the newest few openings from the normal search, never a recommendation. */
export const latestOpeningsLimit = 3

/**
 * W11 dashboards (P65). Counts come only from the database summaries; this service never adds,
 * subtracts or estimates them. A null summary means the database returned no row (wrong role).
 */
export class WorkforceDashboardService {
  public constructor(
    private readonly workforceDashboardRepository: WorkforceDashboardRepository,
    private readonly marketplaceRepository?: MarketplaceRepository,
  ) {}

  public async loadSummary<Role extends WorkforceDashboardRole>(role: Role): Promise<WorkforceDashboardSummaryByRole[Role] | null> {
    const summaryLoaders: { readonly [Key in WorkforceDashboardRole]: () => Promise<WorkforceDashboardSummaryByRole[Key] | null> } = {
      worker: async () => this.workforceDashboardRepository.fetchWorkerSummary(),
      owner: async () => this.workforceDashboardRepository.fetchOwnerSummary(),
      super_admin: async () => this.workforceDashboardRepository.fetchAdminSummary(),
    }
    return summaryLoaders[role]()
  }

  /** The newest published openings (search_job_openings orders newest first); no ranking. */
  public async loadLatestOpenings(): Promise<MarketplaceJobOpening[]> {
    if (this.marketplaceRepository === undefined) {
      return []
    }
    return this.marketplaceRepository.searchJobOpenings(emptyMarketplaceSearchFilters, { limit: latestOpeningsLimit, offset: 0 })
  }
}
