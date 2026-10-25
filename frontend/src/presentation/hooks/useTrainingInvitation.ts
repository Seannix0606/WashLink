import { useCallback, useState } from 'react'
import type { TrainingEnrollmentService } from '../../application/services/TrainingEnrollmentService'
import { staleTrainingInvitationMessage, type MyTraining } from '../../domain/models/TrainingEnrollment'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export interface UseTrainingInvitationResult {
  readonly hasAcknowledgedNotice: boolean
  readonly setHasAcknowledgedNotice: (hasAcknowledged: boolean) => void
  readonly isAccepting: boolean
  /** Shown when the schedule changed after the worker opened the invitation. */
  readonly staleScheduleMessage: string | null
  /** True when the enrollment was accepted. */
  readonly acceptInvitation: () => Promise<boolean>
}

/**
 * Accepting an invitation. The acknowledgement starts unchecked every time; a changed
 * schedule (55000) re-reads the program and sessions and asks the worker to review again.
 */
export function useTrainingInvitation(
  trainingEnrollmentService: TrainingEnrollmentService,
  myTraining: MyTraining,
  refreshTrainings: () => Promise<void>,
): UseTrainingInvitationResult {
  const [hasAcknowledgedNotice, setHasAcknowledgedNotice] = useState<boolean>(false)
  const [isAccepting, setIsAccepting] = useState<boolean>(false)
  const [staleScheduleMessage, setStaleScheduleMessage] = useState<string | null>(null)

  const acceptInvitation = useCallback(async (): Promise<boolean> => {
    setIsAccepting(true)
    setStaleScheduleMessage(null)
    try {
      await trainingEnrollmentService.accept(myTraining, hasAcknowledgedNotice)
      applicationToast.success('You enrolled in the training.')
      await refreshTrainings()
      return true
    } catch (acceptError) {
      const errorMessage = toDisplayErrorMessage(acceptError, 'Could not accept the invitation.')
      if (errorMessage === staleTrainingInvitationMessage) {
        setHasAcknowledgedNotice(false)
        setStaleScheduleMessage('The shop changed the training schedule. Review the updated dates, then accept again.')
      } else {
        applicationToast.error(errorMessage)
      }
      await refreshTrainings()
      return false
    } finally {
      setIsAccepting(false)
    }
  }, [hasAcknowledgedNotice, myTraining, refreshTrainings, trainingEnrollmentService])

  return { hasAcknowledgedNotice, setHasAcknowledgedNotice, isAccepting, staleScheduleMessage, acceptInvitation }
}
