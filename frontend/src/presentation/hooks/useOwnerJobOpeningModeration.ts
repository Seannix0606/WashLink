import { useCallback, useMemo } from 'react'
import type { JobOpeningModerationService } from '../../application/services/JobOpeningModerationService'
import type { OwnerJobOpeningModeration } from '../../domain/models/JobOpeningModeration'
import { askWashLinkSentText } from '../utilities/jobOpeningModerationCopy'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

const noModeration: readonly OwnerJobOpeningModeration[] = []

export interface UseOwnerJobOpeningModerationResult {
  /** The latest decided case per job opening (the RPC lists active holds first). */
  readonly moderationByOpeningId: ReadonlyMap<string, OwnerJobOpeningModeration>
  readonly errorMessage: string | null
  readonly isSubmitting: boolean
  readonly submitChanges: (moderation: OwnerJobOpeningModeration, note: string) => Promise<boolean>
  readonly refresh: () => Promise<void>
}

async function loadNothing(): Promise<readonly OwnerJobOpeningModeration[]> {
  return Promise.resolve(noModeration)
}

/**
 * The owner's WashLink notices for their own openings (D-52, D-53): reason, message and history
 * only, never reports. Without a service (callers that predate W14) nothing is read.
 */
export function useOwnerJobOpeningModeration(moderationService: JobOpeningModerationService | undefined): UseOwnerJobOpeningModerationResult {
  const loadModeration = useCallback(
    async (): Promise<readonly OwnerJobOpeningModeration[]> =>
      moderationService === undefined ? loadNothing() : moderationService.listOwnerModeration(),
    [moderationService],
  )
  const moderationResource = useLatestResource({
    load: loadModeration,
    initialResource: noModeration,
    loadFailedMessage: 'Could not load WashLink notices for your job openings.',
    isPolling: moderationService !== undefined,
  })
  const { pendingActionKey, runAction } = useOversightActionRunner(moderationResource.refresh)

  const moderationByOpeningId = useMemo(() => {
    const byOpening = new Map<string, OwnerJobOpeningModeration>()
    for (const moderation of moderationResource.resource) {
      if (!byOpening.has(moderation.jobOpeningId)) {
        byOpening.set(moderation.jobOpeningId, moderation)
      }
    }
    return byOpening
  }, [moderationResource.resource])

  const submitChanges = useCallback(
    async (moderation: OwnerJobOpeningModeration, note: string): Promise<boolean> => {
      if (moderationService === undefined) {
        return false
      }
      const record = await runAction(
        `submit:${moderation.caseId}`,
        async () => moderationService.submitChanges(moderation, note),
        askWashLinkSentText,
        'Could not ask WashLink to check the job opening.',
      )
      return record !== null
    },
    [moderationService, runAction],
  )

  return {
    moderationByOpeningId,
    errorMessage: moderationResource.errorMessage,
    isSubmitting: pendingActionKey !== null,
    submitChanges,
    refresh: moderationResource.refresh,
  }
}
