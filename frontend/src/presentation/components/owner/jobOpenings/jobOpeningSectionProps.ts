import type { FormFieldErrors } from '../../../../application/validation/formFieldSchemas'
import type { JobOpeningDraft } from '../../../../application/validation/jobOpeningDraft'
import type { JobOpeningDraftFieldChange } from '../../../hooks/useJobOpeningEditor'

export interface JobOpeningSectionProps {
  readonly draft: JobOpeningDraft
  readonly fieldErrors: FormFieldErrors
  readonly onFieldChange: JobOpeningDraftFieldChange
}

/** Label suffix for fields a draft may leave empty but publishing needs. */
export const neededToPublishSuffix = ' (needed to publish)'

/** Blank first option: a choice stays "not specified" until the owner picks one. */
export const notSelectedOption = { value: '', label: 'Not specified' } as const
