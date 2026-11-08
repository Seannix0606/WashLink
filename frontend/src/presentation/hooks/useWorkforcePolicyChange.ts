import { useCallback, useState } from 'react'
import {
  WorkforcePolicyValidationError,
  type WorkforcePolicyFieldErrors,
  type WorkforcePolicyService,
} from '../../application/services/WorkforcePolicyService'
import { policyStaleMessage, workforcePolicyFieldForMessage } from '../../application/validation/workforcePolicySchemas'
import type { WorkforcePolicy } from '../../domain/models/WorkforcePolicy'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const changeFailedMessage = 'Could not change the policy.'
const noFieldErrors: WorkforcePolicyFieldErrors = {}

export interface UseWorkforcePolicyChangeResult {
  readonly isSubmitting: boolean
  readonly fieldErrors: WorkforcePolicyFieldErrors
  /** Resolves true when the database recorded the change. */
  readonly submitChange: (policy: WorkforcePolicy, valueText: string, changeReason: string) => Promise<boolean>
  readonly clearFieldErrors: () => void
}

/**
 * One policy change at a time. Field problems stay next to the field; a stale revision re-reads the
 * policies (via `onPoliciesChanged`) so the next attempt uses the current revision.
 */
export function useWorkforcePolicyChange(
  workforcePolicyService: WorkforcePolicyService,
  onPoliciesChanged: () => Promise<void>,
): UseWorkforcePolicyChangeResult {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [fieldErrors, setFieldErrors] = useState<WorkforcePolicyFieldErrors>(noFieldErrors)

  const submitChange = useCallback(
    async (policy: WorkforcePolicy, valueText: string, changeReason: string): Promise<boolean> => {
      setIsSubmitting(true)
      setFieldErrors(noFieldErrors)
      try {
        const changedPolicy = await workforcePolicyService.changeValue(policy, valueText, changeReason)
        applicationToast.success(`Progress goal changed to ${String(changedPolicy.integerValue)}.`)
        await onPoliciesChanged()
        return true
      } catch (changeError) {
        if (changeError instanceof WorkforcePolicyValidationError) {
          setFieldErrors(changeError.fieldErrors)
          return false
        }
        const errorMessage = toDisplayErrorMessage(changeError, changeFailedMessage)
        const field = workforcePolicyFieldForMessage(errorMessage)
        if (field !== null) {
          setFieldErrors({ [field]: errorMessage })
        } else {
          applicationToast.error(errorMessage)
        }
        if (errorMessage === policyStaleMessage) {
          await onPoliciesChanged()
        }
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [onPoliciesChanged, workforcePolicyService],
  )

  const clearFieldErrors = useCallback((): void => {
    setFieldErrors(noFieldErrors)
  }, [])

  return { isSubmitting, fieldErrors, submitChange, clearFieldErrors }
}
