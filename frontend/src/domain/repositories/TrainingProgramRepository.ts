import type {
  SaveTrainingProgramInput,
  TrainingProgram,
  TrainingProgramStatus,
} from '../models/TrainingProgram'
import type { AddTrainingSessionInput, TrainingSession } from '../models/TrainingSession'
import type { DesignatedTrainingProgram, TrainingTrainer } from '../models/TrainingTrainer'

/**
 * Training programs, their sessions and trainers. Reads go through RLS; every write is
 * an RPC. No payload ever carries a status column, the owner, the fee or a stamp.
 */
export interface TrainingProgramRepository {
  /** The signed-in owner's non-archived programs, most recently changed first. */
  listOwnPrograms(): Promise<TrainingProgram[]>
  /** Programs the signed-in worker is a current (unrevoked) trainer for. */
  listDesignatedPrograms(): Promise<DesignatedTrainingProgram[]>
  /** Readable programs by id (a worker sees programs they hold an enrollment in). */
  listProgramsByIds(programIds: readonly string[]): Promise<TrainingProgram[]>
  createProgram(shopId: string, title: string): Promise<TrainingProgram>
  /** Fails (55000) when the draft changed since `expectedUpdatedAt`. */
  updateDraft(
    programId: string,
    saveTrainingProgramInput: SaveTrainingProgramInput,
    expectedUpdatedAt: string,
  ): Promise<TrainingProgram>
  deleteDraft(programId: string): Promise<void>
  /** The attestation version is sent only for draft -> open. */
  transition(
    programId: string,
    fromStatus: TrainingProgramStatus,
    toStatus: TrainingProgramStatus,
    ownerAttestationVersion: string | null,
  ): Promise<TrainingProgram>
  isShopVerified(shopId: string): Promise<boolean>
  listSessions(programIds: readonly string[]): Promise<TrainingSession[]>
  addSession(programId: string, addTrainingSessionInput: AddTrainingSessionInput): Promise<TrainingSession>
  cancelSession(sessionId: string, reason: string): Promise<TrainingSession>
  deleteSessionDraft(sessionId: string): Promise<void>
  listTrainers(programId: string): Promise<TrainingTrainer[]>
  designateTrainer(programId: string, rosterWorkerId: string): Promise<void>
  revokeTrainer(designationId: string): Promise<void>
}
