import type { TrainingProgram } from './TrainingProgram'

/**
 * A designated trainer of one program (D-16): a worker account linked to the owner's
 * roster. Revocation is one-way; unlinking the roster row also ends the authority.
 */
export interface TrainingTrainer {
  readonly designationId: string
  readonly displayName: string
  /** The roster row; null after the roster row was removed. Owner view only. */
  readonly rosterWorkerId: string | null
  readonly designatedAt: string
  readonly revokedAt: string | null
}

/** A program the signed-in worker is a current trainer for. */
export interface DesignatedTrainingProgram {
  readonly designationId: string
  readonly program: TrainingProgram
}
