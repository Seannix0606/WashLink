import { useCallback, useRef, useState } from 'react'
import type { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import { applicationToast } from '../design/ui'
import { reportSentText } from '../utilities/jobOpeningModerationCopy'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export interface UseReportJobOpeningResult {
  readonly isSubmitting: boolean
  readonly errorMessage: string | null
  readonly clearError: () => void
  /** Resolves true when the report was recorded. */
  readonly sendReport: (jobOpeningId: string, category: string, statement: string) => Promise<boolean>
}

/** A worker reports a job opening (D-50). Refusals show the database's own text in the dialog. */
export function useReportJobOpening(moderationService: JobOpeningModerationService): UseReportJobOpeningResult {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isRunningRef = useRef<boolean>(false)

  const sendReport = useCallback(
    async (jobOpeningId: string, category: string, statement: string): Promise<boolean> => {
      if (isRunningRef.current) {
        return false
      }
      isRunningRef.current = true
      setIsSubmitting(true)
      setErrorMessage(null)
      try {
        await moderationService.reportOpening(jobOpeningId, category, statement)
        applicationToast.success(reportSentText)
        return true
      } catch (reportError) {
        setErrorMessage(toDisplayErrorMessage(reportError, 'Could not send the report.'))
        return false
      } finally {
        isRunningRef.current = false
        setIsSubmitting(false)
      }
    },
    [moderationService],
  )

  const clearError = useCallback((): void => {
    setErrorMessage(null)
  }, [])

  return { isSubmitting, errorMessage, clearError, sendReport }
}
