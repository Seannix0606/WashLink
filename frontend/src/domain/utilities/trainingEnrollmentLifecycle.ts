import type {
  TrainingEnrollmentStatus,
  TrainingProgressStatus,
} from '../models/TrainingEnrollment'
import type { TrainingProgramStatus } from '../models/TrainingProgram'
import { toManilaCalendarDate } from './jobOpeningLifecycle'

/**
 * Mirrors the enrollment RPCs (W6f) and the evidence RPCs (W6g) per actor. The database
 * stays the authority; progress always comes from the server view, never from dates here.
 */
export type WorkerTrainingAction = 'accept' | 'decline' | 'leave'

export type OwnerTrainingEnrollmentAction = 'cancel_invitation' | 'cancel_enrollment'

/**
 * Owner cancel mirrors `cancel_training_enrollment`: a failed enrollment can be cancelled (D-84), a completed one
 * cannot, and after a shop removal the owner no longer passes the RPC's program-owner check (42501).
 */
const ownerCannotCancelProgressStatuses: ReadonlySet<TrainingProgressStatus> = new Set(['completed', 'shop_removed'])

export function workerTrainingActions(
  enrollmentStatus: TrainingEnrollmentStatus,
  progressStatus: TrainingProgressStatus | null,
  programStatus: TrainingProgramStatus | null,
): readonly WorkerTrainingAction[] {
  if (enrollmentStatus === 'invited') {
    const canAccept = progressStatus !== 'shop_removed' && programStatus === 'open'
    return canAccept ? ['accept', 'decline'] : ['decline']
  }
  if (enrollmentStatus === 'accepted') {
    // A worker may leave anything not completed, also after a not-passed assessment or a shop removal (D-84).
    return progressStatus === 'completed' ? [] : ['leave']
  }
  return []
}

export function ownerTrainingEnrollmentActions(
  enrollmentStatus: TrainingEnrollmentStatus,
  progressStatus: TrainingProgressStatus,
): readonly OwnerTrainingEnrollmentAction[] {
  if (enrollmentStatus === 'invited') {
    return ['cancel_invitation']
  }
  if (enrollmentStatus === 'accepted' && !ownerCannotCancelProgressStatuses.has(progressStatus)) {
    return ['cancel_enrollment']
  }
  return []
}

/** Cancelling an accepted enrollment needs a reason; withdrawing an invitation does not. */
export function isCancelReasonRequired(enrollmentStatus: TrainingEnrollmentStatus): boolean {
  return enrollmentStatus === 'accepted'
}

/** Attendance is recorded for accepted, unfinished training of a shop still on WashLink. */
export function canRecordTrainingAttendance(
  enrollmentStatus: TrainingEnrollmentStatus,
  progressStatus: TrainingProgressStatus,
): boolean {
  return enrollmentStatus === 'accepted' && progressStatus !== 'completed' && progressStatus !== 'shop_removed'
}

/** The first assessment is offered only once the server reports the required days attended. */
export function canRecordTrainingAssessment(
  enrollmentStatus: TrainingEnrollmentStatus,
  progressStatus: TrainingProgressStatus,
): boolean {
  return enrollmentStatus === 'accepted' && progressStatus === 'awaiting_assessment'
}

/** A recorded assessment is changed (or re-assessed after a fail) only by a correction. */
export function canCorrectTrainingAssessment(
  enrollmentStatus: TrainingEnrollmentStatus,
  progressStatus: TrainingProgressStatus,
  currentAssessmentId: string | null,
): boolean {
  return (
    enrollmentStatus === 'accepted' &&
    currentAssessmentId !== null &&
    (progressStatus === 'completed' || progressStatus === 'failed')
  )
}

export type TrainingSessionRecordability = 'recordable' | 'not_yet' | 'before_enrollment'

/** Attendance can be taken only on or after the session day and not before the worker enrolled. */
export function describeSessionRecordability(
  sessionDate: string,
  acceptedAt: string | null,
  currentInstant: Date,
): TrainingSessionRecordability {
  if (sessionDate > toManilaCalendarDate(currentInstant)) {
    return 'not_yet'
  }
  if (acceptedAt !== null && sessionDate < toManilaCalendarDate(new Date(acceptedAt))) {
    return 'before_enrollment'
  }
  return 'recordable'
}
