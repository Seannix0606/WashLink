import type { ApplicantProfile } from '../models/ApplicantProfile'
import type { JobApplication, JobApplicationStatus } from '../models/JobApplication'
import type { VerifiedCertification } from '../models/VerifiedCertification'

export interface JobOpeningApplicationCount {
  readonly jobOpeningId: string
  readonly applicationCount: number
}

/**
 * Owner view of applications to their own openings. Applicant data comes only from the
 * narrow definer functions; worker_private_contacts is never read.
 */
export interface ApplicantPipelineRepository {
  /** Non-draft applications of one opening (RLS scopes them to the owner). */
  listApplicationsForOpening(jobOpeningId: string): Promise<JobApplication[]>
  /** Profiles only for applications in a sharing status (submitted .. accepted). */
  listApplicantProfiles(jobOpeningId: string): Promise<ApplicantProfile[]>
  /** Current shop-issued certifications only (W7). */
  listVerifiedCertifications(applicationId: string): Promise<VerifiedCertification[]>
  countApplicationsByOpening(jobOpeningIds: readonly string[]): Promise<JobOpeningApplicationCount[]>
  transition(
    applicationId: string,
    fromStatus: JobApplicationStatus,
    toStatus: JobApplicationStatus,
  ): Promise<JobApplication>
}
