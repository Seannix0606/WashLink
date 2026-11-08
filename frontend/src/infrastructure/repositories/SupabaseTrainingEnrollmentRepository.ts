import {
  trainingEnrollmentLimits,
  type TrainingEnrollment,
  type TrainingEnrollmentProgress,
  type TrainingRosterEntry,
} from '../../domain/models/TrainingEnrollment'
import type {
  RespondToTrainingInvitationInput,
  TrainingEnrollmentRepository,
} from '../../domain/repositories/TrainingEnrollmentRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import { readSessionUserIdentifier } from '../supabase/supabaseSessionUser'
import {
  mapTrainingEnrollmentRow,
  mapTrainingProgressRow,
  mapTrainingRosterRow,
  trainingEnrollmentSelectColumns,
  trainingProgressSelectColumns,
  type SupabaseTrainingEnrollmentRow,
  type SupabaseTrainingProgressRow,
  type SupabaseTrainingRosterRow,
} from '../supabase/supabaseTrainingEnrollmentRows'
import { hasReturnedRow, trainingNoRowMessage } from '../supabase/supabaseTrainingRows'

async function callEnrollmentRpc(
  rpcName: string,
  rpcArguments: Record<string, unknown>,
  fallbackMessage: string,
): Promise<TrainingEnrollment> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasReturnedRow(rpcResponse.data)) {
    throw new Error(trainingNoRowMessage)
  }
  return mapTrainingEnrollmentRow(rpcResponse.data as SupabaseTrainingEnrollmentRow)
}

/**
 * Training enrollments. The status only ever moves through the four RPCs; no payload
 * names a status column, the worker, the owner, the fee or the terms snapshot.
 */
export class SupabaseTrainingEnrollmentRepository implements TrainingEnrollmentRepository {
  public async listMyEnrollments(): Promise<TrainingEnrollment[]> {
    const workerIdentifier = await readSessionUserIdentifier('Sign in again to see your training.')
    const queryResponse = await getSupabaseClient()
      .from('training_enrollments')
      .select(trainingEnrollmentSelectColumns)
      .eq('worker_id', workerIdentifier)
      .order('invited_at', { ascending: false })
      .limit(trainingEnrollmentLimits.ownListMaximum)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load your training.')
    }
    return (queryResponse.data as unknown as SupabaseTrainingEnrollmentRow[]).map(mapTrainingEnrollmentRow)
  }

  public async listProgress(enrollmentIds: readonly string[]): Promise<TrainingEnrollmentProgress[]> {
    if (enrollmentIds.length === 0) {
      return []
    }
    const queryResponse = await getSupabaseClient()
      .from('training_enrollment_progress')
      .select(trainingProgressSelectColumns)
      .in('enrollment_id', [...enrollmentIds])
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the training progress.')
    }
    return (queryResponse.data as unknown as SupabaseTrainingProgressRow[]).map(mapTrainingProgressRow)
  }

  public async listRoster(programId: string): Promise<TrainingRosterEntry[]> {
    const rpcResponse = await getSupabaseClient().rpc('training_roster_for_program', { p_program_id: programId })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not load the trainees.')
    }
    return (rpcResponse.data as unknown as SupabaseTrainingRosterRow[]).map(mapTrainingRosterRow)
  }

  public async invite(programId: string, jobApplicationId: string): Promise<TrainingEnrollment> {
    return callEnrollmentRpc(
      'invite_to_training',
      { p_program_id: programId, p_job_application_id: jobApplicationId },
      'Could not send the training invitation.',
    )
  }

  public async respond(respondInput: RespondToTrainingInvitationInput): Promise<TrainingEnrollment> {
    return callEnrollmentRpc(
      'respond_to_training_invitation',
      {
        p_enrollment_id: respondInput.enrollmentId,
        p_accept: respondInput.accept,
        p_notice_version: respondInput.noticeVersion,
        p_expected_schedule_changed_at: respondInput.expectedScheduleChangedAt,
      },
      'Could not answer the training invitation.',
    )
  }

  public async withdraw(enrollmentId: string): Promise<TrainingEnrollment> {
    return callEnrollmentRpc(
      'withdraw_from_training',
      { p_enrollment_id: enrollmentId },
      'Could not leave the training.',
    )
  }

  public async cancel(enrollmentId: string, reason: string | null): Promise<TrainingEnrollment> {
    return callEnrollmentRpc(
      'cancel_training_enrollment',
      { p_enrollment_id: enrollmentId, p_reason: reason },
      'Could not cancel the enrollment.',
    )
  }
}
