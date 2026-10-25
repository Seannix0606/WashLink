import { z } from 'zod'
import {
  jobOpeningApplicantRequirements,
  jobOpeningCompensationCurrencies,
  jobOpeningCompensationPeriods,
  jobOpeningJobTypes,
  jobOpeningLimits as limits,
  type SaveJobOpeningInput,
} from '../../domain/models/JobOpening'
import { optionalText, textList } from './formFieldSchemas'

// Mirrors the public.job_openings CHECK constraints (W4c) so people see errors before any request.

export const compensationAmountFormatMessage = 'Enter an amount like 600 or 600.50.'

function hasAtMostTwoDecimals(amount: number): boolean {
  return Number(amount.toFixed(limits.compensationDecimalPlaces)) === amount
}

function compensationAmount(fieldLabel: string): z.ZodType<number | null> {
  return z
    .number({ error: compensationAmountFormatMessage })
    .gt(0, `${fieldLabel} must be more than 0.`)
    .lt(
      limits.compensationAmountExclusiveMaximum,
      `${fieldLabel} must be less than 10,000,000.`,
    )
    .refine(hasAtMostTwoDecimals, 'Use at most 2 decimal places.')
    .nullable()
}

function optionalWholeNumber(options: {
  readonly minimum: number
  readonly maximum: number
  readonly rangeMessage: string
}): z.ZodType<number | null> {
  return z
    .number({ error: 'Enter a whole number.' })
    .int('Enter a whole number.')
    .min(options.minimum, options.rangeMessage)
    .max(options.maximum, options.rangeMessage)
    .nullable()
}

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/

function isRealCalendarDate(dateText: string): boolean {
  const parsedDate = new Date(`${dateText}T00:00:00Z`)
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().startsWith(dateText)
}

const jobOpeningContentObjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(limits.titleMinLength, `Title must be at least ${String(limits.titleMinLength)} characters.`)
    .max(limits.titleMaxLength, `Title must be ${String(limits.titleMaxLength)} characters or fewer.`),
  description: optionalText(limits.descriptionMaxLength, 'Description'),
  duties: textList({
    maximumCount: limits.dutiesMaxCount,
    maximumItemLength: limits.dutyMaxLength,
    listLabel: 'duties',
    itemLabel: 'Duty',
  }),
  workLocation: optionalText(limits.workLocationMaxLength, 'Work location'),
  openingsCount: optionalWholeNumber({
    minimum: limits.openingsCountMinimum,
    maximum: limits.openingsCountMaximum,
    rangeMessage: `Number of openings must be between ${String(limits.openingsCountMinimum)} and ${String(limits.openingsCountMaximum)}.`,
  }),
  jobType: z.enum(jobOpeningJobTypes, { error: 'Choose a job type.' }).nullable(),
  requiredSkills: textList({
    maximumCount: limits.requiredSkillsMaxCount,
    maximumItemLength: limits.requiredSkillMaxLength,
    listLabel: 'skills',
    itemLabel: 'Skill',
  }),
  minimumYearsExperience: optionalWholeNumber({
    minimum: limits.minimumYearsExperienceMinimum,
    maximum: limits.minimumYearsExperienceMaximum,
    rangeMessage: `Minimum years of experience must be between ${String(limits.minimumYearsExperienceMinimum)} and ${String(limits.minimumYearsExperienceMaximum)}.`,
  }),
  experienceRequirement: optionalText(limits.experienceRequirementMaxLength, 'Experience requirement'),
  availabilityRequirement: optionalText(limits.availabilityRequirementMaxLength, 'Availability requirement'),
  scheduleDetails: optionalText(limits.scheduleDetailsMaxLength, 'Schedule details'),
  compensationMinAmount: compensationAmount('Minimum pay'),
  compensationMaxAmount: compensationAmount('Maximum pay'),
  compensationCurrency: z
    .enum(jobOpeningCompensationCurrencies, { error: 'Choose the currency.' })
    .nullable(),
  compensationPeriod: z
    .enum(jobOpeningCompensationPeriods, { error: 'Choose the pay period.' })
    .nullable(),
  compensationDetails: optionalText(limits.compensationDetailsMaxLength, 'Pay details'),
  benefits: optionalText(limits.benefitsMaxLength, 'Benefits'),
  otherTerms: optionalText(limits.otherTermsMaxLength, 'Other terms'),
  minimumQualifications: textList({
    maximumCount: limits.qualificationsMaxCount,
    maximumItemLength: limits.qualificationMaxLength,
    listLabel: 'minimum qualifications',
    itemLabel: 'Qualification',
  }),
  preferredQualifications: textList({
    maximumCount: limits.qualificationsMaxCount,
    maximumItemLength: limits.qualificationMaxLength,
    listLabel: 'preferred qualifications',
    itemLabel: 'Qualification',
  }),
  requiredTraining: optionalText(limits.requiredTrainingMaxLength, 'Required training'),
  applicantRequirement: z
    .enum(jobOpeningApplicantRequirements, { error: 'Choose who can apply.' })
    .nullable(),
  certificationExpectations: optionalText(
    limits.certificationExpectationsMaxLength,
    'Certification expectations',
  ),
  applicationDeadline: z
    .string()
    .regex(calendarDatePattern, 'Enter the deadline as a date.')
    .refine(isRealCalendarDate, 'Enter a real calendar date.')
    .nullable(),
  applicationInstructions: optionalText(
    limits.applicationInstructionsMaxLength,
    'Application instructions',
  ),
})

type JobOpeningCompensationFields = Pick<
  SaveJobOpeningInput,
  'compensationMinAmount' | 'compensationMaxAmount' | 'compensationCurrency' | 'compensationPeriod'
>

/** Same rule as job_openings_compensation_complete plus max >= min. */
function checkCompensationCompleteness(
  compensation: JobOpeningCompensationFields,
  validationContext: z.RefinementCtx,
): void {
  const hasAmount =
    compensation.compensationMinAmount !== null || compensation.compensationMaxAmount !== null
  if (hasAmount && compensation.compensationCurrency === null) {
    validationContext.addIssue({
      code: 'custom',
      path: ['compensationCurrency'],
      message: 'Choose the currency for the pay amount.',
    })
  }
  if (hasAmount && compensation.compensationPeriod === null) {
    validationContext.addIssue({
      code: 'custom',
      path: ['compensationPeriod'],
      message: 'Choose the pay period for the pay amount.',
    })
  }
  if (
    !hasAmount &&
    (compensation.compensationCurrency !== null || compensation.compensationPeriod !== null)
  ) {
    validationContext.addIssue({
      code: 'custom',
      path: ['compensationMinAmount'],
      message: 'Enter a pay amount, or clear the currency and pay period.',
    })
  }
  if (
    compensation.compensationMinAmount !== null &&
    compensation.compensationMaxAmount !== null &&
    compensation.compensationMaxAmount < compensation.compensationMinAmount
  ) {
    validationContext.addIssue({
      code: 'custom',
      path: ['compensationMaxAmount'],
      message: 'Maximum pay cannot be less than minimum pay.',
    })
  }
}

export const saveJobOpeningInputSchema: z.ZodType<SaveJobOpeningInput> =
  jobOpeningContentObjectSchema.superRefine(checkCompensationCompleteness)
