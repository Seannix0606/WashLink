import type {
  TrainingEnrollment,
  TrainingEnrollmentProgress,
  TrainingRosterEntry,
} from '../models/TrainingEnrollment'

export interface RespondToTrainingInvitationInput {
  readonly enrollmentId: string
  readonly accept: boolean
  /** Required to accept: the notice version the worker acknowledged. */
  readonly noticeVersion: string | null
  /** The program schedule_changed_at the worker reviewed (stale -> 55000). */
  readonly expectedScheduleChangedAt: string | null
}

/**
 * Training enrollments. The worker reads only their own rows; owners and trainers read a
 * program roster through training_roster_for_program. Every write is an RPC.
 */
export interface TrainingEnrollmentRepository {
  listMyEnrollments(): Promise<TrainingEnrollment[]>
  /** Rows of the server progress view (never computed in the app). */
  listProgress(enrollmentIds: readonly string[]): Promise<TrainingEnrollmentProgress[]>
  listRoster(programId: string): Promise<TrainingRosterEntry[]>
  invite(programId: string, jobApplicationId: string): Promise<TrainingEnrollment>
  respond(respondInput: RespondToTrainingInvitationInput): Promise<TrainingEnrollment>
  withdraw(enrollmentId: string): Promise<TrainingEnrollment>
  cancel(enrollmentId: string, reason: string | null): Promise<TrainingEnrollment>
}
