import { useCallback, useState } from 'react'
import {
  JobApplicationValidationError,
  type JobApplicationService,
} from '../../application/services/JobApplicationService'
import type { JobApplication } from '../../domain/models/JobApplication'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export interface ApplyToJobOpeningRequest {
  readonly jobOpeningId: string
  /** Set when an existing draft is being submitted instead of a new application. */
  readonly existingDraft: JobApplication | null
  readonly coverNoteInput: string
  readonly hasAcknowledgedNotice: boolean
}

export interface UseApplyToJobOpeningResult {
  readonly isSubmittingApplication: boolean
  /** Inline error for the dialog (validation or a refusal from the database). */
  readonly applyErrorMessage: string | null
  readonly clearApplyError: () => void
  /** Resolves to the submitted application, or null when it failed. */
  readonly submitApplication: (applyRequest: ApplyToJobOpeningRequest) => Promise<JobApplication | null>
}

export function useApplyToJobOpening(jobApplicationService: JobApplicationService): UseApplyToJobOpeningResult {
  const [isSubmittingApplication, setIsSubmittingApplication] = useState<boolean>(false)
  const [applyErrorMessage, setApplyErrorMessage] = useState<string | null>(null)

  const clearApplyError = useCallback((): void => {
    setApplyErrorMessage(null)
  }, [])

  const submitApplication = useCallback(
    async (applyRequest: ApplyToJobOpeningRequest): Promise<JobApplication | null> => {
      setIsSubmittingApplication(true)
      setApplyErrorMessage(null)
      try {
        const submittedApplication =
          applyRequest.existingDraft === null
            ? await jobApplicationService.apply(
                applyRequest.jobOpeningId,
                applyRequest.coverNoteInput,
                applyRequest.hasAcknowledgedNotice,
              )
            : await jobApplicationService.submitDraft(
                applyRequest.existingDraft,
                applyRequest.coverNoteInput,
                applyRequest.hasAcknowledgedNotice,
              )
        applicationToast.success('Application sent. Track it in My applications.')
        return submittedApplication
      } catch (submitError) {
        const errorMessage = toDisplayErrorMessage(submitError, 'Could not send your application.')
        setApplyErrorMessage(errorMessage)
        if (!(submitError instanceof JobApplicationValidationError)) {
          applicationToast.error(errorMessage)
        }
        return null
      } finally {
        setIsSubmittingApplication(false)
      }
    },
    [jobApplicationService],
  )

  return { isSubmittingApplication, applyErrorMessage, clearApplyError, submitApplication }
}
