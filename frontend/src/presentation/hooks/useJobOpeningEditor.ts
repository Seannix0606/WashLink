import { useCallback, useMemo, useState } from 'react'
import type { FormFieldErrors } from '../../application/validation/formFieldSchemas'
import {
  createJobOpeningDraft,
  draftToPreviewContent,
  parseJobOpeningDraft,
  type JobOpeningDraft,
} from '../../application/validation/jobOpeningDraft'
import type { JobOpening, JobOpeningContent, SaveJobOpeningInput } from '../../domain/models/JobOpening'

export type JobOpeningDraftFieldChange = <FieldName extends keyof JobOpeningDraft>(
  fieldName: FieldName,
  fieldValue: JobOpeningDraft[FieldName],
) => void

interface UseJobOpeningEditorOptions {
  readonly jobOpening: JobOpening | null
  readonly initialShopId: string
  readonly onSave: (shopId: string, saveJobOpeningInput: SaveJobOpeningInput) => Promise<boolean>
}

export interface UseJobOpeningEditorResult {
  readonly draft: JobOpeningDraft
  readonly fieldErrors: FormFieldErrors
  readonly previewContent: JobOpeningContent
  readonly isPreviewVisible: boolean
  readonly isSaving: boolean
  readonly updateDraftField: JobOpeningDraftFieldChange
  readonly setIsPreviewVisible: (isVisible: boolean) => void
  /** Shows field errors and returns false when the form cannot be saved yet. */
  readonly validateDraft: () => boolean
  /** Validates, then saves; true when the save succeeded. */
  readonly submitDraft: () => Promise<boolean>
}

export function useJobOpeningEditor({
  jobOpening,
  initialShopId,
  onSave,
}: UseJobOpeningEditorOptions): UseJobOpeningEditorResult {
  const [draft, setDraft] = useState<JobOpeningDraft>(() =>
    createJobOpeningDraft(jobOpening, initialShopId),
  )
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  const updateDraftField = useCallback<JobOpeningDraftFieldChange>((fieldName, fieldValue) => {
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

  const previewContent = useMemo(() => draftToPreviewContent(draft), [draft])

  const validateDraft = useCallback((): boolean => {
    const parsedDraft = parseJobOpeningDraft(draft)
    setFieldErrors(parsedDraft.isValid ? {} : parsedDraft.fieldErrors)
    return parsedDraft.isValid
  }, [draft])

  const submitDraft = useCallback(async (): Promise<boolean> => {
    const parsedDraft = parseJobOpeningDraft(draft)
    if (!parsedDraft.isValid) {
      setFieldErrors(parsedDraft.fieldErrors)
      setIsPreviewVisible(false)
      return false
    }
    setFieldErrors({})
    setIsSaving(true)
    const didSave = await onSave(parsedDraft.shopId, parsedDraft.input)
    setIsSaving(false)
    return didSave
  }, [draft, onSave])

  return {
    draft,
    fieldErrors,
    previewContent,
    isPreviewVisible,
    isSaving,
    updateDraftField,
    setIsPreviewVisible,
    validateDraft,
    submitDraft,
  }
}
