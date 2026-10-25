import {
  trainingProgramLimits,
  type SaveTrainingProgramInput,
  type TrainingProgram,
  type TrainingProgramStatus,
} from '../../domain/models/TrainingProgram'
import type { AddTrainingSessionInput, TrainingSession } from '../../domain/models/TrainingSession'
import type { DesignatedTrainingProgram, TrainingTrainer } from '../../domain/models/TrainingTrainer'
import type { TrainingProgramRepository } from '../../domain/repositories/TrainingProgramRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import { readSessionUserIdentifier } from '../supabase/supabaseSessionUser'
import {
  hasReturnedRow,
  mapTrainingProgramRow,
  mapTrainingSessionRow,
  toTrainingProgramDraftArguments,
  trainingNoRowMessage,
  trainingProgramSelectColumns,
  trainingSessionSelectColumns,
  type SupabaseTrainerDesignationRow,
  type SupabaseTrainerRow,
  type SupabaseTrainingProgramRow,
  type SupabaseTrainingSessionRow,
} from '../supabase/supabaseTrainingRows'

async function callProgramRpc(
  rpcName: string,
  rpcArguments: Record<string, unknown>,
  fallbackMessage: string,
): Promise<TrainingProgram> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasReturnedRow(rpcResponse.data)) {
    throw new Error(trainingNoRowMessage)
  }
  return mapTrainingProgramRow(rpcResponse.data as SupabaseTrainingProgramRow)
}

async function callSessionRpc(
  rpcName: string,
  rpcArguments: Record<string, unknown>,
  fallbackMessage: string,
): Promise<TrainingSession> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasReturnedRow(rpcResponse.data)) {
    throw new Error(trainingNoRowMessage)
  }
  return mapTrainingSessionRow(rpcResponse.data as SupabaseTrainingSessionRow)
}

async function callRowRpc(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<void> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments).single()
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  if (!hasReturnedRow(rpcResponse.data)) {
    throw new Error(trainingNoRowMessage)
  }
}

async function callVoidRpc(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<void> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName, rpcArguments)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
}

/**
 * Owner and trainer side of training programs. Reads use explicit columns under RLS;
 * every write is an RPC whose arguments are ids, owner content and expected versions.
 */
export class SupabaseTrainingProgramRepository implements TrainingProgramRepository {
  public async listOwnPrograms(): Promise<TrainingProgram[]> {
    const ownerIdentifier = await readSessionUserIdentifier('Sign in again to manage your training programs.')
    const queryResponse = await getSupabaseClient()
      .from('training_programs')
      .select(trainingProgramSelectColumns)
      .eq('owner_id', ownerIdentifier)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(trainingProgramLimits.ownListMaximum)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load your training programs.')
    }
    return (queryResponse.data as unknown as SupabaseTrainingProgramRow[]).map(mapTrainingProgramRow)
  }

  public async listDesignatedPrograms(): Promise<DesignatedTrainingProgram[]> {
    const trainerIdentifier = await readSessionUserIdentifier('Sign in again to see the training you run.')
    const designationResponse = await getSupabaseClient()
      .from('training_program_trainers')
      .select('id, program_id')
      .eq('trainer_id', trainerIdentifier)
      .is('revoked_at', null)
    if (designationResponse.error) {
      throw toUserFacingError(designationResponse.error, 'Could not load the training you run.')
    }
    const designationRows = designationResponse.data as unknown as Pick<SupabaseTrainerDesignationRow, 'id' | 'program_id'>[]
    const programs = await this.listProgramsByIds(designationRows.map((designationRow) => designationRow.program_id))
    const programById = new Map(programs.map((program) => [program.id, program]))
    return designationRows.flatMap((designationRow) => {
      const program = programById.get(designationRow.program_id)
      return program === undefined ? [] : [{ designationId: designationRow.id, program }]
    })
  }

  public async listProgramsByIds(programIds: readonly string[]): Promise<TrainingProgram[]> {
    if (programIds.length === 0) {
      return []
    }
    const queryResponse = await getSupabaseClient()
      .from('training_programs')
      .select(trainingProgramSelectColumns)
      .in('id', [...programIds])
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the training programs.')
    }
    return (queryResponse.data as unknown as SupabaseTrainingProgramRow[]).map(mapTrainingProgramRow)
  }

  public async createProgram(shopId: string, title: string): Promise<TrainingProgram> {
    return callProgramRpc(
      'create_training_program',
      { p_shop_id: shopId, p_title: title },
      'Could not create the training program.',
    )
  }

  public async updateDraft(
    programId: string,
    saveTrainingProgramInput: SaveTrainingProgramInput,
    expectedUpdatedAt: string,
  ): Promise<TrainingProgram> {
    return callProgramRpc(
      'update_training_program_draft',
      toTrainingProgramDraftArguments(programId, saveTrainingProgramInput, expectedUpdatedAt),
      'Could not save the training program.',
    )
  }

  public async deleteDraft(programId: string): Promise<void> {
    await callVoidRpc('delete_training_program_draft', { p_program_id: programId }, 'Could not delete the draft.')
  }

  public async transition(
    programId: string,
    fromStatus: TrainingProgramStatus,
    toStatus: TrainingProgramStatus,
    ownerAttestationVersion: string | null,
  ): Promise<TrainingProgram> {
    return callProgramRpc(
      'transition_training_program',
      {
        p_program_id: programId,
        p_from_status: fromStatus,
        p_to_status: toStatus,
        p_owner_attestation_version: ownerAttestationVersion,
      },
      'Could not change the training program status.',
    )
  }

  public async isShopVerified(shopId: string): Promise<boolean> {
    const rpcResponse = await getSupabaseClient().rpc('is_verified_shop_owner', { p_shop_id: shopId })
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not check the shop verification.')
    }
    return rpcResponse.data === true
  }

  public async listSessions(programIds: readonly string[]): Promise<TrainingSession[]> {
    if (programIds.length === 0) {
      return []
    }
    const queryResponse = await getSupabaseClient()
      .from('training_sessions')
      .select(trainingSessionSelectColumns)
      .in('program_id', [...programIds])
      .order('session_date', { ascending: true })
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the training sessions.')
    }
    return (queryResponse.data as unknown as SupabaseTrainingSessionRow[]).map(mapTrainingSessionRow)
  }

  public async addSession(programId: string, addInput: AddTrainingSessionInput): Promise<TrainingSession> {
    return callSessionRpc(
      'add_training_session',
      {
        p_program_id: programId,
        p_session_date: addInput.sessionDate,
        p_session_kind: addInput.sessionKind,
        p_start_time: addInput.startTime,
        p_end_time: addInput.endTime,
        p_location: addInput.location,
      },
      'Could not add the session.',
    )
  }

  public async cancelSession(sessionId: string, reason: string): Promise<TrainingSession> {
    return callSessionRpc(
      'cancel_training_session',
      { p_session_id: sessionId, p_reason: reason },
      'Could not cancel the session.',
    )
  }

  public async deleteSessionDraft(sessionId: string): Promise<void> {
    await callVoidRpc('delete_training_session_draft', { p_session_id: sessionId }, 'Could not delete the session.')
  }

  public async listTrainers(programId: string): Promise<TrainingTrainer[]> {
    const client = getSupabaseClient()
    const [trainerResponse, designationResponse] = await Promise.all([
      client.rpc('trainers_for_training_program', { p_program_id: programId }),
      client.from('training_program_trainers').select('id, roster_worker_id').eq('program_id', programId),
    ])
    if (trainerResponse.error) {
      throw toUserFacingError(trainerResponse.error, 'Could not load the trainers.')
    }
    if (designationResponse.error) {
      throw toUserFacingError(designationResponse.error, 'Could not load the trainers.')
    }
    const rosterWorkerByDesignation = new Map(
      (designationResponse.data as unknown as Pick<SupabaseTrainerDesignationRow, 'id' | 'roster_worker_id'>[]).map(
        (designationRow) => [designationRow.id, designationRow.roster_worker_id],
      ),
    )
    return (trainerResponse.data as unknown as SupabaseTrainerRow[]).map((trainerRow) => ({
      designationId: trainerRow.designation_id,
      displayName: trainerRow.display_name,
      rosterWorkerId: rosterWorkerByDesignation.get(trainerRow.designation_id) ?? null,
      designatedAt: trainerRow.designated_at,
      revokedAt: trainerRow.revoked_at,
    }))
  }

  public async designateTrainer(programId: string, rosterWorkerId: string): Promise<void> {
    await callRowRpc(
      'designate_training_trainer',
      { p_program_id: programId, p_roster_worker_id: rosterWorkerId },
      'Could not add the trainer.',
    )
  }

  public async revokeTrainer(designationId: string): Promise<void> {
    await callRowRpc('revoke_training_trainer', { p_designation_id: designationId }, 'Could not remove the trainer.')
  }
}
