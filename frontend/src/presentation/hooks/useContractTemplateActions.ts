import { useCallback, useState } from 'react'
import type { ContractTemplateService } from '../../application/services/ContractTemplateService'
import {
  staleContractTemplateMessage,
  type ContractTemplateRecord,
  type OwnerContractTemplate,
} from '../../domain/models/ContractTemplate'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

export interface UseContractTemplateActionsResult {
  /** The template (or 'new') whose action is running. */
  readonly pendingSubjectId: string | null
  readonly createFromStandard: (name: string) => Promise<ContractTemplateRecord | null>
  readonly createFromVersion: (name: string, versionId: string) => Promise<ContractTemplateRecord | null>
  readonly rename: (template: OwnerContractTemplate, name: string) => Promise<boolean>
  readonly archive: (template: OwnerContractTemplate) => Promise<boolean>
  readonly restore: (template: OwnerContractTemplate) => Promise<boolean>
}

const newTemplateSubjectId = 'new'

/**
 * Template list actions with plain-text feedback. Every action re-reads the list
 * afterwards; a stale template (55000) is reported and the list reloads, never success.
 */
export function useContractTemplateActions(
  contractTemplateService: ContractTemplateService,
  refreshAfterAction: () => Promise<void>,
): UseContractTemplateActionsResult {
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null)

  const runAction = useCallback(
    async <Result>(
      subjectId: string,
      performAction: () => Promise<Result>,
      successMessage: string,
      fallbackErrorMessage: string,
    ): Promise<Result | null> => {
      setPendingSubjectId(subjectId)
      let actionResult: Result | null = null
      try {
        actionResult = await performAction()
        applicationToast.success(successMessage)
      } catch (actionError) {
        const errorMessage = toDisplayErrorMessage(actionError, fallbackErrorMessage)
        applicationToast.error(errorMessage === staleContractTemplateMessage ? `${errorMessage} The list was reloaded.` : errorMessage)
      }
      await refreshAfterAction()
      setPendingSubjectId(null)
      return actionResult
    },
    [refreshAfterAction],
  )

  const createFromStandard = useCallback(
    async (name: string): Promise<ContractTemplateRecord | null> =>
      runAction(
        newTemplateSubjectId,
        async () => contractTemplateService.createFromStandard(name),
        'Template created from the standard.',
        'Could not create the template.',
      ),
    [contractTemplateService, runAction],
  )

  const createFromVersion = useCallback(
    async (name: string, versionId: string): Promise<ContractTemplateRecord | null> =>
      runAction(
        newTemplateSubjectId,
        async () => contractTemplateService.createFromVersion(name, versionId),
        'New template created from this version.',
        'Could not create the template.',
      ),
    [contractTemplateService, runAction],
  )

  const rename = useCallback(
    async (template: OwnerContractTemplate, name: string): Promise<boolean> =>
      (await runAction(
        template.templateId,
        async () => contractTemplateService.rename(template, name),
        'Template renamed.',
        'Could not rename the template.',
      )) !== null,
    [contractTemplateService, runAction],
  )

  const archive = useCallback(
    async (template: OwnerContractTemplate): Promise<boolean> =>
      (await runAction(
        template.templateId,
        async () => contractTemplateService.archive(template),
        'Template archived.',
        'Could not archive the template.',
      )) !== null,
    [contractTemplateService, runAction],
  )

  const restore = useCallback(
    async (template: OwnerContractTemplate): Promise<boolean> =>
      (await runAction(
        template.templateId,
        async () => contractTemplateService.restore(template),
        'Template restored.',
        'Could not restore the template.',
      )) !== null,
    [contractTemplateService, runAction],
  )

  return { pendingSubjectId, createFromStandard, createFromVersion, rename, archive, restore }
}
