import { z } from 'zod'
import {
  workerAvailabilityStatuses,
  workerContactPhonePattern,
  workerPreferredContactMethods,
  workerProfileLimits as limits,
  type SaveWorkerPrivateContactInput,
  type SaveWorkerProfileInput,
} from '../../domain/models/WorkerProfile'

// Mirrors the database limits (W2f) so people see errors before any request is sent.

function optionalText(maximumLength: number, fieldLabel: string): z.ZodType<string | null> {
  return z
    .string()
    .trim()
    .max(maximumLength, `${fieldLabel} must be ${String(maximumLength)} characters or fewer.`)
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value))
}

function textList(options: {
  readonly maximumCount: number
  readonly maximumItemLength: number
  readonly listLabel: string
  readonly itemLabel: string
}): z.ZodType<string[]> {
  return z
    .array(
      z
        .string()
        .trim()
        .min(1, `${options.itemLabel} cannot be empty.`)
        .max(
          options.maximumItemLength,
          `Each ${options.itemLabel.toLowerCase()} must be ${String(options.maximumItemLength)} characters or fewer.`,
        ),
    )
    .max(
      options.maximumCount,
      `Add at most ${String(options.maximumCount)} ${options.listLabel}.`,
    )
}

export const workerProfileAboutSchema = z.object({
  headline: z
    .string()
    .trim()
    .min(1, 'Add a short headline, for example "Car wash attendant".')
    .max(limits.headlineMaxLength, `Headline must be ${String(limits.headlineMaxLength)} characters or fewer.`),
  experienceSummary: optionalText(limits.experienceSummaryMaxLength, 'Experience summary'),
  yearsOfExperience: z
    .number({ error: 'Enter a whole number of years.' })
    .int('Enter a whole number of years.')
    .min(limits.yearsOfExperienceMinimum, 'Years of experience cannot be negative.')
    .max(limits.yearsOfExperienceMaximum, `Years of experience must be ${String(limits.yearsOfExperienceMaximum)} or less.`)
    .nullable(),
})

export const workerProfileSkillsSchema = z.object({
  skills: textList({
    maximumCount: limits.skillsMaxCount,
    maximumItemLength: limits.skillMaxLength,
    listLabel: 'skills',
    itemLabel: 'Skill',
  }),
  preferredLocations: textList({
    maximumCount: limits.preferredLocationsMaxCount,
    maximumItemLength: limits.preferredLocationMaxLength,
    listLabel: 'locations',
    itemLabel: 'Location',
  }),
})

export const workerProfileAvailabilitySchema = z.object({
  availabilityStatus: z.enum(workerAvailabilityStatuses, {
    error: 'Choose your availability.',
  }),
  availabilityNotes: optionalText(limits.availabilityNotesMaxLength, 'Availability notes'),
})

export const saveWorkerProfileInputSchema: z.ZodType<SaveWorkerProfileInput> =
  workerProfileAboutSchema
    .extend(workerProfileSkillsSchema.shape)
    .extend(workerProfileAvailabilitySchema.shape)

export const saveWorkerPrivateContactInputSchema: z.ZodType<SaveWorkerPrivateContactInput> =
  z.object({
    contactPhone: z
      .string()
      .trim()
      .nullable()
      .transform((value) => (value === null || value.length === 0 ? null : value))
      .refine(
        (value) => value === null || workerContactPhonePattern.test(value),
        'Use 7 to 20 digits; spaces, +, -, ( and ) are allowed.',
      ),
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .nullable()
      .transform((value) => (value === null || value.length === 0 ? null : value))
      .refine(
        (value) =>
          value === null ||
          (value.length <= limits.contactEmailMaxLength &&
            z.email().safeParse(value).success),
        'Enter a valid email address.',
      ),
    preferredContactMethod: z.enum(workerPreferredContactMethods).nullable(),
  })

export type WorkerProfileFieldErrors = Readonly<Partial<Record<string, string>>>

/** First error message per top-level field, for inline form errors. */
export function collectFieldErrors(validationError: z.ZodError): WorkerProfileFieldErrors {
  const fieldErrors: Partial<Record<string, string>> = {}
  for (const validationIssue of validationError.issues) {
    const fieldName = String(validationIssue.path.at(0) ?? 'form')
    fieldErrors[fieldName] ??= validationIssue.message
  }
  return fieldErrors
}

export function isWorkerPrivateContactEmpty(
  workerPrivateContactInput: SaveWorkerPrivateContactInput,
): boolean {
  return (
    workerPrivateContactInput.contactPhone === null &&
    workerPrivateContactInput.contactEmail === null &&
    workerPrivateContactInput.preferredContactMethod === null
  )
}
