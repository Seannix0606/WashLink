export type TrainingProgramStatus = 'draft' | 'open' | 'closed' | 'archived'

export const trainingProgramStatuses: readonly TrainingProgramStatus[] = [
  'draft',
  'open',
  'closed',
  'archived',
]

/** Only required initial training exists in W6 (D-19); it is always free for the worker. */
export type TrainingKind = 'required_initial'

export type TrainingPayCurrency = 'PHP'

export const trainingPayCurrencies: readonly TrainingPayCurrency[] = ['PHP']

export type TrainingPayPeriod = 'day' | 'session' | 'program'

export const trainingPayPeriods: readonly TrainingPayPeriod[] = ['day', 'session', 'program']

/** The owner's free-training statement version, sent only when opening a program. */
export const trainingOwnerAttestationVersion = 'w6_owner_v1'

/** Mirrors the CHECK constraints and limits of public.training_programs (W6b, W6e). */
export const trainingProgramLimits = {
  titleMinLength: 3,
  titleMaxLength: 120,
  objectivesMaxLength: 2000,
  termsMaxLength: 4000,
  skillsMaxCount: 20,
  skillMaxLength: 80,
  checklistMaxCount: 30,
  checklistItemMinLength: 3,
  checklistItemMaxLength: 200,
  minTrainingDaysMinimum: 3,
  minTrainingDaysMaximum: 30,
  /** Pay amounts must be greater than 0 and less than this value (numeric(10,2)). */
  payAmountExclusiveMaximum: 100_000_000,
  payDecimalPlaces: 2,
  payDetailsMaxLength: 500,
  reimbursementDetailsMaxLength: 500,
  programsPerShopMaximum: 50,
  ownListMaximum: 200,
} as const

/** Database message (55000) when the draft changed since the owner loaded it. */
export const staleTrainingProgramMessage = 'This training program changed. Refresh and try again.'

/**
 * Everything the owner writes. Optional pay and reimbursement are stored exactly as
 * entered; null means "not specified by the shop". There is no fee: training is free.
 */
export interface TrainingProgramContent {
  readonly title: string
  readonly objectives: string | null
  readonly skillsToLearn: readonly string[]
  readonly terms: string | null
  readonly minTrainingDays: number
  readonly assessmentChecklist: readonly string[]
  readonly trainingPayAmount: number | null
  readonly trainingPayCurrency: TrainingPayCurrency | null
  readonly trainingPayPeriod: TrainingPayPeriod | null
  readonly trainingPayDetails: string | null
  readonly reimbursementDetails: string | null
}

export interface TrainingProgram extends TrainingProgramContent {
  readonly id: string
  /** Null after the shop was removed from WashLink (D-18). */
  readonly shopId: string | null
  readonly trainingKind: TrainingKind
  /** Read only and always 0 (tp_worker_fee_is_zero). Never sent by the app. */
  readonly workerFee: number
  readonly status: TrainingProgramStatus
  readonly ownerAttestationVersion: string | null
  readonly ownerAttestedAt: string | null
  /** Sent back when a worker accepts, so a changed schedule is reviewed again. */
  readonly scheduleChangedAt: string | null
  readonly statusChangedAt: string | null
  readonly openedAt: string | null
  readonly createdAt: string
  /** Sent back unchanged as p_expected_updated_at when a draft is saved. */
  readonly updatedAt: string
}

/** Owner input for create and edit. Status, fee and stamps are never part of it. */
export type SaveTrainingProgramInput = TrainingProgramContent
