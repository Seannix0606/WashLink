export type WorkerAvailabilityStatus =
  | 'full_time'
  | 'part_time'
  | 'weekends_only'
  | 'flexible'
  | 'not_available'

export const workerAvailabilityStatuses: readonly WorkerAvailabilityStatus[] = [
  'full_time',
  'part_time',
  'weekends_only',
  'flexible',
  'not_available',
]

export type WorkerPreferredContactMethod = 'phone' | 'email' | 'in_app'

export const workerPreferredContactMethods: readonly WorkerPreferredContactMethod[] =
  ['phone', 'email', 'in_app']

/** Mirrors the CHECK constraints of public.worker_profiles / worker_private_contacts (W2f). */
export const workerProfileLimits = {
  headlineMaxLength: 120,
  experienceSummaryMaxLength: 2000,
  yearsOfExperienceMinimum: 0,
  yearsOfExperienceMaximum: 60,
  skillsMaxCount: 30,
  skillMaxLength: 60,
  preferredLocationsMaxCount: 10,
  preferredLocationMaxLength: 120,
  availabilityNotesMaxLength: 300,
  contactEmailMaxLength: 254,
} as const

export const workerContactPhonePattern = /^[+0-9 ()-]{7,20}$/

export interface WorkerProfile {
  readonly profileIdentifier: string
  readonly headline: string | null
  readonly experienceSummary: string | null
  readonly yearsOfExperience: number | null
  readonly skills: readonly string[]
  readonly preferredLocations: readonly string[]
  readonly availabilityStatus: WorkerAvailabilityStatus
  readonly availabilityNotes: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface WorkerPrivateContact {
  readonly contactPhone: string | null
  readonly contactEmail: string | null
  readonly preferredContactMethod: WorkerPreferredContactMethod | null
}

/** The signed-in worker's own profile; both parts are null until created. */
export interface OwnWorkerProfile {
  readonly workerProfile: WorkerProfile | null
  readonly workerPrivateContact: WorkerPrivateContact | null
}

export interface SaveWorkerProfileInput {
  readonly headline: string | null
  readonly experienceSummary: string | null
  readonly yearsOfExperience: number | null
  readonly skills: readonly string[]
  readonly preferredLocations: readonly string[]
  readonly availabilityStatus: WorkerAvailabilityStatus
  readonly availabilityNotes: string | null
}

export type SaveWorkerPrivateContactInput = WorkerPrivateContact
