import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContractDraftEditorData, WorkerContractService } from '../../application/services/WorkerContractService'
import { buildContractEditableBodies } from '../../application/services/WorkerContractService'
import {
  validateContractTemplateDraft,
  type ContractTemplateDraftErrors,
} from '../../application/validation/contractTemplateDraftValidation'
import {
  validateContractDetails,
  type ContractDetailsDraft,
  type ContractDetailsErrors,
} from '../../application/validation/workerContractSchemas'
import type { ContractTemplateClause } from '../../domain/models/ContractTemplate'
import type { ContractDraftPreview, ContractOwnerValueKey, OwnerWorkerContract } from '../../domain/models/WorkerContract'
import type { ContractTemplateDraft, ShopTermDraft } from '../../domain/utilities/contractTemplateDraft'
import { applicationToast } from '../design/ui'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { isStaleContractMessage } from './useWorkerContractActions'

export type ContractDraftSaveOutcome = 'saved' | 'stale' | 'failed'

const emptyDetails: ContractDetailsDraft = {
  classificationKey: null,
  startDate: '',
  endDate: '',
  ownerValues: { role_title: '', schedule_summary: '', pay_details: '' },
}
const emptyDraft: ContractTemplateDraft = { editableBodies: {}, shopTerms: [] }
const noDraftErrors: ContractTemplateDraftErrors = { fieldErrors: {}, formError: null }
const noDetailsErrors: ContractDetailsErrors = {}

/** Editor state from the stored draft: contract edits over the template text; values verbatim. */
function editorStateFrom(editorData: ContractDraftEditorData): { details: ContractDetailsDraft; draft: ContractTemplateDraft } {
  const { draftVersion, templateClauses } = editorData
  const editableBodies: Record<string, string> = {}
  for (const clause of templateClauses) {
    if (clause.kind === 'editable' && clause.clauseKey !== null) {
      editableBodies[clause.clauseKey] = draftVersion.editableBodies[clause.clauseKey] ?? clause.body
    }
  }
  const shopTerms: ShopTermDraft[] = draftVersion.shopTerms.map((shopTerm, termIndex) => ({
    draftId: `saved-term-${String(termIndex)}`,
    ...shopTerm,
  }))
  return {
    details: {
      classificationKey: draftVersion.classificationKey,
      startDate: draftVersion.startDate,
      endDate: draftVersion.endDate ?? '',
      ownerValues: {
        role_title: draftVersion.ownerValues.role_title ?? '',
        schedule_summary: draftVersion.ownerValues.schedule_summary ?? '',
        pay_details: draftVersion.ownerValues.pay_details ?? '',
      },
    },
    draft: { editableBodies, shopTerms },
  }
}

function sortedEntries(record: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(record).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)))
}

function isEditorChanged(editorData: ContractDraftEditorData | null, details: ContractDetailsDraft, draft: ContractTemplateDraft): boolean {
  if (editorData === null) {
    return false
  }
  const saved = editorStateFrom(editorData)
  const savedShopTerms = saved.draft.shopTerms.map(({ sectionNumber, heading, body }) => ({ sectionNumber, heading, body }))
  const currentShopTerms = draft.shopTerms.map(({ sectionNumber, heading, body }) => ({ sectionNumber, heading, body }))
  return (
    JSON.stringify(saved.details) !== JSON.stringify(details) ||
    sortedEntries(buildContractEditableBodies(editorData.templateClauses, draft)) !== sortedEntries(editorData.draftVersion.editableBodies) ||
    JSON.stringify(savedShopTerms) !== JSON.stringify(currentShopTerms)
  )
}

export interface UseWorkerContractDraftEditorResult {
  readonly editorData: ContractDraftEditorData | null
  readonly templateClauses: readonly ContractTemplateClause[]
  readonly preview: ContractDraftPreview | null
  readonly details: ContractDetailsDraft
  readonly draft: ContractTemplateDraft
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isSaving: boolean
  readonly isDirty: boolean
  readonly visibleDetailsErrors: ContractDetailsErrors
  readonly visibleDraftErrors: ContractTemplateDraftErrors
  readonly setClassificationKey: (classificationKey: string) => void
  readonly setDate: (field: 'startDate' | 'endDate', value: string) => void
  readonly setOwnerValue: (valueKey: ContractOwnerValueKey, value: string) => void
  readonly setEditableBody: (clauseKey: string, body: string) => void
  readonly addShopTerm: (sectionNumber: number) => void
  readonly updateShopTerm: (draftId: string, fieldName: 'heading' | 'body', value: string) => void
  readonly removeShopTerm: (draftId: string) => void
  readonly discardChanges: () => void
  readonly save: () => Promise<ContractDraftSaveOutcome>
  readonly reload: () => Promise<void>
}

/**
 * Owner editor for the open draft version (initial or amendment). Saving sends the full set of
 * contract-level edits and shop terms with the expected draft revision; a stale answer reloads.
 */
export function useWorkerContractDraftEditor(
  workerContractService: WorkerContractService,
  contract: OwnerWorkerContract,
  onContractChanged: () => Promise<void>,
): UseWorkerContractDraftEditorResult {
  const [editorData, setEditorData] = useState<ContractDraftEditorData | null>(null)
  const [details, setDetails] = useState<ContractDetailsDraft>(emptyDetails)
  const [draft, setDraft] = useState<ContractTemplateDraft>(emptyDraft)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [hasTriedSave, setHasTriedSave] = useState<boolean>(false)
  const contractRef = useRef<OwnerWorkerContract>(contract)
  useEffect(() => {
    contractRef.current = contract
  }, [contract])
  const latestRequestRef = useRef<number>(0)
  const nextTermNumberRef = useRef<number>(0)

  const reload = useCallback(async (): Promise<void> => {
    latestRequestRef.current += 1
    const requestNumber = latestRequestRef.current
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const loadedData = await workerContractService.loadDraftEditor(contractRef.current)
      if (requestNumber !== latestRequestRef.current) {
        return
      }
      const editorState = editorStateFrom(loadedData)
      setEditorData(loadedData)
      setDetails(editorState.details)
      setDraft(editorState.draft)
      setHasTriedSave(false)
    } catch (loadError) {
      if (requestNumber === latestRequestRef.current) {
        setErrorMessage(toDisplayErrorMessage(loadError, 'Could not load the contract draft.'))
      }
    } finally {
      if (requestNumber === latestRequestRef.current) {
        setIsLoading(false)
      }
    }
  }, [workerContractService])

  useEffect(() => {
    void reload()
  }, [reload])

  const detailsErrors = useMemo(() => validateContractDetails(details), [details])
  const draftErrors = useMemo(
    () => (editorData === null ? noDraftErrors : validateContractTemplateDraft(editorData.templateClauses, draft)),
    [editorData, draft],
  )

  const save = useCallback(async (): Promise<ContractDraftSaveOutcome> => {
    if (editorData === null) {
      return 'failed'
    }
    setHasTriedSave(true)
    setIsSaving(true)
    let outcome: ContractDraftSaveOutcome = 'failed'
    try {
      await workerContractService.saveDraft(contractRef.current, editorData, details, draft)
      applicationToast.success('Draft saved. Nothing is sent until you send it.')
      outcome = 'saved'
    } catch (saveError) {
      const saveErrorMessage = toDisplayErrorMessage(saveError, 'Could not save the contract draft.')
      if (isStaleContractMessage(saveErrorMessage)) {
        applicationToast.error(`${saveErrorMessage} The latest draft was loaded; your unsaved changes were not kept.`)
        outcome = 'stale'
      } else {
        applicationToast.error(saveErrorMessage)
      }
    }
    if (outcome !== 'failed') {
      await reload()
    }
    await onContractChanged()
    setIsSaving(false)
    return outcome
  }, [details, draft, editorData, onContractChanged, reload, workerContractService])

  const setClassificationKey = useCallback((classificationKey: string): void => {
    setDetails((current) => ({ ...current, classificationKey }))
  }, [])

  const setDate = useCallback((field: 'startDate' | 'endDate', value: string): void => {
    setDetails((current) => ({ ...current, [field]: value }))
  }, [])

  const setOwnerValue = useCallback((valueKey: ContractOwnerValueKey, value: string): void => {
    setDetails((current) => ({ ...current, ownerValues: { ...current.ownerValues, [valueKey]: value } }))
  }, [])

  const setEditableBody = useCallback((clauseKey: string, body: string): void => {
    setDraft((current) => ({ ...current, editableBodies: { ...current.editableBodies, [clauseKey]: body } }))
  }, [])

  const addShopTerm = useCallback((sectionNumber: number): void => {
    nextTermNumberRef.current += 1
    const newTerm: ShopTermDraft = { draftId: `new-term-${String(nextTermNumberRef.current)}`, sectionNumber, heading: '', body: '' }
    setDraft((current) => ({ ...current, shopTerms: [...current.shopTerms, newTerm] }))
  }, [])

  const updateShopTerm = useCallback((draftId: string, fieldName: 'heading' | 'body', value: string): void => {
    setDraft((current) => ({
      ...current,
      shopTerms: current.shopTerms.map((shopTerm) => (shopTerm.draftId === draftId ? { ...shopTerm, [fieldName]: value } : shopTerm)),
    }))
  }, [])

  const removeShopTerm = useCallback((draftId: string): void => {
    setDraft((current) => ({ ...current, shopTerms: current.shopTerms.filter((shopTerm) => shopTerm.draftId !== draftId) }))
  }, [])

  const discardChanges = useCallback((): void => {
    if (editorData !== null) {
      const editorState = editorStateFrom(editorData)
      setDetails(editorState.details)
      setDraft(editorState.draft)
    }
    setHasTriedSave(false)
  }, [editorData])

  return {
    editorData,
    templateClauses: editorData?.templateClauses ?? [],
    preview: editorData?.preview ?? null,
    details,
    draft,
    isLoading,
    errorMessage,
    isSaving,
    isDirty: isEditorChanged(editorData, details, draft),
    visibleDetailsErrors: hasTriedSave ? detailsErrors : noDetailsErrors,
    visibleDraftErrors: hasTriedSave ? draftErrors : noDraftErrors,
    setClassificationKey,
    setDate,
    setOwnerValue,
    setEditableBody,
    addShopTerm,
    updateShopTerm,
    removeShopTerm,
    discardChanges,
    save,
    reload,
  }
}
