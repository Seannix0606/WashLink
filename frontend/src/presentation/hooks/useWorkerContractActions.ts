import { useCallback, useRef, useState } from 'react'
import {
  changedFlagCountMessage,
  staleContractAcceptMessage,
  staleContractMessage,
} from '../../domain/models/WorkerContract'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

/** 55000 answers: the contract (or its keyword check) changed on the server; reload, never success. */
const staleMessages: readonly string[] = [staleContractMessage, staleContractAcceptMessage, changedFlagCountMessage]

export function isStaleContractMessage(message: string): boolean {
  return staleMessages.includes(message)
}

export interface UseWorkerContractActionsResult {
  /** The action key (for example `send:<contract id>`) that is running. */
  readonly pendingActionKey: string | null
  /** The last action's error, kept for the open form (also shown as a toast). */
  readonly lastErrorMessage: string | null
  readonly clearError: () => void
  readonly runAction: <Result>(
    actionKey: string,
    performAction: () => Promise<Result>,
    successMessage: string,
    fallbackErrorMessage: string,
  ) => Promise<Result | null>
}

/**
 * Contract actions with plain-text feedback. Every action re-reads the contract list after
 * it ends; a stale answer is reported as such (the list reloads) and never as success.
 */
export function useWorkerContractActions(refreshAfterAction: () => Promise<void>): UseWorkerContractActionsResult {
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null)
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null)
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
      setLastErrorMessage(null)
      let actionResult: Result | null = null
      try {
        actionResult = await performAction()
        applicationToast.success(successMessage)
      } catch (actionError) {
        const errorMessage = toDisplayErrorMessage(actionError, fallbackErrorMessage)
        const shownMessage = isStaleContractMessage(errorMessage) ? `${errorMessage} The contract was reloaded.` : errorMessage
        setLastErrorMessage(shownMessage)
        applicationToast.error(shownMessage)
      }
      await refreshAfterAction()
      isRunningRef.current = false
      setPendingActionKey(null)
      return actionResult
    },
    [refreshAfterAction],
  )

  const clearError = useCallback((): void => {
    setLastErrorMessage(null)
  }, [])

  return { pendingActionKey, lastErrorMessage, clearError, runAction }
}
