import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContractTemplateService } from '../../application/services/ContractTemplateService'
import {
  validateContractTemplateDraft,
  type ContractTemplateDraftErrors,
} from '../../application/validation/contractTemplateDraftValidation'
import {
  staleContractTemplateMessage,
  type ContractTemplateClause,
  type ContractTemplatePlaceholder,
  type ContractTemplateVersionRecord,
  type OwnerContractTemplate,
} from '../../domain/models/ContractTemplate'
import {
  createDraftFromClauses,
  isDraftChanged,
  type ContractTemplateDraft,
  type ShopTermDraft,
} from '../../domain/utilities/contractTemplateDraft'
import { applicationToast } from '../design/ui'
import { templateNotFoundText } from '../utilities/contractTemplateCopy'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'

/** 'stale' means the template changed on the server; the editor reloaded the latest version. */
export type ContractTemplateSaveOutcome = 'saved' | 'stale' | 'failed'

interface EditorSnapshot {
  readonly template: OwnerContractTemplate
  readonly clauses: readonly ContractTemplateClause[]
}

const emptyDraft: ContractTemplateDraft = { editableBodies: {}, shopTerms: [] }
const noDraftErrors: ContractTemplateDraftErrors = { fieldErrors: {}, formError: null }

export interface UseContractTemplateEditorResult {
  /** The template as loaded into the editor (saves use this version number). */
  readonly template: OwnerContractTemplate
  readonly clauses: readonly ContractTemplateClause[]
  readonly draft: ContractTemplateDraft
  readonly placeholders: readonly ContractTemplatePlaceholder[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isReadOnly: boolean
  readonly isDirty: boolean
  readonly isSaving: boolean
  /** Shown after the first save attempt. */
  readonly visibleErrors: ContractTemplateDraftErrors
  readonly setEditableBody: (clauseKey: string, body: string) => void
  readonly addShopTerm: (sectionNumber: number) => void
  readonly updateShopTerm: (draftId: string, fieldName: 'heading' | 'body', value: string) => void
  readonly removeShopTerm: (draftId: string) => void
  readonly discardChanges: () => void
  readonly save: () => Promise<ContractTemplateSaveOutcome>
  readonly updateToNewerStandard: () => Promise<ContractTemplateSaveOutcome>
  readonly reload: () => Promise<void>
}

/**
 * Editor state for one owner template, built from its current version. Saving sends only
 * changed editable bodies and the full shop-term list with the expected version number;
 * a stale answer (55000) reloads the latest version instead of overwriting it.
 */
export function useContractTemplateEditor(
  contractTemplateService: ContractTemplateService,
  initialTemplate: OwnerContractTemplate,
  onTemplateChanged: () => Promise<void>,
): UseContractTemplateEditorResult {
  const [snapshot, setSnapshot] = useState<EditorSnapshot>({ template: initialTemplate, clauses: [] })
  const [draft, setDraft] = useState<ContractTemplateDraft>(emptyDraft)
  const [placeholders, setPlaceholders] = useState<readonly ContractTemplatePlaceholder[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [hasTriedSave, setHasTriedSave] = useState<boolean>(false)
  const nextTermNumberRef = useRef<number>(0)
  const latestRequestRef = useRef<number>(0)

  const loadTemplate = useCallback(
    async (template: OwnerContractTemplate): Promise<void> => {
      latestRequestRef.current += 1
      const requestNumber = latestRequestRef.current
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const [clauses, loadedPlaceholders] = await Promise.all([
          contractTemplateService.listVersionClauses(template.currentVersionId),
          contractTemplateService.listPlaceholders().catch((): ContractTemplatePlaceholder[] => []),
        ])
        if (requestNumber !== latestRequestRef.current) {
          return
        }
        setSnapshot({ template, clauses })
        setDraft(createDraftFromClauses(clauses))
        setPlaceholders(loadedPlaceholders)
        setHasTriedSave(false)
        setErrorMessage(clauses.length === 0 ? templateNotFoundText : null)
      } catch (loadError) {
        if (requestNumber === latestRequestRef.current) {
          setErrorMessage(toDisplayErrorMessage(loadError, 'Could not load the template.'))
        }
      } finally {
        if (requestNumber === latestRequestRef.current) {
          setIsLoading(false)
        }
      }
    },
    [contractTemplateService],
  )

  // Loaded once (the caller keys the editor by template id); later list refreshes must not overwrite unsaved edits.
  const initialTemplateRef = useRef<OwnerContractTemplate>(initialTemplate)
  useEffect(() => {
    void loadTemplate(initialTemplateRef.current)
  }, [loadTemplate])

  /** Re-reads the template row from the server (after a stale save), then its current version. */
  const reload = useCallback(async (): Promise<void> => {
    try {
      const overview = await contractTemplateService.loadOwnerOverview()
      const freshTemplate = overview.templates.find((template) => template.templateId === snapshot.template.templateId)
      if (freshTemplate === undefined) {
        setErrorMessage(templateNotFoundText)
        return
      }
      await loadTemplate(freshTemplate)
    } catch (reloadError) {
      setErrorMessage(toDisplayErrorMessage(reloadError, 'Could not load the template.'))
    }
  }, [contractTemplateService, loadTemplate, snapshot.template.templateId])

  const runSave = useCallback(
    async (
      performSave: () => Promise<ContractTemplateVersionRecord>,
      nextTemplate: (record: ContractTemplateVersionRecord) => OwnerContractTemplate,
    ): Promise<ContractTemplateSaveOutcome> => {
      setIsSaving(true)
      let outcome: ContractTemplateSaveOutcome = 'failed'
      try {
        const versionRecord = await performSave()
        applicationToast.success(`Version ${String(versionRecord.versionNumber)} saved. Earlier versions stay unchanged.`)
        outcome = 'saved'
        await loadTemplate(nextTemplate(versionRecord))
      } catch (saveError) {
        const saveErrorMessage = toDisplayErrorMessage(saveError, 'Could not save the template.')
        if (saveErrorMessage === staleContractTemplateMessage) {
          applicationToast.error(`${saveErrorMessage} The latest version was loaded; your unsaved changes were not kept.`)
          outcome = 'stale'
          await reload()
        } else {
          applicationToast.error(saveErrorMessage)
        }
      }
      await onTemplateChanged()
      setIsSaving(false)
      return outcome
    },
    [loadTemplate, onTemplateChanged, reload],
  )

  const draftErrors = useMemo(() => validateContractTemplateDraft(snapshot.clauses, draft), [snapshot.clauses, draft])

  const save = useCallback(async (): Promise<ContractTemplateSaveOutcome> => {
    setHasTriedSave(true)
    const { template, clauses } = snapshot
    return runSave(
      async () => contractTemplateService.saveVersion(template, clauses, draft),
      (versionRecord) => ({
        ...template,
        currentVersionId: versionRecord.versionId,
        currentVersionNumber: versionRecord.versionNumber,
      }),
    )
  }, [contractTemplateService, draft, runSave, snapshot])

  const updateToNewerStandard = useCallback(async (): Promise<ContractTemplateSaveOutcome> => {
    const { template, clauses } = snapshot
    return runSave(
      async () => contractTemplateService.updateToNewerStandard(template, clauses),
      (versionRecord) => ({
        ...template,
        currentVersionId: versionRecord.versionId,
        currentVersionNumber: versionRecord.versionNumber,
        basePlatformVersionId: template.latestPlatformVersionId ?? template.basePlatformVersionId,
        basePlatformVersionNumber: template.latestPlatformVersionNumber ?? template.basePlatformVersionNumber,
        newerStandardAvailable: false,
      }),
    )
  }, [contractTemplateService, runSave, snapshot])

  const setEditableBody = useCallback((clauseKey: string, body: string): void => {
    setDraft((currentDraft) => ({ ...currentDraft, editableBodies: { ...currentDraft.editableBodies, [clauseKey]: body } }))
  }, [])

  const addShopTerm = useCallback((sectionNumber: number): void => {
    nextTermNumberRef.current += 1
    const newTerm: ShopTermDraft = { draftId: `new-term-${String(nextTermNumberRef.current)}`, sectionNumber, heading: '', body: '' }
    setDraft((currentDraft) => ({ ...currentDraft, shopTerms: [...currentDraft.shopTerms, newTerm] }))
  }, [])

  const updateShopTerm = useCallback((draftId: string, fieldName: 'heading' | 'body', value: string): void => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      shopTerms: currentDraft.shopTerms.map((shopTerm) => (shopTerm.draftId === draftId ? { ...shopTerm, [fieldName]: value } : shopTerm)),
    }))
  }, [])

  const removeShopTerm = useCallback((draftId: string): void => {
    setDraft((currentDraft) => ({ ...currentDraft, shopTerms: currentDraft.shopTerms.filter((shopTerm) => shopTerm.draftId !== draftId) }))
  }, [])

  const discardChanges = useCallback((): void => {
    setDraft(createDraftFromClauses(snapshot.clauses))
    setHasTriedSave(false)
  }, [snapshot.clauses])

  return {
    template: snapshot.template,
    clauses: snapshot.clauses,
    draft,
    placeholders,
    isLoading,
    errorMessage,
    isReadOnly: snapshot.template.status !== 'active',
    isDirty: snapshot.clauses.length > 0 && isDraftChanged(snapshot.clauses, draft),
    isSaving,
    visibleErrors: hasTriedSave ? draftErrors : noDraftErrors,
    setEditableBody,
    addShopTerm,
    updateShopTerm,
    removeShopTerm,
    discardChanges,
    save,
    updateToNewerStandard,
    reload,
  }
}
