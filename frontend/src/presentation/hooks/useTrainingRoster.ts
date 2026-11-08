import { useCallback, useState } from 'react'
import type { TrainingEnrollmentService } from '../../application/services/TrainingEnrollmentService'
import type { TrainingRosterEntry } from '../../domain/models/TrainingEnrollment'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'
import { useLatestResource } from './useLatestResource'

const noRosterEntries: readonly TrainingRosterEntry[] = []

export interface UseTrainingRosterResult {
  readonly rosterEntries: readonly TrainingRosterEntry[]
  readonly isLoadingRoster: boolean
  readonly rosterErrorMessage: string | null
  readonly isRosterEmpty: boolean
  readonly pendingEnrollmentId: string | null
  readonly reloadRoster: () => Promise<void>
  readonly refreshRoster: () => Promise<void>
  readonly cancelEnrollment: (rosterEntry: TrainingRosterEntry, reason: string) => Promise<boolean>
}

/** Trainees of one program with server progress; polled every 60 s while visible. */
export function useTrainingRoster(
  trainingEnrollmentService: TrainingEnrollmentService,
  programId: string,
): UseTrainingRosterResult {
  const [pendingEnrollmentId, setPendingEnrollmentId] = useState<string | null>(null)
  const loadRoster = useCallback(
    async (): Promise<readonly TrainingRosterEntry[]> => trainingEnrollmentService.listRoster(programId),
    [programId, trainingEnrollmentService],
  )
  const { resource, isLoading, errorMessage, reload, refresh } = useLatestResource({
    load: loadRoster,
    initialResource: noRosterEntries,
    loadFailedMessage: 'Could not load the trainees.',
    isPolling: true,
  })

  const cancelEnrollment = useCallback(
    async (rosterEntry: TrainingRosterEntry, reason: string): Promise<boolean> => {
      setPendingEnrollmentId(rosterEntry.enrollmentId)
      const cancelledEnrollment = await runServiceActionWithToast(
        () => trainingEnrollmentService.cancel(rosterEntry, reason),
        {
          successMessage: rosterEntry.enrollmentStatus === 'invited' ? 'Invitation withdrawn.' : 'Enrollment cancelled.',
          fallbackErrorMessage: 'Could not cancel the enrollment.',
        },
      )
      await refresh()
      setPendingEnrollmentId(null)
      return cancelledEnrollment !== null
    },
    [refresh, trainingEnrollmentService],
  )

  return {
    rosterEntries: resource,
    isLoadingRoster: isLoading,
    rosterErrorMessage: errorMessage,
    isRosterEmpty: !isLoading && errorMessage === null && resource.length === 0,
    pendingEnrollmentId,
    reloadRoster: reload,
    refreshRoster: refresh,
    cancelEnrollment,
  }
}
