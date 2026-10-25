import type { ApplicantProfile } from '../../domain/models/ApplicantProfile'
import type { JobApplication } from '../../domain/models/JobApplication'
import type { JobOpeningStatus } from '../../domain/models/JobOpening'
import type { VerifiedCertification } from '../../domain/models/VerifiedCertification'
import type { ApplicantPipelineRepository } from '../../domain/repositories/ApplicantPipelineRepository'
import {
  isOwnerJobApplicationTransitionAllowed,
  type OwnerJobApplicationTransition,
} from '../../domain/utilities/jobApplicationLifecycle'

export interface ApplicantPipeline {
  readonly applications: readonly JobApplication[]
  /** Only applications in a sharing status have a profile (D-13). */
  readonly applicantProfileByApplicationId: ReadonlyMap<string, ApplicantProfile>
}

export type ApplicationCountByOpening = Readonly<Partial<Record<string, number>>>

/**
 * Owner applicant pipeline. Transitions are offered per the owner matrix; the
 * database (transition_job_application) re-checks actor, status and opening.
 */
export class ApplicantPipelineService {
  public constructor(private readonly applicantPipelineRepository: ApplicantPipelineRepository) {}

  public async loadPipeline(jobOpeningId: string): Promise<ApplicantPipeline> {
    const [applications, applicantProfiles] = await Promise.all([
      this.applicantPipelineRepository.listApplicationsForOpening(jobOpeningId),
      this.applicantPipelineRepository.listApplicantProfiles(jobOpeningId),
    ])
    return {
      applications,
      applicantProfileByApplicationId: new Map(
        applicantProfiles.map((applicantProfile) => [applicantProfile.applicationId, applicantProfile]),
      ),
    }
  }

  public async listVerifiedCertifications(applicationId: string): Promise<VerifiedCertification[]> {
    return this.applicantPipelineRepository.listVerifiedCertifications(applicationId)
  }

  public async countApplicationsByOpening(
    jobOpeningIds: readonly string[],
  ): Promise<ApplicationCountByOpening> {
    const applicationCounts =
      await this.applicantPipelineRepository.countApplicationsByOpening(jobOpeningIds)
    return Object.fromEntries(
      applicationCounts.map((applicationCount) => [
        applicationCount.jobOpeningId,
        applicationCount.applicationCount,
      ]),
    )
  }

  /** Sends the status the owner saw; a row that moved on is refused as stale. */
  public async transition(
    application: JobApplication,
    toStatus: OwnerJobApplicationTransition,
    openingStatus: JobOpeningStatus,
  ): Promise<JobApplication> {
    if (!isOwnerJobApplicationTransitionAllowed(application.status, toStatus, openingStatus)) {
      throw new Error('This application status change is not allowed.')
    }
    return this.applicantPipelineRepository.transition(application.id, application.status, toStatus)
  }
}
