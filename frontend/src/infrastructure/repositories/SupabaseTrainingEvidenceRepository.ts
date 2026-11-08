import type {
  CorrectTrainingAssessmentInput,
  CorrectTrainingAttendanceInput,
  RecordTrainingAssessmentInput,
  RecordTrainingAttendanceInput,
  TrainingEvidenceEntry,
} from '../../domain/models/TrainingEvidence'
import type { TrainingEvidenceRepository } from '../../domain/repositories/TrainingEvidenceRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  mapTrainingEvidenceRow,
  type SupabaseTrainingEvidenceRow,
} from '../supabase/supabaseTrainingEnrollmentRows'
import { hasReturnedRow, trainingNoRowMessage } from '../supabase/supabaseTrainingRows'

async function callEvidenceRpc(
  rpcName: string,
  rpcArguments: Record<string, unknown>,
  fallbackMessage: string,
): Promise<void> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasReturnedRow(rpcResponse.data)) {
    throw new Error(trainingNoRowMessage)
  }
}

/**
 * Comment and fail reason as the RPCs take them (W6 review polish, DB shape in w6g:
 * `p_failure_reason text default null`, required 10..300 for 'failed', null otherwise).
 */
export function toAssessmentTextParams(assessmentInput: {
  readonly result: RecordTrainingAssessmentInput['result']
  readonly assessorComment: string | null
  readonly failureReason: string | null
}): { readonly p_assessor_comment: string | null; readonly p_failure_reason: string | null } {
  return {
    p_assessor_comment: assessmentInput.assessorComment,
    p_failure_reason: assessmentInput.result === 'failed' ? assessmentInput.failureReason : null,
  }
}

/**
 * Append-only training evidence. There is no update or delete call anywhere: a
 * correction is a new record that names the record it supersedes and a reason.
 */
export class SupabaseTrainingEvidenceRepository implements TrainingEvidenceRepository {
  public async listEvidence(enrollmentId: string): Promise<TrainingEvidenceEntry[]> {
    const rpcResponse = await getSupabaseClient().rpc('training_evidence_for_enrollment', {
      p_enrollment_id: enrollmentId,
    })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not load the training records.')
    }
    return (rpcResponse.data as unknown as SupabaseTrainingEvidenceRow[])
      .map(mapTrainingEvidenceRow)
      .filter((evidenceEntry): evidenceEntry is TrainingEvidenceEntry => evidenceEntry !== null)
  }

  public async recordAttendance(recordInput: RecordTrainingAttendanceInput): Promise<void> {
    await callEvidenceRpc(
      'record_training_attendance',
      {
        p_enrollment_id: recordInput.enrollmentId,
        p_session_id: recordInput.sessionId,
        p_attendance_status: recordInput.attendanceStatus,
        p_progress_note: recordInput.progressNote,
      },
      'Could not record attendance.',
    )
  }

  public async correctAttendance(correctInput: CorrectTrainingAttendanceInput): Promise<void> {
    await callEvidenceRpc(
      'correct_training_attendance',
      {
        p_attendance_id: correctInput.attendanceId,
        p_attendance_status: correctInput.attendanceStatus,
        p_progress_note: correctInput.progressNote,
        p_correction_reason: correctInput.correctionReason,
      },
      'Could not record the correction.',
    )
  }

  public async recordAssessment(recordInput: RecordTrainingAssessmentInput): Promise<void> {
    await callEvidenceRpc(
      'record_training_assessment',
      {
        p_enrollment_id: recordInput.enrollmentId,
        p_items_met: [...recordInput.itemsMet],
        p_result: recordInput.result,
        ...toAssessmentTextParams(recordInput),
      },
      'Could not record the assessment.',
    )
  }

  public async correctAssessment(correctInput: CorrectTrainingAssessmentInput): Promise<void> {
    await callEvidenceRpc(
      'correct_training_assessment',
      {
        p_assessment_id: correctInput.assessmentId,
        p_items_met: [...correctInput.itemsMet],
        p_result: correctInput.result,
        ...toAssessmentTextParams(correctInput),
        p_correction_reason: correctInput.correctionReason,
      },
      'Could not record the assessment correction.',
    )
  }
}
