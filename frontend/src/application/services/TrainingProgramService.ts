import type { z } from 'zod'
import type { JobApplication } from '../../domain/models/JobApplication'
import {
  trainingOwnerAttestationVersion,
  type SaveTrainingProgramInput,
  type TrainingProgram,
  type TrainingProgramStatus,
} from '../../domain/models/TrainingProgram'
import type { AddTrainingSessionInput, TrainingSession } from '../../domain/models/TrainingSession'
import type { DesignatedTrainingProgram, TrainingTrainer } from '../../domain/models/TrainingTrainer'
import type { Worker } from '../../domain/models/Worker'
import type { TrainingProgramRepository } from '../../domain/repositories/TrainingProgramRepository'
import { toManilaCalendarDate } from '../../domain/utilities/jobOpeningLifecycle'
import {
  canChangeTrainingSessions,
  canChangeTrainingTrainers,
  canDeleteTrainingSession,
  canInviteToTrainingProgram,
  isTrainingProgramDeletable,
  isTrainingProgramEditable,
  isTrainingProgramTransitionAllowed,
} from '../../domain/utilities/trainingProgramLifecycle'
import {
  addTrainingSessionInputSchema,
  cancelReasonSchema,
  isSessionDateInAllowedWindow,
  saveTrainingProgramInputSchema,
  sessionDateWindowMessage,
} from '../validation/trainingProgramSchemas'

export class TrainingValidationError extends Error {
  public constructor(validationError: z.ZodError) {
    super(validationError.issues.at(0)?.message ?? 'Check the training details.')
    this.name = 'TrainingValidationError'
  }
}

export function parseOrThrow<Output>(schema: z.ZodType<Output>, candidate: unknown): Output {
  const parseResult = schema.safeParse(candidate)
  if (!parseResult.success) {
    throw new TrainingValidationError(parseResult.error)
  }
  return parseResult.data
}

export type ShopTrainingEligibility = Readonly<Partial<Record<string, boolean>>>

/**
 * Owner training-program rules on the client. Every check is repeated by the database
 * (guards, RLS, RPCs), which stays the authority.
 */
export class TrainingProgramService {
  public constructor(private readonly trainingProgramRepository: TrainingProgramRepository) {}

  public async listOwnPrograms(): Promise<TrainingProgram[]> {
    return this.trainingProgramRepository.listOwnPrograms()
  }

  public async listDesignatedPrograms(): Promise<DesignatedTrainingProgram[]> {
    return this.trainingProgramRepository.listDesignatedPrograms()
  }

  /** Open programs of the application's shop, the only ones an invitation can use (D-15). */
  public async listInvitablePrograms(jobApplication: JobApplication): Promise<TrainingProgram[]> {
    const ownPrograms = await this.trainingProgramRepository.listOwnPrograms()
    return ownPrograms.filter(
      (program) => program.shopId === jobApplication.shopId && canInviteToTrainingProgram(program.status),
    )
  }

  public async loadShopEligibility(shopIds: readonly string[]): Promise<ShopTrainingEligibility> {
    const eligibilityEntries = await Promise.all(
      shopIds.map(
        async (shopId): Promise<[string, boolean]> => [
          shopId,
          await this.trainingProgramRepository.isShopVerified(shopId),
        ],
      ),
    )
    return Object.fromEntries(eligibilityEntries)
  }

  /** Creates the draft (title only), then saves the full content against its first version. */
  public async createProgram(shopId: string, saveInput: SaveTrainingProgramInput): Promise<TrainingProgram> {
    const validInput = parseOrThrow(saveTrainingProgramInputSchema, saveInput)
    const createdProgram = await this.trainingProgramRepository.createProgram(shopId, validInput.title)
    return this.trainingProgramRepository.updateDraft(createdProgram.id, validInput, createdProgram.updatedAt)
  }

  public async updateDraft(program: TrainingProgram, saveInput: SaveTrainingProgramInput): Promise<TrainingProgram> {
    if (!isTrainingProgramEditable(program.status)) {
      throw new Error('An open training program cannot be edited.')
    }
    const validInput = parseOrThrow(saveTrainingProgramInputSchema, saveInput)
    return this.trainingProgramRepository.updateDraft(program.id, validInput, program.updatedAt)
  }

  public async deleteDraft(program: TrainingProgram): Promise<void> {
    if (!isTrainingProgramDeletable(program.status)) {
      throw new Error('Only draft training programs can be deleted.')
    }
    await this.trainingProgramRepository.deleteDraft(program.id)
  }

  /** Opening needs the owner's own free-training confirmation (w6_owner_v1). */
  public async transition(
    program: TrainingProgram,
    toStatus: TrainingProgramStatus,
    hasConfirmedFreeTraining: boolean,
  ): Promise<TrainingProgram> {
    if (!isTrainingProgramTransitionAllowed(program.status, toStatus)) {
      throw new Error('This training program status change is not allowed.')
    }
    const isOpening = toStatus === 'open'
    if (isOpening && !hasConfirmedFreeTraining) {
      throw new Error('Confirm the free-training statement before opening.')
    }
    return this.trainingProgramRepository.transition(
      program.id,
      program.status,
      toStatus,
      isOpening ? trainingOwnerAttestationVersion : null,
    )
  }

  public async listSessions(programIds: readonly string[]): Promise<TrainingSession[]> {
    return this.trainingProgramRepository.listSessions(programIds)
  }

  public async addSession(
    program: TrainingProgram,
    addInput: AddTrainingSessionInput,
    currentInstant: Date,
  ): Promise<TrainingSession> {
    if (!canChangeTrainingSessions(program.status)) {
      throw new Error('Sessions can be added only while the program is a draft or open.')
    }
    const validInput = parseOrThrow(addTrainingSessionInputSchema, addInput)
    if (!isSessionDateInAllowedWindow(validInput.sessionDate, toManilaCalendarDate(currentInstant))) {
      throw new Error(sessionDateWindowMessage)
    }
    return this.trainingProgramRepository.addSession(program.id, validInput)
  }

  public async cancelSession(program: TrainingProgram, session: TrainingSession, reason: string): Promise<TrainingSession> {
    if (!canChangeTrainingSessions(program.status) || session.status !== 'scheduled') {
      throw new Error('This session cannot be cancelled.')
    }
    return this.trainingProgramRepository.cancelSession(session.id, parseOrThrow(cancelReasonSchema, reason))
  }

  public async deleteSessionDraft(program: TrainingProgram, session: TrainingSession): Promise<void> {
    if (!canDeleteTrainingSession(program.status)) {
      throw new Error('Sessions can be deleted only while the program is a draft. Cancel it instead.')
    }
    await this.trainingProgramRepository.deleteSessionDraft(session.id)
  }

  public async listTrainers(programId: string): Promise<TrainingTrainer[]> {
    return this.trainingProgramRepository.listTrainers(programId)
  }

  /** D-16: only a roster row linked to a worker account can be a trainer. */
  public async designateTrainer(program: TrainingProgram, rosterWorker: Worker): Promise<void> {
    if (!canChangeTrainingTrainers(program.status)) {
      throw new Error('Trainers cannot be changed on an archived program.')
    }
    if (!rosterWorker.isLinkedToAccount) {
      throw new Error('Choose a worker linked to your roster.')
    }
    await this.trainingProgramRepository.designateTrainer(program.id, rosterWorker.workerIdentifier)
  }

  public async revokeTrainer(program: TrainingProgram, trainer: TrainingTrainer): Promise<void> {
    if (!canChangeTrainingTrainers(program.status)) {
      throw new Error('Trainers cannot be changed on an archived program.')
    }
    if (trainer.revokedAt !== null) {
      throw new Error('This trainer role was already revoked.')
    }
    await this.trainingProgramRepository.revokeTrainer(trainer.designationId)
  }
}
