import type { z } from 'zod'
import type {
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerAvailabilityStatus,
  WorkerPreferredContactMethod,
  WorkerPrivateContact,
  WorkerProfile,
} from '../../domain/models/WorkerProfile'
import {
  collectFieldErrors,
  saveWorkerPrivateContactInputSchema,
  workerProfileAboutSchema,
  workerProfileAvailabilitySchema,
  workerProfileSkillsSchema,
  type WorkerProfileFieldErrors,
} from './workerProfileSchemas'

export type WorkerProfileStepKey = 'about' | 'skills' | 'availability' | 'contact'

export const workerProfileStepKeys: readonly WorkerProfileStepKey[] = [
  'about',
  'skills',
  'availability',
  'contact',
]

/** Form state: text inputs stay strings until validated. Empty selects stay ''. */
export interface WorkerProfileDraft {
  readonly headline: string
  readonly experienceSummary: string
  readonly yearsOfExperienceText: string
  readonly skills: readonly string[]
  readonly preferredLocations: readonly string[]
  readonly availabilityStatus: WorkerAvailabilityStatus | ''
  readonly availabilityNotes: string
  readonly contactPhone: string
  readonly contactEmail: string
  readonly preferredContactMethod: WorkerPreferredContactMethod | ''
}

export function createWorkerProfileDraft(
  workerProfile: WorkerProfile | null,
  workerPrivateContact: WorkerPrivateContact | null,
): WorkerProfileDraft {
  const storedYearsOfExperience = workerProfile?.yearsOfExperience ?? null
  return {
    headline: workerProfile?.headline ?? '',
    experienceSummary: workerProfile?.experienceSummary ?? '',
    yearsOfExperienceText:
      storedYearsOfExperience === null ? '' : String(storedYearsOfExperience),
    skills: workerProfile?.skills ?? [],
    preferredLocations: workerProfile?.preferredLocations ?? [],
    availabilityStatus: workerProfile?.availabilityStatus ?? '',
    availabilityNotes: workerProfile?.availabilityNotes ?? '',
    contactPhone: workerPrivateContact?.contactPhone ?? '',
    contactEmail: workerPrivateContact?.contactEmail ?? '',
    preferredContactMethod: workerPrivateContact?.preferredContactMethod ?? '',
  }
}

function parseYearsOfExperience(yearsOfExperienceText: string): number | null {
  const trimmedText = yearsOfExperienceText.trim()
  return trimmedText.length === 0 ? null : Number(trimmedText)
}

function stepCandidate(stepKey: WorkerProfileStepKey, draft: WorkerProfileDraft): unknown {
  switch (stepKey) {
    case 'about':
      return {
        headline: draft.headline,
        experienceSummary: draft.experienceSummary,
        yearsOfExperience: parseYearsOfExperience(draft.yearsOfExperienceText),
      }
    case 'skills':
      return { skills: draft.skills, preferredLocations: draft.preferredLocations }
    case 'availability':
      return {
        availabilityStatus: draft.availabilityStatus,
        availabilityNotes: draft.availabilityNotes,
      }
    case 'contact':
      return {
        contactPhone: draft.contactPhone,
        contactEmail: draft.contactEmail,
        preferredContactMethod:
          draft.preferredContactMethod === '' ? null : draft.preferredContactMethod,
      }
  }
}

const stepSchemas: Readonly<Record<WorkerProfileStepKey, z.ZodType>> = {
  about: workerProfileAboutSchema,
  skills: workerProfileSkillsSchema,
  availability: workerProfileAvailabilitySchema,
  contact: saveWorkerPrivateContactInputSchema,
}

/** Field errors for one step; an empty object means the step is valid. */
export function validateWorkerProfileStep(
  stepKey: WorkerProfileStepKey,
  draft: WorkerProfileDraft,
): WorkerProfileFieldErrors {
  const parseResult = stepSchemas[stepKey].safeParse(stepCandidate(stepKey, draft))
  return parseResult.success ? {} : collectFieldErrors(parseResult.error)
}

export interface ParsedWorkerProfileDraft {
  readonly workerProfileInput: SaveWorkerProfileInput
  readonly workerPrivateContactInput: SaveWorkerPrivateContactInput
}

/** Validated, normalised save inputs, or null when any step still has errors. */
export function parseWorkerProfileDraft(
  draft: WorkerProfileDraft,
): ParsedWorkerProfileDraft | null {
  const aboutResult = workerProfileAboutSchema.safeParse(stepCandidate('about', draft))
  const skillsResult = workerProfileSkillsSchema.safeParse(stepCandidate('skills', draft))
  const availabilityResult = workerProfileAvailabilitySchema.safeParse(
    stepCandidate('availability', draft),
  )
  const contactResult = saveWorkerPrivateContactInputSchema.safeParse(
    stepCandidate('contact', draft),
  )
  if (
    !aboutResult.success ||
    !skillsResult.success ||
    !availabilityResult.success ||
    !contactResult.success
  ) {
    return null
  }
  return {
    workerProfileInput: {
      ...aboutResult.data,
      ...skillsResult.data,
      ...availabilityResult.data,
    },
    workerPrivateContactInput: contactResult.data,
  }
}
