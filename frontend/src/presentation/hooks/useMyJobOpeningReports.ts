import { useCallback } from 'react'
import type { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import type { MyJobOpeningReport } from '../../domain/models/JobOpeningModeration'
import { reportWithdrawnText } from '../utilities/jobOpeningModerationCopy'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

const noReports: readonly MyJobOpeningReport[] = []

export interface UseMyJobOpeningReportsResult {
  readonly reports: readonly MyJobOpeningReport[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly pendingActionKey: string | null
  readonly withdraw: (report: MyJobOpeningReport) => Promise<void>
  readonly reload: () => Promise<void>
  readonly refresh: () => Promise<void>
}

/** The worker's own reports with the outcome kind only (D-53). */
export function useMyJobOpeningReports(moderationService: JobOpeningModerationService): UseMyJobOpeningReportsResult {
  const loadReports = useCallback(async (): Promise<readonly MyJobOpeningReport[]> => moderationService.listMyReports(), [moderationService])
  const reportsResource = useLatestResource({ load: loadReports, initialResource: noReports, loadFailedMessage: 'Could not load your reports.' })
  const { pendingActionKey, runAction } = useOversightActionRunner(reportsResource.refresh)

  const withdraw = useCallback(
    async (report: MyJobOpeningReport): Promise<void> => {
      await runAction(`withdraw:${report.reportId}`, async () => moderationService.withdrawReport(report), reportWithdrawnText, 'Could not withdraw the report.')
    },
    [moderationService, runAction],
  )

  return {
    reports: reportsResource.resource,
    isLoading: reportsResource.isLoading,
    errorMessage: reportsResource.errorMessage,
    isEmpty: !reportsResource.isLoading && reportsResource.errorMessage === null && reportsResource.resource.length === 0,
    pendingActionKey,
    withdraw,
    reload: reportsResource.reload,
    refresh: reportsResource.refresh,
  }
}
