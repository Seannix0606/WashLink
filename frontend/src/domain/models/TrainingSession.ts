/**
 * What a training day is for. Both are supervised learning; there is no "work" kind,
 * because trainees are not used for customer bookings during training.
 */
export type TrainingSessionKind = 'supervised_training' | 'competency_assessment'

export const trainingSessionKinds: readonly TrainingSessionKind[] = [
  'supervised_training',
  'competency_assessment',
]

export type TrainingSessionStatus = 'scheduled' | 'cancelled'

/** Mirrors public.training_sessions (W6c, W6e). */
export const trainingSessionLimits = {
  locationMaxLength: 200,
  reasonMinLength: 10,
  reasonMaxLength: 300,
  scheduledPerProgramMaximum: 30,
  /** Sessions can be added from Manila today up to this many days ahead. */
  daysAheadMaximum: 365,
} as const

export interface TrainingSession {
  readonly id: string
  readonly programId: string
  /** Asia/Manila calendar date, YYYY-MM-DD. */
  readonly sessionDate: string
  /** HH:MM[:SS] or null when the shop did not set a time. */
  readonly startTime: string | null
  readonly endTime: string | null
  readonly location: string | null
  readonly sessionKind: TrainingSessionKind
  readonly status: TrainingSessionStatus
  readonly cancelReason: string | null
  readonly cancelledAt: string | null
  readonly createdAt: string
}

export interface AddTrainingSessionInput {
  readonly sessionDate: string
  readonly sessionKind: TrainingSessionKind
  readonly startTime: string | null
  readonly endTime: string | null
  readonly location: string | null
}
