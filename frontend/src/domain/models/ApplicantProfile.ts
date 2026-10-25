import type { WorkerAvailabilityStatus } from './WorkerProfile'

/**
 * What an owner sees about an applicant (applicant_profiles_for_job_opening). Everything
 * here is self-reported by the worker and not verified by WashLink. There are no contact
 * fields: private contacts are never shared with shops in W5 (D-14).
 */
export interface ApplicantProfile {
  readonly applicationId: string
  /** The account's full name, or "Applicant" when none is set. */
  readonly displayName: string
  readonly headline: string | null
  readonly experienceSummary: string | null
  readonly yearsOfExperience: number | null
  readonly skills: readonly string[]
  readonly preferredLocations: readonly string[]
  readonly availabilityStatus: WorkerAvailabilityStatus | null
  readonly availabilityNotes: string | null
  readonly profileUpdatedAt: string | null
}
