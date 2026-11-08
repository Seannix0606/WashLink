import type {
  TrainingAssessmentResult,
  TrainingEnrollment,
  TrainingEnrollmentProgress,
  TrainingEnrollmentStatus,
  TrainingProgressStatus,
  TrainingRosterEntry,
  TrainingTermsSnapshot,
} from '../../domain/models/TrainingEnrollment'
import type {
  TrainingAttendanceStatus,
  TrainingEvidenceEntry,
  TrainingRecorderRole,
} from '../../domain/models/TrainingEvidence'
import type { TrainingPayCurrency, TrainingPayPeriod } from '../../domain/models/TrainingProgram'
import type { TrainingSessionKind } from '../../domain/models/TrainingSession'
import { toStoredAmount } from './supabaseTrainingRows'

/** Explicit columns only: never `*`, never worker_id / owner_id (filters only). */
export const trainingEnrollmentSelectColumns = [
  'id',
  'program_id',
  'shop_id',
  'shop_name_snapshot',
  'program_title_snapshot',
  'owner_display_name_snapshot',
  'status',
  'invited_at',
  'responded_at',
  'accepted_at',
  'ended_at',
  'notice_version',
  'notice_acknowledged_at',
  'terms_snapshot',
  'terms_snapshot_taken_at',
  'cancel_reason',
].join(', ')

export const trainingProgressSelectColumns = [
  'enrollment_id',
  'program_id',
  'enrollment_status',
  'required_training_days',
  'attended_training_days',
  'has_recorded_attendance',
  'current_assessment_id',
  'current_assessment_result',
  'progress_status',
].join(', ')

interface SupabaseTermsSnapshotSessionJson {
  session_id: string
  session_date: string
  start_time: string | null
  end_time: string | null
  session_kind: TrainingSessionKind
  location: string | null
}

/** jsonb written by training_enrollment_terms_snapshot (snapshot_version 1). */
export interface SupabaseTermsSnapshotJson {
  snapshot_version: number
  shop_name: string | null
  shop_address: string | null
  title: string
  objectives: string | null
  skills_to_learn: string[] | null
  terms: string | null
  min_training_days: number
  assessment_checklist: string[] | null
  worker_fee: number | string
  training_pay_amount: number | string | null
  training_pay_currency: TrainingPayCurrency | null
  training_pay_period: TrainingPayPeriod | null
  training_pay_details: string | null
  reimbursement_details: string | null
  sessions: SupabaseTermsSnapshotSessionJson[] | null
}

export interface SupabaseTrainingEnrollmentRow {
  id: string
  program_id: string
  shop_id: string | null
  shop_name_snapshot: string
  program_title_snapshot: string
  owner_display_name_snapshot: string
  status: TrainingEnrollmentStatus
  invited_at: string
  responded_at: string | null
  accepted_at: string | null
  ended_at: string | null
  notice_version: string | null
  notice_acknowledged_at: string | null
  terms_snapshot: SupabaseTermsSnapshotJson | null
  terms_snapshot_taken_at: string | null
  cancel_reason: string | null
}

function mapTermsSnapshot(snapshotJson: SupabaseTermsSnapshotJson | null): TrainingTermsSnapshot | null {
  if (snapshotJson === null || typeof snapshotJson !== 'object') {
    return null
  }
  return {
    snapshotVersion: snapshotJson.snapshot_version,
    shopName: snapshotJson.shop_name,
    shopAddress: snapshotJson.shop_address,
    title: snapshotJson.title,
    objectives: snapshotJson.objectives,
    skillsToLearn: snapshotJson.skills_to_learn ?? [],
    terms: snapshotJson.terms,
    minTrainingDays: snapshotJson.min_training_days,
    assessmentChecklist: snapshotJson.assessment_checklist ?? [],
    workerFee: toStoredAmount(snapshotJson.worker_fee) ?? 0,
    trainingPayAmount: toStoredAmount(snapshotJson.training_pay_amount),
    trainingPayCurrency: snapshotJson.training_pay_currency,
    trainingPayPeriod: snapshotJson.training_pay_period,
    trainingPayDetails: snapshotJson.training_pay_details,
    reimbursementDetails: snapshotJson.reimbursement_details,
    sessions: (snapshotJson.sessions ?? []).map((sessionJson) => ({
      sessionId: sessionJson.session_id,
      sessionDate: sessionJson.session_date,
      startTime: sessionJson.start_time,
      endTime: sessionJson.end_time,
      sessionKind: sessionJson.session_kind,
      location: sessionJson.location,
    })),
  }
}

export function mapTrainingEnrollmentRow(enrollmentRow: SupabaseTrainingEnrollmentRow): TrainingEnrollment {
  return {
    id: enrollmentRow.id,
    programId: enrollmentRow.program_id,
    shopId: enrollmentRow.shop_id,
    shopNameSnapshot: enrollmentRow.shop_name_snapshot,
    programTitleSnapshot: enrollmentRow.program_title_snapshot,
    ownerDisplayNameSnapshot: enrollmentRow.owner_display_name_snapshot,
    status: enrollmentRow.status,
    invitedAt: enrollmentRow.invited_at,
    respondedAt: enrollmentRow.responded_at,
    acceptedAt: enrollmentRow.accepted_at,
    endedAt: enrollmentRow.ended_at,
    noticeVersion: enrollmentRow.notice_version,
    noticeAcknowledgedAt: enrollmentRow.notice_acknowledged_at,
    termsSnapshot: mapTermsSnapshot(enrollmentRow.terms_snapshot),
    termsSnapshotTakenAt: enrollmentRow.terms_snapshot_taken_at,
    cancelReason: enrollmentRow.cancel_reason,
  }
}

export interface SupabaseTrainingProgressRow {
  enrollment_id: string
  program_id: string
  enrollment_status: TrainingEnrollmentStatus
  required_training_days: number
  attended_training_days: number
  has_recorded_attendance: boolean
  current_assessment_id: string | null
  current_assessment_result: TrainingAssessmentResult | null
  progress_status: TrainingProgressStatus
}

export function mapTrainingProgressRow(progressRow: SupabaseTrainingProgressRow): TrainingEnrollmentProgress {
  return {
    enrollmentId: progressRow.enrollment_id,
    programId: progressRow.program_id,
    enrollmentStatus: progressRow.enrollment_status,
    requiredTrainingDays: progressRow.required_training_days,
    attendedTrainingDays: progressRow.attended_training_days,
    hasRecordedAttendance: progressRow.has_recorded_attendance,
    currentAssessmentId: progressRow.current_assessment_id,
    currentAssessmentResult: progressRow.current_assessment_result,
    progressStatus: progressRow.progress_status,
  }
}

/** Row of training_roster_for_program (no contact or profile fields exist in it). */
export interface SupabaseTrainingRosterRow extends Omit<SupabaseTrainingProgressRow, 'program_id'> {
  display_name: string
  accepted_at: string | null
}

export function mapTrainingRosterRow(rosterRow: SupabaseTrainingRosterRow): TrainingRosterEntry {
  return {
    enrollmentId: rosterRow.enrollment_id,
    displayName: rosterRow.display_name,
    enrollmentStatus: rosterRow.enrollment_status,
    acceptedAt: rosterRow.accepted_at,
    requiredTrainingDays: rosterRow.required_training_days,
    attendedTrainingDays: rosterRow.attended_training_days,
    hasRecordedAttendance: rosterRow.has_recorded_attendance,
    currentAssessmentId: rosterRow.current_assessment_id,
    currentAssessmentResult: rosterRow.current_assessment_result,
    progressStatus: rosterRow.progress_status,
  }
}

/** Row of training_evidence_for_enrollment. */
export interface SupabaseTrainingEvidenceRow {
  evidence_kind: 'attendance' | 'assessment'
  evidence_id: string
  supersedes_id: string | null
  is_current: boolean
  session_id: string | null
  session_date: string | null
  session_kind: TrainingSessionKind | null
  attendance_status: TrainingAttendanceStatus | null
  progress_note: string | null
  checklist_snapshot: string[] | null
  items_met: boolean[] | null
  result: TrainingAssessmentResult | null
  assessor_comment: string | null
  failure_reason: string | null
  recorder_role: TrainingRecorderRole
  recorded_by_display_name: string
  recorded_at: string
  correction_reason: string | null
}

/** A row missing the fields of its kind is left out (never filled with a guessed value). */
export function mapTrainingEvidenceRow(evidenceRow: SupabaseTrainingEvidenceRow): TrainingEvidenceEntry | null {
  const sharedFields = {
    evidenceId: evidenceRow.evidence_id,
    supersedesId: evidenceRow.supersedes_id,
    isCurrent: evidenceRow.is_current,
    recorderRole: evidenceRow.recorder_role,
    recordedByDisplayName: evidenceRow.recorded_by_display_name,
    recordedAt: evidenceRow.recorded_at,
    correctionReason: evidenceRow.correction_reason,
  }
  if (evidenceRow.evidence_kind === 'assessment') {
    if (evidenceRow.result === null) {
      return null
    }
    return {
      ...sharedFields,
      evidenceKind: 'assessment',
      checklistSnapshot: evidenceRow.checklist_snapshot ?? [],
      itemsMet: evidenceRow.items_met ?? [],
      result: evidenceRow.result,
      assessorComment: evidenceRow.assessor_comment,
      failureReason: evidenceRow.failure_reason,
    }
  }
  const { session_id: sessionId, session_date: sessionDate, session_kind: sessionKind } = evidenceRow
  if (sessionId === null || sessionDate === null || sessionKind === null || evidenceRow.attendance_status === null) {
    return null
  }
  return {
    ...sharedFields,
    evidenceKind: 'attendance',
    sessionId,
    sessionDate,
    sessionKind,
    attendanceStatus: evidenceRow.attendance_status,
    progressNote: evidenceRow.progress_note,
  }
}
