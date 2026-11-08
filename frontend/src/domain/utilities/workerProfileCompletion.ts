import type {
  WorkerPrivateContact,
  WorkerProfile,
} from '../models/WorkerProfile'

export type WorkerProfileSection =
  | 'about'
  | 'experience'
  | 'skills'
  | 'locations'
  | 'contact'

export const workerProfileSectionLabels: Readonly<
  Record<WorkerProfileSection, string>
> = {
  about: 'Headline',
  experience: 'Experience',
  skills: 'Skills',
  locations: 'Preferred locations',
  contact: 'Private contact',
}

const orderedWorkerProfileSections: readonly WorkerProfileSection[] = [
  'about',
  'experience',
  'skills',
  'locations',
  'contact',
]

export interface WorkerProfileCompletion {
  readonly completionPercent: number
  readonly missingSections: readonly WorkerProfileSection[]
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0
}

function isSectionComplete(
  section: WorkerProfileSection,
  workerProfile: WorkerProfile,
  workerPrivateContact: WorkerPrivateContact | null,
): boolean {
  switch (section) {
    case 'about':
      return hasText(workerProfile.headline)
    case 'experience':
      return (
        hasText(workerProfile.experienceSummary) ||
        workerProfile.yearsOfExperience !== null
      )
    case 'skills':
      return workerProfile.skills.length > 0
    case 'locations':
      return workerProfile.preferredLocations.length > 0
    case 'contact':
      return (
        workerPrivateContact !== null &&
        (hasText(workerPrivateContact.contactPhone) ||
          hasText(workerPrivateContact.contactEmail) ||
          workerPrivateContact.preferredContactMethod === 'in_app')
      )
  }
}

/** Pure: how complete a worker profile is, based only on stored values. */
export function calculateWorkerProfileCompletion(
  workerProfile: WorkerProfile | null,
  workerPrivateContact: WorkerPrivateContact | null,
): WorkerProfileCompletion {
  if (workerProfile === null) {
    return {
      completionPercent: 0,
      missingSections: orderedWorkerProfileSections,
    }
  }

  const missingSections = orderedWorkerProfileSections.filter(
    (section) => !isSectionComplete(section, workerProfile, workerPrivateContact),
  )
  const completedSectionCount =
    orderedWorkerProfileSections.length - missingSections.length

  return {
    completionPercent: Math.round(
      (completedSectionCount / orderedWorkerProfileSections.length) * 100,
    ),
    missingSections,
  }
}
