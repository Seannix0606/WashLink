import type { AddTrainingSessionInput, TrainingSessionKind } from '../../domain/models/TrainingSession'
import { collectFieldErrors, type FormFieldErrors } from './formFieldSchemas'
import {
  addTrainingSessionInputSchema,
  isSessionDateInAllowedWindow,
  sessionDateWindowMessage,
} from './trainingProgramSchemas'

/** Form state for a new session; nothing is pre-selected (the kind starts unchosen). */
export interface TrainingSessionDraft {
  readonly sessionDate: string
  readonly sessionKind: TrainingSessionKind | ''
  readonly startTime: string
  readonly endTime: string
  readonly location: string
}

export const emptyTrainingSessionDraft: TrainingSessionDraft = {
  sessionDate: '',
  sessionKind: '',
  startTime: '',
  endTime: '',
  location: '',
}

export type ParsedTrainingSessionDraft =
  | { readonly isValid: true; readonly input: AddTrainingSessionInput }
  | { readonly isValid: false; readonly fieldErrors: FormFieldErrors }

export function parseTrainingSessionDraft(draft: TrainingSessionDraft, manilaToday: string): ParsedTrainingSessionDraft {
  const parseResult = addTrainingSessionInputSchema.safeParse({
    sessionDate: draft.sessionDate,
    sessionKind: draft.sessionKind === '' ? undefined : draft.sessionKind,
    startTime: draft.startTime,
    endTime: draft.endTime,
    location: draft.location,
  })
  if (!parseResult.success) {
    return { isValid: false, fieldErrors: collectFieldErrors(parseResult.error) }
  }
  if (!isSessionDateInAllowedWindow(parseResult.data.sessionDate, manilaToday)) {
    return { isValid: false, fieldErrors: { sessionDate: sessionDateWindowMessage } }
  }
  return { isValid: true, input: parseResult.data }
}
