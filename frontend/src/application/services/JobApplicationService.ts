import {
  jobApplicationNoticeVersion,
  type JobApplication,
  type MyJobApplication,
} from '../../domain/models/JobApplication'
import type { JobApplicationRepository } from '../../domain/repositories/JobApplicationRepository'
import {
  workerActionsForApplication,
  type WorkerJobApplicationAction,
} from '../../domain/utilities/jobApplicationLifecycle'
import { coverNoteSchema } from '../validation/jobApplicationSchemas'

export const noticeNotAcknowledgedMessage = 'Review the training and work notice before applying.'

export class JobApplicationValidationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'JobApplicationValidationError'
  }
}

/**
 * Worker job-application rules on the client. The database repeats every check
 * (create_job_application, transition_job_application) and stays the authority.
 */
export class JobApplicationService {
  public constructor(private readonly jobApplicationRepository: JobApplicationRepository) {}

  /** Own applications, each with the current version of its opening when still readable. */
  public async listMyApplications(): Promise<MyJobApplication[]> {
    const applications = await this.jobApplicationRepository.listMyApplications()
    const jobOpeningIds = [...new Set(applications.map((application) => application.jobOpeningId))]
    const currentOpenings = await this.jobApplicationRepository.listCurrentOpeningVersions(jobOpeningIds)
    const currentOpeningById = new Map(
      currentOpenings.map((currentOpening) => [currentOpening.jobOpeningId, currentOpening]),
    )
    return applications.map((application) => ({
      application,
      currentOpening: currentOpeningById.get(application.jobOpeningId) ?? null,
    }))
  }

  /** Submits at once; the notice must have been acknowledged in the apply dialog. */
  public async apply(
    jobOpeningId: string,
    coverNoteInput: string,
    hasAcknowledgedNotice: boolean,
  ): Promise<JobApplication> {
    const coverNote = this.validateCoverNote(coverNoteInput)
    this.requireNoticeAcknowledged(hasAcknowledgedNotice)
    return this.jobApplicationRepository.createApplication({
      jobOpeningId,
      coverNote,
      submit: true,
      noticeVersion: jobApplicationNoticeVersion,
    })
  }

  /**
   * Saves a changed cover note against the draft version the worker saw, then submits
   * from `draft` (both steps refuse a stale row).
   */
  public async submitDraft(
    draft: JobApplication,
    coverNoteInput: string,
    hasAcknowledgedNotice: boolean,
  ): Promise<JobApplication> {
    this.requireWorkerAction(draft, 'submit_draft')
    const coverNote = this.validateCoverNote(coverNoteInput)
    this.requireNoticeAcknowledged(hasAcknowledgedNotice)
    const savedDraft =
      coverNote === draft.coverNote
        ? draft
        : await this.jobApplicationRepository.updateDraft(draft.id, coverNote, draft.updatedAt)
    return this.jobApplicationRepository.transition(
      savedDraft.id,
      'draft',
      'submitted',
      jobApplicationNoticeVersion,
    )
  }

  public async deleteDraft(draft: JobApplication): Promise<void> {
    this.requireWorkerAction(draft, 'delete_draft')
    await this.jobApplicationRepository.deleteDraft(draft.id)
  }

  /** Withdraw (or decline once accepted); sends the status the worker saw. */
  public async withdraw(application: JobApplication): Promise<JobApplication> {
    this.requireWorkerAction(application, 'withdraw')
    return this.jobApplicationRepository.transition(
      application.id,
      application.status,
      'withdrawn',
      null,
    )
  }

  private requireWorkerAction(
    application: JobApplication,
    action: WorkerJobApplicationAction,
  ): void {
    if (!workerActionsForApplication(application).includes(action)) {
      throw new Error('This application status change is not allowed.')
    }
  }

  private requireNoticeAcknowledged(hasAcknowledgedNotice: boolean): void {
    if (!hasAcknowledgedNotice) {
      throw new JobApplicationValidationError(noticeNotAcknowledgedMessage)
    }
  }

  private validateCoverNote(coverNoteInput: string): string | null {
    const parseResult = coverNoteSchema.safeParse(coverNoteInput)
    if (!parseResult.success) {
      throw new JobApplicationValidationError(
        parseResult.error.issues.at(0)?.message ?? 'Check your cover note.',
      )
    }
    return parseResult.data
  }
}
