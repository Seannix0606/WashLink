import { useCallback, useState } from 'react'
import type { PlatformContractTemplateService, StandardContractEditorData } from '../../application/services/PlatformContractTemplateService'
import type { ContractTemplateVersionSummary } from '../../domain/models/ContractTemplate'
import type { StandardContractDraft } from '../../domain/models/PlatformContractTemplateDraft'
import { countStandardDraftChanges, updateStandardClause } from '../../domain/utilities/platformContractTemplateDraft'
import { publishedText } from '../utilities/standardContractCopy'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

const noVersions: readonly ContractTemplateVersionSummary[] = []

export interface UseStandardContractEditorResult {
  readonly editorData: StandardContractEditorData | null
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly history: readonly ContractTemplateVersionSummary[]
  /** The draft being edited (null until "Edit a new version"). */
  readonly draft: StandardContractDraft | null
  readonly changedClauseCount: number
  readonly draftProblem: string | null
  readonly isPublishing: boolean
  readonly startEditing: () => void
  readonly discard: () => void
  readonly changeClause: (clauseKey: string, change: { readonly heading?: string; readonly body?: string }) => void
  readonly publish: () => Promise<boolean>
  readonly reload: () => Promise<void>
}

/** Super_admin editor for a new standard version (W8 RPC). Locked clauses never change in the draft. */
export function useStandardContractEditor(platformTemplateService: PlatformContractTemplateService): UseStandardContractEditorResult {
  const loadEditor = useCallback(async (): Promise<StandardContractEditorData | null> => platformTemplateService.loadEditor(), [platformTemplateService])
  const editorResource = useLatestResource<StandardContractEditorData | null>({
    load: loadEditor,
    initialResource: null,
    loadFailedMessage: 'Could not load the standard template.',
  })
  const templateId = editorResource.resource?.standard.templateId ?? null
  const loadHistory = useCallback(
    async (): Promise<readonly ContractTemplateVersionSummary[]> => (templateId === null ? noVersions : platformTemplateService.listHistory(templateId)),
    [platformTemplateService, templateId],
  )
  const historyResource = useLatestResource({ load: loadHistory, initialResource: noVersions, loadFailedMessage: 'Could not load the version history.' })
  const [draft, setDraft] = useState<StandardContractDraft | null>(null)
  const { refresh } = editorResource
  const refreshHistory = historyResource.refresh
  const refreshAfterPublish = useCallback(async (): Promise<void> => {
    await Promise.all([refresh(), refreshHistory()])
  }, [refresh, refreshHistory])
  const { pendingActionKey, runAction } = useOversightActionRunner(refreshAfterPublish)

  const startEditing = useCallback((): void => {
    setDraft(editorResource.resource?.draft ?? null)
  }, [editorResource.resource])

  const discard = useCallback((): void => {
    setDraft(null)
  }, [])

  const changeClause = useCallback((clauseKey: string, change: { readonly heading?: string; readonly body?: string }): void => {
    setDraft((currentDraft) => (currentDraft === null ? null : updateStandardClause(currentDraft, clauseKey, change)))
  }, [])

  const publish = useCallback(async (): Promise<boolean> => {
    if (draft === null) {
      return false
    }
    const published = await runAction(
      'publish:standard',
      async () => platformTemplateService.publish(draft),
      publishedText,
      'Could not publish the standard template.',
    )
    if (published === null) {
      return false
    }
    setDraft(null)
    return true
  }, [draft, platformTemplateService, runAction])

  return {
    editorData: editorResource.resource,
    isLoading: editorResource.isLoading,
    errorMessage: editorResource.errorMessage,
    history: historyResource.resource,
    draft,
    changedClauseCount: draft === null ? 0 : countStandardDraftChanges(draft).changedClauseCount,
    draftProblem: draft === null ? null : platformTemplateService.validateDraft(draft),
    isPublishing: pendingActionKey !== null,
    startEditing,
    discard,
    changeClause,
    publish,
    reload: editorResource.reload,
  }
}
