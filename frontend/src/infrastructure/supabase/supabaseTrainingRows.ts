import type {
  SaveTrainingProgramInput,
  TrainingKind,
  TrainingPayCurrency,
  TrainingPayPeriod,
  TrainingProgram,
  TrainingProgramStatus,
} from '../../domain/models/TrainingProgram'
import type {
  TrainingSession,
  TrainingSessionKind,
  TrainingSessionStatus,
} from '../../domain/models/TrainingSession'

/**
 * Explicit columns only: never `*`, never owner_id. `worker_fee` is read so the app can
 * show "no fee", and it is never part of any write payload.
 */
export const trainingProgramSelectColumns = [
  'id',
  'shop_id',
  'title',
  'objectives',
  'skills_to_learn',
  'terms',
  'training_kind',
  'min_training_days',
  'assessment_checklist',
  'worker_fee',
  'training_pay_amount',
  'training_pay_currency',
  'training_pay_period',
  'training_pay_details',
  'reimbursement_details',
  'status',
  'owner_attestation_version',
  'owner_attested_at',
  'schedule_changed_at',
  'status_changed_at',
  'opened_at',
  'created_at',
  'updated_at',
].join(', ')

export interface SupabaseTrainingProgramRow {
  id: string
  shop_id: string | null
  title: string
  objectives: string | null
  skills_to_learn: string[] | null
  terms: string | null
  training_kind: TrainingKind
  min_training_days: number
  assessment_checklist: string[] | null
  worker_fee: number | string
  training_pay_amount: number | string | null
  training_pay_currency: TrainingPayCurrency | null
  training_pay_period: TrainingPayPeriod | null
  training_pay_details: string | null
  reimbursement_details: string | null
  status: TrainingProgramStatus
  owner_attestation_version: string | null
  owner_attested_at: string | null
  schedule_changed_at: string | null
  status_changed_at: string | null
  opened_at: string | null
  created_at: string
  updated_at: string
}

/** numeric(10,2) arrives as a number or a string; the stored value is kept, never rounded. */
export function toStoredAmount(storedAmount: number | string | null | undefined): number | null {
  return storedAmount === null || storedAmount === undefined ? null : Number(storedAmount)
}

export function mapTrainingProgramRow(programRow: SupabaseTrainingProgramRow): TrainingProgram {
  return {
    id: programRow.id,
    shopId: programRow.shop_id,
    title: programRow.title,
    objectives: programRow.objectives,
    skillsToLearn: programRow.skills_to_learn ?? [],
    terms: programRow.terms,
    trainingKind: programRow.training_kind,
    minTrainingDays: programRow.min_training_days,
    assessmentChecklist: programRow.assessment_checklist ?? [],
    workerFee: toStoredAmount(programRow.worker_fee) ?? 0,
    trainingPayAmount: toStoredAmount(programRow.training_pay_amount),
    trainingPayCurrency: programRow.training_pay_currency,
    trainingPayPeriod: programRow.training_pay_period,
    trainingPayDetails: programRow.training_pay_details,
    reimbursementDetails: programRow.reimbursement_details,
    status: programRow.status,
    ownerAttestationVersion: programRow.owner_attestation_version,
    ownerAttestedAt: programRow.owner_attested_at,
    scheduleChangedAt: programRow.schedule_changed_at,
    statusChangedAt: programRow.status_changed_at,
    openedAt: programRow.opened_at,
    createdAt: programRow.created_at,
    updatedAt: programRow.updated_at,
  }
}

/**
 * The p_* arguments of update_training_program_draft. There is deliberately no fee
 * argument (the database has none either, P28).
 */
export function toTrainingProgramDraftArguments(
  programId: string,
  saveTrainingProgramInput: SaveTrainingProgramInput,
  expectedUpdatedAt: string,
): Record<string, unknown> {
  return {
    p_program_id: programId,
    p_title: saveTrainingProgramInput.title,
    p_objectives: saveTrainingProgramInput.objectives,
    p_skills_to_learn: [...saveTrainingProgramInput.skillsToLearn],
    p_terms: saveTrainingProgramInput.terms,
    p_min_training_days: saveTrainingProgramInput.minTrainingDays,
    p_assessment_checklist: [...saveTrainingProgramInput.assessmentChecklist],
    p_training_pay_amount: saveTrainingProgramInput.trainingPayAmount,
    p_training_pay_currency: saveTrainingProgramInput.trainingPayCurrency,
    p_training_pay_period: saveTrainingProgramInput.trainingPayPeriod,
    p_training_pay_details: saveTrainingProgramInput.trainingPayDetails,
    p_reimbursement_details: saveTrainingProgramInput.reimbursementDetails,
    p_expected_updated_at: expectedUpdatedAt,
  }
}

export const trainingSessionSelectColumns = [
  'id',
  'program_id',
  'session_date',
  'start_time',
  'end_time',
  'location',
  'session_kind',
  'status',
  'cancel_reason',
  'cancelled_at',
  'created_at',
].join(', ')

export interface SupabaseTrainingSessionRow {
  id: string
  program_id: string
  session_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  session_kind: TrainingSessionKind
  status: TrainingSessionStatus
  cancel_reason: string | null
  cancelled_at: string | null
  created_at: string
}

export function mapTrainingSessionRow(sessionRow: SupabaseTrainingSessionRow): TrainingSession {
  return {
    id: sessionRow.id,
    programId: sessionRow.program_id,
    sessionDate: sessionRow.session_date,
    startTime: sessionRow.start_time,
    endTime: sessionRow.end_time,
    location: sessionRow.location,
    sessionKind: sessionRow.session_kind,
    status: sessionRow.status,
    cancelReason: sessionRow.cancel_reason,
    cancelledAt: sessionRow.cancelled_at,
    createdAt: sessionRow.created_at,
  }
}

/** Row of trainers_for_training_program. */
export interface SupabaseTrainerRow {
  designation_id: string
  display_name: string
  designated_at: string
  revoked_at: string | null
}

/** Owner-readable columns of training_program_trainers (roster link only, no profile ids). */
export interface SupabaseTrainerDesignationRow {
  id: string
  program_id: string
  roster_worker_id: string | null
  revoked_at: string | null
}

/**
 * An RPC that answers without a row (or with an all-null composite) is treated as a
 * failure, never as success.
 */
export function hasReturnedRow(rpcData: unknown): boolean {
  if (rpcData === null || typeof rpcData !== 'object') {
    return false
  }
  return (rpcData as { id?: unknown }).id !== null && (rpcData as { id?: unknown }).id !== undefined
}

export const trainingNoRowMessage = 'This training record changed or is no longer available. Refresh and try again.'
