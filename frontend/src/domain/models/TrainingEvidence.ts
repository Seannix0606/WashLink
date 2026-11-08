import type { TrainingAssessmentResult } from './TrainingEnrollment'
import type { TrainingSessionKind } from './TrainingSession'

export type TrainingAttendanceStatus = 'present' | 'absent'

export const trainingAttendanceStatuses: readonly TrainingAttendanceStatus[] = ['present', 'absent']

export type TrainingRecorderRole = 'owner' | 'trainer'

/** Mirrors public.training_attendance_records and public.training_assessments (W6d, W6g). */
export const trainingEvidenceLimits = {
  progressNoteMaxLength: 500,
  assessorCommentMaxLength: 500,
  correctionReasonMinLength: 10,
  correctionReasonMaxLength: 300,
  failureReasonMinLength: 10,
  failureReasonMaxLength: 300,
} as const

interface TrainingEvidenceBase {
  readonly evidenceId: string
  /** The record this one corrects; null for an original record. */
  readonly supersedesId: string | null
  /** False once a later correction replaced it. Superseded records stay visible. */
  readonly isCurrent: boolean
  readonly recorderRole: TrainingRecorderRole
  readonly recordedByDisplayName: string
  readonly recordedAt: string
  readonly correctionReason: string | null
}

export interface TrainingAttendanceEvidence extends TrainingEvidenceBase {
  readonly evidenceKind: 'attendance'
  readonly sessionId: string
  readonly sessionDate: string
  readonly sessionKind: TrainingSessionKind
  readonly attendanceStatus: TrainingAttendanceStatus
  readonly progressNote: string | null
}

export interface TrainingAssessmentEvidence extends TrainingEvidenceBase {
  readonly evidenceKind: 'assessment'
  readonly checklistSnapshot: readonly string[]
  readonly itemsMet: readonly boolean[]
  readonly result: TrainingAssessmentResult
  readonly assessorComment: string | null
  /** The recorder's reason for a fail, as stored; null for a pass. */
  readonly failureReason: string | null
}

/** One row of training_evidence_for_enrollment. Evidence is append-only. */
export type TrainingEvidenceEntry = TrainingAttendanceEvidence | TrainingAssessmentEvidence

export interface RecordTrainingAttendanceInput {
  readonly enrollmentId: string
  readonly sessionId: string
  readonly attendanceStatus: TrainingAttendanceStatus
  readonly progressNote: string | null
}

export interface CorrectTrainingAttendanceInput {
  readonly attendanceId: string
  readonly attendanceStatus: TrainingAttendanceStatus
  readonly progressNote: string | null
  readonly correctionReason: string
}

export interface RecordTrainingAssessmentInput {
  readonly enrollmentId: string
  /** One per checklist item, in order. */
  readonly itemsMet: readonly boolean[]
  readonly result: TrainingAssessmentResult
  readonly assessorComment: string | null
  /** Required (10..300 characters) for a 'failed' result; null for 'passed'. */
  readonly failureReason: string | null
}

export interface CorrectTrainingAssessmentInput {
  readonly assessmentId: string
  readonly itemsMet: readonly boolean[]
  readonly result: TrainingAssessmentResult
  readonly assessorComment: string | null
  /** Required (10..300 characters) for a 'failed' result; null for 'passed'. */
  readonly failureReason: string | null
  readonly correctionReason: string
}
