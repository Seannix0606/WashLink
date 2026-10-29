import { useCallback } from 'react'
import type { AdminOversightService } from '../../application/services/AdminOversightService'
import type { AdminModerationSummary } from '../../domain/models/AdminOversight'
import { useLatestResource, type UseLatestResourceResult } from './useLatestResource'

/** W14 second overview summary (`admin_moderation_summary()`); null for a non-admin (no invented zeros). */
export function useAdminModerationSummary(adminOversightService: AdminOversightService): UseLatestResourceResult<AdminModerationSummary | null> {
  const loadSummary = useCallback(async (): Promise<AdminModerationSummary | null> => adminOversightService.loadModerationSummary(), [adminOversightService])
  return useLatestResource<AdminModerationSummary | null>({
    load: loadSummary,
    initialResource: null,
    loadFailedMessage: 'Could not load the moderation counts.',
    isPolling: true,
  })
}
