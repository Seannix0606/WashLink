import type { TrainingProgram, TrainingProgramStatus } from '../models/TrainingProgram'
import type { TrainingSession } from '../models/TrainingSession'

/**
 * Mirrors transition_training_program and the session / trainer RPCs (W6e, W6f). The
 * database is the authority; this only decides which actions the owner UI offers.
 */
const allowedTransitionsByStatus: Readonly<Record<TrainingProgramStatus, readonly TrainingProgramStatus[]>> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['archived'],
  archived: [],
}

export function allowedTrainingProgramTransitions(
  currentStatus: TrainingProgramStatus,
): readonly TrainingProgramStatus[] {
  return allowedTransitionsByStatus[currentStatus]
}

export function isTrainingProgramTransitionAllowed(
  fromStatus: TrainingProgramStatus,
  toStatus: TrainingProgramStatus,
): boolean {
  return allowedTransitionsByStatus[fromStatus].includes(toStatus)
}

/** Content is frozen once the program opens ("An open training program cannot be edited."). */
export function isTrainingProgramEditable(status: TrainingProgramStatus): boolean {
  return status === 'draft'
}

export function isTrainingProgramDeletable(status: TrainingProgramStatus): boolean {
  return status === 'draft'
}

/** Sessions are added and cancelled while the program is a draft or open. */
export function canChangeTrainingSessions(status: TrainingProgramStatus): boolean {
  return status === 'draft' || status === 'open'
}

/** Draft sessions are deleted; later ones are cancelled with a reason. */
export function canDeleteTrainingSession(status: TrainingProgramStatus): boolean {
  return status === 'draft'
}

export function canInviteToTrainingProgram(status: TrainingProgramStatus): boolean {
  return status === 'open'
}

export function canChangeTrainingTrainers(status: TrainingProgramStatus): boolean {
  return status !== 'archived'
}

export type TrainingProgramOpenReadiness =
  | { readonly kind: 'ready' }
  | { readonly kind: 'shop_not_verified' }
  | { readonly kind: 'missing_content' }
  | { readonly kind: 'past_sessions' }
  | { readonly kind: 'not_enough_days'; readonly requiredDays: number; readonly scheduledDays: number }

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0
}

/** Distinct upcoming dates of scheduled supervised training sessions (same rule as opening). */
export function countUpcomingSupervisedDays(
  sessions: readonly TrainingSession[],
  manilaToday: string,
): number {
  const upcomingDates = new Set(
    sessions
      .filter(
        (session) =>
          session.status === 'scheduled' &&
          session.sessionKind === 'supervised_training' &&
          session.sessionDate >= manilaToday,
      )
      .map((session) => session.sessionDate),
  )
  return upcomingDates.size
}

/** Same checks, in the same order, as draft -> open in transition_training_program. */
export function evaluateTrainingProgramOpenReadiness(
  program: TrainingProgram,
  sessions: readonly TrainingSession[],
  isShopVerified: boolean,
  manilaToday: string,
): TrainingProgramOpenReadiness {
  if (!isShopVerified) {
    return { kind: 'shop_not_verified' }
  }
  if (isBlank(program.objectives) || isBlank(program.terms) || program.assessmentChecklist.length === 0) {
    return { kind: 'missing_content' }
  }
  const scheduledSessions = sessions.filter((session) => session.status === 'scheduled')
  if (scheduledSessions.some((session) => session.sessionDate < manilaToday)) {
    return { kind: 'past_sessions' }
  }
  const scheduledDays = countUpcomingSupervisedDays(scheduledSessions, manilaToday)
  if (scheduledDays < program.minTrainingDays) {
    return { kind: 'not_enough_days', requiredDays: program.minTrainingDays, scheduledDays }
  }
  return { kind: 'ready' }
}
