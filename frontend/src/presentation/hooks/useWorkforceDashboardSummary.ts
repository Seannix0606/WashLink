import { useCallback } from 'react'
import type { WorkforceDashboardService } from '../../application/services/WorkforceDashboardService'
import type { WorkforceDashboardRole, WorkforceDashboardSummaryByRole } from '../../domain/models/WorkforceDashboardSummary'
import { useLatestResource } from './useLatestResource'

const summaryLoadFailedMessage: Readonly<Record<WorkforceDashboardRole, string>> = {
  worker: 'Could not load your overview.',
  owner: 'Could not load your workforce overview.',
  super_admin: 'Could not load the overview.',
}

export interface UseWorkforceDashboardSummaryResult<Summary> {
  /** Null while loading, after an error, or when the database returned no row for this account. */
  readonly summary: Summary | null
  readonly isLoading: boolean
  readonly errorMessage: string | null
  /** Loaded without error, but the database returned no row (not this role). */
  readonly isUnavailable: boolean
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/**
 * One W11 summary for the given role (P65). Polled every 60 s while the page is visible and on
 * focus (usePollWhileVisible); the counts are never computed in the client. Without a service
 * (older callers) there is no summary and nothing is read.
 */
export function useWorkforceDashboardSummary<Role extends WorkforceDashboardRole>(
  workforceDashboardService: WorkforceDashboardService | undefined,
  role: Role,
): UseWorkforceDashboardSummaryResult<WorkforceDashboardSummaryByRole[Role]> {
  const loadSummary = useCallback(
    async (): Promise<WorkforceDashboardSummaryByRole[Role] | null> =>
      workforceDashboardService === undefined ? null : workforceDashboardService.loadSummary(role),
    [workforceDashboardService, role],
  )
  const summaryResource = useLatestResource<WorkforceDashboardSummaryByRole[Role] | null>({
    load: loadSummary,
    initialResource: null,
    loadFailedMessage: summaryLoadFailedMessage[role],
    isPolling: workforceDashboardService !== undefined,
  })
  const hasLoaded = !summaryResource.isLoading && summaryResource.errorMessage === null
  return {
    summary: hasLoaded ? summaryResource.resource : null,
    isLoading: summaryResource.isLoading,
    errorMessage: summaryResource.errorMessage,
    isUnavailable: hasLoaded && summaryResource.resource === null,
    reload: summaryResource.reload,
    refresh: summaryResource.refresh,
  }
}
