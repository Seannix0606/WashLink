import type {
  CurrentJobOpeningVersion,
  JobApplication,
  JobApplicationStatus,
} from '../models/JobApplication'

export interface CreateJobApplicationInput {
  readonly jobOpeningId: string
  readonly coverNote: string | null
  /** true submits now (needs noticeVersion); false saves a draft. */
  readonly submit: boolean
  readonly noticeVersion: string | null
}

/**
 * The signed-in worker's job applications. Every write is an RPC; status, owner,
 * stamps and the opening snapshot are set by the database and never sent.
 */
export interface JobApplicationRepository {
  listMyApplications(): Promise<JobApplication[]>
  /** Current versions of openings the worker applied to; unreadable ones are left out. */
  listCurrentOpeningVersions(jobOpeningIds: readonly string[]): Promise<CurrentJobOpeningVersion[]>
  createApplication(createJobApplicationInput: CreateJobApplicationInput): Promise<JobApplication>
  /** Fails when the draft changed since `expectedUpdatedAt`. */
  updateDraft(
    applicationId: string,
    coverNote: string | null,
    expectedUpdatedAt: string,
  ): Promise<JobApplication>
  deleteDraft(applicationId: string): Promise<void>
  /** The database checks `fromStatus` against the row (stale -> refused). */
  transition(
    applicationId: string,
    fromStatus: JobApplicationStatus,
    toStatus: JobApplicationStatus,
    noticeVersion: string | null,
  ): Promise<JobApplication>
}
