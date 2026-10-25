import { useCallback, useMemo, useState } from 'react'
import type { FormFieldErrors } from '../../application/validation/formFieldSchemas'
import {
  createTrainingProgramDraft,
  draftToTrainingPreviewContent,
  parseTrainingProgramDraft,
  type TrainingProgramDraft,
} from '../../application/validation/trainingProgramDraft'
import type {
  SaveTrainingProgramInput,
  TrainingProgram,
  TrainingProgramContent,
} from '../../domain/models/TrainingProgram'

export type TrainingProgramDraftFieldChange = <FieldName extends keyof TrainingProgramDraft>(
  fieldName: FieldName,
  fieldValue: TrainingProgramDraft[FieldName],
) => void

interface UseTrainingProgramEditorOptions {
  readonly program: TrainingProgram | null
  readonly initialShopId: string
  readonly onSave: (shopId: string, saveInput: SaveTrainingProgramInput) => Promise<boolean>
}

export interface UseTrainingProgramEditorResult {
  readonly draft: TrainingProgramDraft
  readonly fieldErrors: FormFieldErrors
  readonly previewContent: TrainingProgramContent
  readonly isSaving: boolean
  readonly updateDraftField: TrainingProgramDraftFieldChange
  /** Validates, then saves; true when the save succeeded. */
  readonly submitDraft: () => Promise<boolean>
}

export function useTrainingProgramEditor({
  program,
  initialShopId,
  onSave,
}: UseTrainingProgramEditorOptions): UseTrainingProgramEditorResult {
  const [draft, setDraft] = useState<TrainingProgramDraft>(() => createTrainingProgramDraft(program, initialShopId))
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})
  const [isSaving, setIsSaving] = useState<boolean>(false)

  const updateDraftField = useCallback<TrainingProgramDraftFieldChange>((fieldName, fieldValue) => {
    setDraft((currentDraft) => ({ ...currentDraft, [fieldName]: fieldValue }))
    setFieldErrors((currentFieldErrors) => {
      if (currentFieldErrors[fieldName] === undefined) {
        return currentFieldErrors
      }
      const { [fieldName]: clearedFieldError, ...remainingFieldErrors } = currentFieldErrors
      void clearedFieldError
      return remainingFieldErrors
    })
  }, [])

  const previewContent = useMemo(() => draftToTrainingPreviewContent(draft), [draft])

  const submitDraft = useCallback(async (): Promise<boolean> => {
    const parsedDraft = parseTrainingProgramDraft(draft)
    if (!parsedDraft.isValid) {
      setFieldErrors(parsedDraft.fieldErrors)
      return false
    }
    setFieldErrors({})
    setIsSaving(true)
    const didSave = await onSave(parsedDraft.shopId, parsedDraft.input)
    setIsSaving(false)
    return didSave
  }, [draft, onSave])

  return { draft, fieldErrors, previewContent, isSaving, updateDraftField, submitDraft }
}
