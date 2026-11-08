import { z } from 'zod'
import {
  workerAvailabilityStatuses,
  workerContactPhonePattern,
  workerPreferredContactMethods,
  workerProfileLimits as limits,
  type SaveWorkerPrivateContactInput,
  type SaveWorkerProfileInput,
} from '../../domain/models/WorkerProfile'
import {
  collectFieldErrors,
  optionalText,
  textList,
  type FormFieldErrors,
} from './formFieldSchemas'

// Mirrors the database limits (W2f) so people see errors before any request is sent.

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

export type WorkerProfileFieldErrors = FormFieldErrors

export { collectFieldErrors }

export function isWorkerPrivateContactEmpty(
  workerPrivateContactInput: SaveWorkerPrivateContactInput,
): boolean {
  return (
    workerPrivateContactInput.contactPhone === null &&
    workerPrivateContactInput.contactEmail === null &&
    workerPrivateContactInput.preferredContactMethod === null
  )
}
