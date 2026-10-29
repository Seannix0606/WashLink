import { useCallback, useRef, useState } from 'react'
import { stalePlatformReviewMessage } from '../../domain/models/CertificationPlatformReview'
import { staleContractDisputeMessage } from '../../domain/models/ContractDispute'
import { staleCertificationMessage } from '../../domain/models/Certification'
import { staleContractTemplateMessage } from '../../domain/models/ContractTemplate'
import { staleModerationCaseMessage } from '../../domain/models/JobOpeningModeration'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

const staleMessages: readonly string[] = [
  stalePlatformReviewMessage,
  staleContractDisputeMessage,
  staleCertificationMessage,
  // W14: a moderation case or the standard template changed since it was read.
  staleModerationCaseMessage,
  staleContractTemplateMessage,
]

export interface UseOversightActionRunnerResult {
  /** The key of the action that is running (for example `withdraw:<id>`). */
  readonly pendingActionKey: string | null
  readonly runAction: <Result>(
    actionKey: string,
    performAction: () => Promise<Result>,
    successMessage: string,
    fallbackErrorMessage: string,
  ) => Promise<Result | null>
}

/**
 * W11 actions with sonner feedback. One action at a time; the data is re-read after every
 * action. A 55000 "changed" answer is reported as such and never as success.
 */
export function useOversightActionRunner(refreshAfterAction: () => Promise<void>): UseOversightActionRunnerResult {
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const isRunningRef = useRef<boolean>(false)

  const runAction = useCallback(
    async <Result>(
      actionKey: string,
      performAction: () => Promise<Result>,
      successMessage: string,
      fallbackErrorMessage: string,
    ): Promise<Result | null> => {
      if (isRunningRef.current) {
        return null
      }
      isRunningRef.current = true
      setPendingActionKey(actionKey)
      let actionResult: Result | null = null
      try {
        actionResult = await performAction()
        applicationToast.success(successMessage)
      } catch (actionError) {
        const errorMessage = toDisplayErrorMessage(actionError, fallbackErrorMessage)
        applicationToast.error(staleMessages.includes(errorMessage) ? `${errorMessage} It was reloaded.` : errorMessage)
      }
      await refreshAfterAction()
      isRunningRef.current = false
      setPendingActionKey(null)
      return actionResult
    },
    [refreshAfterAction],
  )

  return { pendingActionKey, runAction }
}
