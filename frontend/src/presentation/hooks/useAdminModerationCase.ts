import { useCallback, useMemo } from 'react'
import type { JobOpeningModerationService, ModerationDecisionRequest } from '../../application/services/JobOpeningModerationService'
import { moderationActionKinds, type AdminModerationCase, type ModerationActionKind } from '../../domain/models/JobOpeningModeration'
import { moderationActionSuccessText } from '../utilities/jobOpeningModerationCopy'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

export interface UseAdminModerationCaseResult {
  readonly moderationCase: AdminModerationCase | null
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly availableActions: readonly ModerationActionKind[]
  readonly isDeciding: boolean
  readonly decide: (request: ModerationDecisionRequest) => Promise<boolean>
  readonly reload: () => Promise<void>
}

const noActions: readonly ModerationActionKind[] = []

/**
 * Super_admin: one posting report case. Every read writes an audit row in the database, so the
 * case is read once when the drawer opens and once after an action (never polled).
 */
export function useAdminModerationCase(
  moderationService: JobOpeningModerationService,
  caseId: string,
  onDecided: () => Promise<void>,
): UseAdminModerationCaseResult {
  const loadCase = useCallback(async (): Promise<AdminModerationCase | null> => moderationService.loadAdminCase(caseId), [moderationService, caseId])
  const caseResource = useLatestResource<AdminModerationCase | null>({
    load: loadCase,
    initialResource: null,
    loadFailedMessage: 'Could not load this case.',
  })
  const { refresh } = caseResource
  const refreshAfterDecision = useCallback(async (): Promise<void> => {
    await Promise.all([refresh(), onDecided()])
  }, [refresh, onDecided])
  const { pendingActionKey, runAction } = useOversightActionRunner(refreshAfterDecision)
  const moderationCase = caseResource.resource

  const availableActions = useMemo(
    () => (moderationCase === null ? noActions : moderationService.availableActions(moderationCase)),
    [moderationCase, moderationService],
  )

  const decide = useCallback(
    async (request: ModerationDecisionRequest): Promise<boolean> => {
      if (moderationCase === null) {
        return false
      }
      const actionKey = moderationActionKinds.find((candidate) => candidate === request.action)
      const successText = actionKey === undefined ? 'The decision was recorded.' : moderationActionSuccessText[actionKey]
      const record = await runAction(
        `moderate:${moderationCase.moderationCase.caseId}`,
        async () => moderationService.moderate(moderationCase, request),
        successText,
        'Could not record the moderation decision.',
      )
      return record !== null
    },
    [moderationCase, moderationService, runAction],
  )

  return {
    moderationCase,
    isLoading: caseResource.isLoading,
    errorMessage: caseResource.errorMessage,
    availableActions,
    isDeciding: pendingActionKey !== null,
    decide,
    reload: caseResource.reload,
  }
}
