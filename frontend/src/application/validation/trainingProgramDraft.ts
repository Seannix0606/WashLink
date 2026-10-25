import type {
  SaveTrainingProgramInput,
  TrainingPayCurrency,
  TrainingPayPeriod,
  TrainingProgram,
  TrainingProgramContent,
} from '../../domain/models/TrainingProgram'
import { collectFieldErrors, type FormFieldErrors } from './formFieldSchemas'
import { saveTrainingProgramInputSchema } from './trainingProgramSchemas'

/**
 * Form state: inputs stay strings until validated; unselected choices stay ''.
 * A new program starts empty: no training days, no pay, nothing pre-filled.
 */
export interface TrainingProgramDraft {
  readonly shopId: string
  readonly title: string
  readonly objectives: string
  readonly skillsToLearn: readonly string[]
  readonly terms: string
  readonly minTrainingDaysText: string
  readonly assessmentChecklist: readonly string[]
  readonly trainingPayAmountText: string
  readonly trainingPayCurrency: TrainingPayCurrency | ''
  readonly trainingPayPeriod: TrainingPayPeriod | ''
  readonly trainingPayDetails: string
  readonly reimbursementDetails: string
}

/** Existing values are copied as stored; a new program only gets the chosen shop. */
export function createTrainingProgramDraft(
  program: TrainingProgram | null,
  initialShopId: string,
): TrainingProgramDraft {
  return {
    shopId: program?.shopId ?? initialShopId,
    title: program?.title ?? '',
    objectives: program?.objectives ?? '',
    skillsToLearn: program?.skillsToLearn ?? [],
    terms: program?.terms ?? '',
    minTrainingDaysText: program === null ? '' : String(program.minTrainingDays),
    assessmentChecklist: program?.assessmentChecklist ?? [],
    trainingPayAmountText:
      program?.trainingPayAmount == null ? '' : String(program.trainingPayAmount),
    trainingPayCurrency: program?.trainingPayCurrency ?? '',
    trainingPayPeriod: program?.trainingPayPeriod ?? '',
    trainingPayDetails: program?.trainingPayDetails ?? '',
    reimbursementDetails: program?.reimbursementDetails ?? '',
  }
}

const amountTextPattern = /^\d+(\.\d+)?$/
const wholeNumberTextPattern = /^-?\d+(\.\d+)?$/

/** '' is "not specified"; malformed text becomes NaN so the schema reports it. */
function parseNumberText(numberText: string, textPattern: RegExp): number | null {
  const trimmedText = numberText.trim()
  if (trimmedText.length === 0) {
    return null
  }
  return textPattern.test(trimmedText) ? Number(trimmedText) : Number.NaN
}

function emptyChoiceToNull<Choice extends string>(choice: Choice | ''): Choice | null {
  return choice === '' ? null : choice
}

function toCandidateInput(draft: TrainingProgramDraft): Record<keyof SaveTrainingProgramInput, unknown> {
  return {
    title: draft.title,
    objectives: draft.objectives,
    skillsToLearn: draft.skillsToLearn,
    terms: draft.terms,
    // An empty day count is sent to the schema as undefined so it reports "Enter the number".
    minTrainingDays: parseNumberText(draft.minTrainingDaysText, wholeNumberTextPattern) ?? undefined,
    assessmentChecklist: draft.assessmentChecklist,
    trainingPayAmount: parseNumberText(draft.trainingPayAmountText, amountTextPattern),
    trainingPayCurrency: emptyChoiceToNull(draft.trainingPayCurrency),
    trainingPayPeriod: emptyChoiceToNull(draft.trainingPayPeriod),
    trainingPayDetails: draft.trainingPayDetails,
    reimbursementDetails: draft.reimbursementDetails,
  }
}

export type ParsedTrainingProgramDraft =
  | { readonly isValid: true; readonly shopId: string; readonly input: SaveTrainingProgramInput }
  | { readonly isValid: false; readonly fieldErrors: FormFieldErrors }

export function parseTrainingProgramDraft(draft: TrainingProgramDraft): ParsedTrainingProgramDraft {
  const parseResult = saveTrainingProgramInputSchema.safeParse(toCandidateInput(draft))
  const fieldErrors: Partial<Record<string, string>> = parseResult.success
    ? {}
    : { ...collectFieldErrors(parseResult.error) }
  if (draft.shopId === '') {
    fieldErrors.shopId = 'Choose the shop for this training program.'
  }
  if (!parseResult.success || Object.keys(fieldErrors).length > 0) {
    return { isValid: false, fieldErrors }
  }
  return { isValid: true, shopId: draft.shopId, input: parseResult.data }
}

function textOrNull(draftText: string): string | null {
  const trimmedText = draftText.trim()
  return trimmedText.length === 0 ? null : trimmedText
}

/** What workers would see for the current form values; invalid numbers are left out, never guessed. */
export function draftToTrainingPreviewContent(draft: TrainingProgramDraft): TrainingProgramContent {
  const parsedAmount = parseNumberText(draft.trainingPayAmountText, amountTextPattern)
  const parsedDays = parseNumberText(draft.minTrainingDaysText, wholeNumberTextPattern)
  return {
    title: draft.title.trim(),
    objectives: textOrNull(draft.objectives),
    skillsToLearn: draft.skillsToLearn,
    terms: textOrNull(draft.terms),
    minTrainingDays: parsedDays !== null && Number.isFinite(parsedDays) ? parsedDays : 0,
    assessmentChecklist: draft.assessmentChecklist,
    trainingPayAmount: parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
    trainingPayCurrency: emptyChoiceToNull(draft.trainingPayCurrency),
    trainingPayPeriod: emptyChoiceToNull(draft.trainingPayPeriod),
    trainingPayDetails: textOrNull(draft.trainingPayDetails),
    reimbursementDetails: textOrNull(draft.reimbursementDetails),
  }
}
