import type {
  JobOpening,
  JobOpeningApplicantRequirement,
  JobOpeningCompensationCurrency,
  JobOpeningCompensationPeriod,
  JobOpeningContent,
  JobOpeningJobType,
  SaveJobOpeningInput,
} from '../../domain/models/JobOpening'
import { collectFieldErrors, type FormFieldErrors } from './formFieldSchemas'
import { saveJobOpeningInputSchema } from './jobOpeningSchemas'

/**
 * Form state: inputs stay strings until validated; unselected choices stay ''.
 * A new draft starts completely empty (P16: nothing is pre-filled).
 */
export interface JobOpeningDraft {
  readonly shopId: string
  readonly title: string
  readonly description: string
  readonly duties: readonly string[]
  readonly workLocation: string
  readonly openingsCountText: string
  readonly jobType: JobOpeningJobType | ''
  readonly requiredSkills: readonly string[]
  readonly minimumYearsExperienceText: string
  readonly experienceRequirement: string
  readonly availabilityRequirement: string
  readonly scheduleDetails: string
  readonly compensationMinAmountText: string
  readonly compensationMaxAmountText: string
  readonly compensationCurrency: JobOpeningCompensationCurrency | ''
  readonly compensationPeriod: JobOpeningCompensationPeriod | ''
  readonly compensationDetails: string
  readonly benefits: string
  readonly otherTerms: string
  readonly minimumQualifications: readonly string[]
  readonly preferredQualifications: readonly string[]
  readonly requiredTraining: string
  readonly applicantRequirement: JobOpeningApplicantRequirement | ''
  readonly certificationExpectations: string
  readonly applicationDeadline: string
  readonly applicationInstructions: string
}

function numberToText(storedNumber: number | null): string {
  return storedNumber === null ? '' : String(storedNumber)
}

/** Existing values are copied as stored; a new opening only gets the chosen shop. */
export function createJobOpeningDraft(
  jobOpening: JobOpening | null,
  initialShopId: string,
): JobOpeningDraft {
  return {
    shopId: jobOpening?.shopId ?? initialShopId,
    title: jobOpening?.title ?? '',
    description: jobOpening?.description ?? '',
    duties: jobOpening?.duties ?? [],
    workLocation: jobOpening?.workLocation ?? '',
    openingsCountText: numberToText(jobOpening?.openingsCount ?? null),
    jobType: jobOpening?.jobType ?? '',
    requiredSkills: jobOpening?.requiredSkills ?? [],
    minimumYearsExperienceText: numberToText(jobOpening?.minimumYearsExperience ?? null),
    experienceRequirement: jobOpening?.experienceRequirement ?? '',
    availabilityRequirement: jobOpening?.availabilityRequirement ?? '',
    scheduleDetails: jobOpening?.scheduleDetails ?? '',
    compensationMinAmountText: numberToText(jobOpening?.compensationMinAmount ?? null),
    compensationMaxAmountText: numberToText(jobOpening?.compensationMaxAmount ?? null),
    compensationCurrency: jobOpening?.compensationCurrency ?? '',
    compensationPeriod: jobOpening?.compensationPeriod ?? '',
    compensationDetails: jobOpening?.compensationDetails ?? '',
    benefits: jobOpening?.benefits ?? '',
    otherTerms: jobOpening?.otherTerms ?? '',
    minimumQualifications: jobOpening?.minimumQualifications ?? [],
    preferredQualifications: jobOpening?.preferredQualifications ?? [],
    requiredTraining: jobOpening?.requiredTraining ?? '',
    applicantRequirement: jobOpening?.applicantRequirement ?? '',
    certificationExpectations: jobOpening?.certificationExpectations ?? '',
    applicationDeadline: jobOpening?.applicationDeadline ?? '',
    applicationInstructions: jobOpening?.applicationInstructions ?? '',
  }
}

const amountTextPattern = /^\d+(\.\d+)?$/

/** '' is "not specified"; malformed text becomes NaN so the schema reports it. */
function parseNumberText(numberText: string, textPattern: RegExp): number | null {
  const trimmedText = numberText.trim()
  if (trimmedText.length === 0) {
    return null
  }
  return textPattern.test(trimmedText) ? Number(trimmedText) : Number.NaN
}

const wholeNumberTextPattern = /^-?\d+(\.\d+)?$/

function emptyChoiceToNull<Choice extends string>(choice: Choice | ''): Choice | null {
  return choice === '' ? null : choice
}

function toCandidateInput(draft: JobOpeningDraft): Record<keyof SaveJobOpeningInput, unknown> {
  return {
    title: draft.title,
    description: draft.description,
    duties: draft.duties,
    workLocation: draft.workLocation,
    openingsCount: parseNumberText(draft.openingsCountText, wholeNumberTextPattern),
    jobType: emptyChoiceToNull(draft.jobType),
    requiredSkills: draft.requiredSkills,
    minimumYearsExperience: parseNumberText(draft.minimumYearsExperienceText, wholeNumberTextPattern),
    experienceRequirement: draft.experienceRequirement,
    availabilityRequirement: draft.availabilityRequirement,
    scheduleDetails: draft.scheduleDetails,
    compensationMinAmount: parseNumberText(draft.compensationMinAmountText, amountTextPattern),
    compensationMaxAmount: parseNumberText(draft.compensationMaxAmountText, amountTextPattern),
    compensationCurrency: emptyChoiceToNull(draft.compensationCurrency),
    compensationPeriod: emptyChoiceToNull(draft.compensationPeriod),
    compensationDetails: draft.compensationDetails,
    benefits: draft.benefits,
    otherTerms: draft.otherTerms,
    minimumQualifications: draft.minimumQualifications,
    preferredQualifications: draft.preferredQualifications,
    requiredTraining: draft.requiredTraining,
    applicantRequirement: emptyChoiceToNull(draft.applicantRequirement),
    certificationExpectations: draft.certificationExpectations,
    applicationDeadline: draft.applicationDeadline.trim() === '' ? null : draft.applicationDeadline.trim(),
    applicationInstructions: draft.applicationInstructions,
  }
}

export type ParsedJobOpeningDraft =
  | { readonly isValid: true; readonly shopId: string; readonly input: SaveJobOpeningInput }
  | { readonly isValid: false; readonly fieldErrors: FormFieldErrors }

export function parseJobOpeningDraft(draft: JobOpeningDraft): ParsedJobOpeningDraft {
  const parseResult = saveJobOpeningInputSchema.safeParse(toCandidateInput(draft))
  const fieldErrors: Partial<Record<string, string>> = parseResult.success
    ? {}
    : { ...collectFieldErrors(parseResult.error) }
  if (draft.shopId === '') {
    fieldErrors.shopId = 'Choose the shop for this job opening.'
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

function finiteOrNull(parsedNumber: number | null): number | null {
  return parsedNumber !== null && Number.isFinite(parsedNumber) ? parsedNumber : null
}

/** What workers would see for the current form values; invalid numbers are left out, never guessed. */
export function draftToPreviewContent(draft: JobOpeningDraft): JobOpeningContent {
  const candidateInput = toCandidateInput(draft)
  const hasCompleteCompensation =
    candidateInput.compensationCurrency !== null && candidateInput.compensationPeriod !== null
  return {
    title: draft.title.trim(),
    description: textOrNull(draft.description),
    duties: draft.duties,
    workLocation: textOrNull(draft.workLocation),
    openingsCount: finiteOrNull(candidateInput.openingsCount as number | null),
    jobType: emptyChoiceToNull(draft.jobType),
    requiredSkills: draft.requiredSkills,
    minimumYearsExperience: finiteOrNull(candidateInput.minimumYearsExperience as number | null),
    experienceRequirement: textOrNull(draft.experienceRequirement),
    availabilityRequirement: textOrNull(draft.availabilityRequirement),
    scheduleDetails: textOrNull(draft.scheduleDetails),
    compensationMinAmount: hasCompleteCompensation
      ? finiteOrNull(candidateInput.compensationMinAmount as number | null)
      : null,
    compensationMaxAmount: hasCompleteCompensation
      ? finiteOrNull(candidateInput.compensationMaxAmount as number | null)
      : null,
    compensationCurrency: emptyChoiceToNull(draft.compensationCurrency),
    compensationPeriod: emptyChoiceToNull(draft.compensationPeriod),
    compensationDetails: textOrNull(draft.compensationDetails),
    benefits: textOrNull(draft.benefits),
    otherTerms: textOrNull(draft.otherTerms),
    minimumQualifications: draft.minimumQualifications,
    preferredQualifications: draft.preferredQualifications,
    requiredTraining: textOrNull(draft.requiredTraining),
    applicantRequirement: emptyChoiceToNull(draft.applicantRequirement),
    certificationExpectations: textOrNull(draft.certificationExpectations),
    applicationDeadline: textOrNull(draft.applicationDeadline),
    applicationInstructions: textOrNull(draft.applicationInstructions),
  }
}
