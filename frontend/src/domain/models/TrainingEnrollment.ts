import type { TrainingPayCurrency, TrainingPayPeriod, TrainingProgram } from './TrainingProgram'
import type { TrainingSession, TrainingSessionKind } from './TrainingSession'

export type TrainingEnrollmentStatus = 'invited' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled'

/**
 * Progress as derived by the database view training_enrollment_progress. It is never
 * computed in the app; completion needs the attended days AND a passed assessment.
 */
export type TrainingProgressStatus =
  | 'invited'
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_assessment'
  | 'completed'
  | 'failed'
  | 'declined'
  | 'withdrawn'
  | 'cancelled'
  | 'shop_removed'

export const trainingProgressStatuses: readonly TrainingProgressStatus[] = [
  'invited',
  'scheduled',
  'in_progress',
  'awaiting_assessment',
  'completed',
  'failed',
  'declined',
  'withdrawn',
  'cancelled',
  'shop_removed',
]

export type TrainingAssessmentResult = 'passed' | 'failed'

/**
 * The free-training notice the worker acknowledges when accepting. Sent as
 * p_notice_version; the database refuses any other value. Change only with the text.
 */
export const trainingEnrollmentNoticeVersion = 'w6_v1'

/** Database message (55000) when the schedule changed after the worker opened the invitation. */
export const staleTrainingInvitationMessage = 'This training program changed. Review it again.'

export const trainingEnrollmentLimits = {
  reasonMinLength: 10,
  reasonMaxLength: 300,
  liveEnrollmentsPerWorkerMaximum: 10,
  ownListMaximum: 200,
} as const

export interface TrainingTermsSnapshotSession {
  readonly sessionId: string
  readonly sessionDate: string
  readonly startTime: string | null
  readonly endTime: string | null
  readonly sessionKind: TrainingSessionKind
  readonly location: string | null
}

/** The program terms exactly as they were when the worker accepted (write-once). */
export interface TrainingTermsSnapshot {
  readonly snapshotVersion: number
  readonly shopName: string | null
  readonly shopAddress: string | null
  readonly title: string
  readonly objectives: string | null
  readonly skillsToLearn: readonly string[]
  readonly terms: string | null
  readonly minTrainingDays: number
  readonly assessmentChecklist: readonly string[]
  readonly workerFee: number
  readonly trainingPayAmount: number | null
  readonly trainingPayCurrency: TrainingPayCurrency | null
  readonly trainingPayPeriod: TrainingPayPeriod | null
  readonly trainingPayDetails: string | null
  readonly reimbursementDetails: string | null
  readonly sessions: readonly TrainingTermsSnapshotSession[]
}

export interface TrainingEnrollment {
  readonly id: string
  readonly programId: string
  /** Null once the shop or owner account was removed (D-18); the snapshots stay. */
  readonly shopId: string | null
  readonly shopNameSnapshot: string
  readonly programTitleSnapshot: string
  readonly ownerDisplayNameSnapshot: string
  readonly status: TrainingEnrollmentStatus
  readonly invitedAt: string
  readonly respondedAt: string | null
  readonly acceptedAt: string | null
  readonly endedAt: string | null
  readonly noticeVersion: string | null
  readonly noticeAcknowledgedAt: string | null
  readonly termsSnapshot: TrainingTermsSnapshot | null
  readonly termsSnapshotTakenAt: string | null
  readonly cancelReason: string | null
}

/** One row of training_enrollment_progress. */
export interface TrainingEnrollmentProgress {
  readonly enrollmentId: string
  readonly programId: string
  readonly enrollmentStatus: TrainingEnrollmentStatus
  readonly requiredTrainingDays: number
  readonly attendedTrainingDays: number
  readonly hasRecordedAttendance: boolean
  readonly currentAssessmentId: string | null
  readonly currentAssessmentResult: TrainingAssessmentResult | null
  readonly progressStatus: TrainingProgressStatus
}

/** One row of training_roster_for_program (owner: every enrollment; trainer: accepted only). */
export interface TrainingRosterEntry {
  readonly enrollmentId: string
  readonly displayName: string
  readonly enrollmentStatus: TrainingEnrollmentStatus
  readonly acceptedAt: string | null
  readonly requiredTrainingDays: number
  readonly attendedTrainingDays: number
  readonly hasRecordedAttendance: boolean
  readonly currentAssessmentId: string | null
  readonly currentAssessmentResult: TrainingAssessmentResult | null
  readonly progressStatus: TrainingProgressStatus
}

/** A worker's enrollment with its server progress and, while readable, the current program. */
export interface MyTraining {
  readonly enrollment: TrainingEnrollment
  readonly progress: TrainingEnrollmentProgress | null
  readonly program: TrainingProgram | null
  readonly sessions: readonly TrainingSession[]
}
