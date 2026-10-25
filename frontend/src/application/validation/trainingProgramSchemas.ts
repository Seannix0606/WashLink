import { z } from 'zod'
import {
  trainingPayCurrencies,
  trainingPayPeriods,
  trainingProgramLimits as limits,
  type SaveTrainingProgramInput,
} from '../../domain/models/TrainingProgram'
import {
  trainingSessionKinds,
  trainingSessionLimits,
  type AddTrainingSessionInput,
} from '../../domain/models/TrainingSession'
import { optionalText, textList } from './formFieldSchemas'

// Mirrors the training_programs / training_sessions CHECKs and RPC rules (W6b, W6c, W6e).

export const trainingPayAmountFormatMessage = 'Enter an amount like 500 or 500.50.'
export const trainingPayAllOrNothingMessage =
  'Training pay needs an amount, a currency and a period, or none of them.'

function hasAtMostTwoDecimals(amount: number): boolean {
  return Number(amount.toFixed(limits.payDecimalPlaces)) === amount
}

/** A reason of 10 to 300 characters, as the database requires for cancellations and corrections. */
export function requiredReason(fieldMessage: string): z.ZodType<string> {
  return z
    .string()
    .trim()
    .min(trainingSessionLimits.reasonMinLength, fieldMessage)
    .max(trainingSessionLimits.reasonMaxLength, fieldMessage)
}

export const cancelReasonSchema = requiredReason('Give a reason of 10 to 300 characters.')

export const saveTrainingProgramInputSchema: z.ZodType<SaveTrainingProgramInput> = z
  .object({
    title: z
      .string()
      .trim()
      .min(limits.titleMinLength, `Title must be at least ${String(limits.titleMinLength)} characters.`)
      .max(limits.titleMaxLength, `Title must be ${String(limits.titleMaxLength)} characters or fewer.`),
    objectives: optionalText(limits.objectivesMaxLength, 'Objectives'),
    skillsToLearn: textList({
      maximumCount: limits.skillsMaxCount,
      maximumItemLength: limits.skillMaxLength,
      listLabel: 'skills',
      itemLabel: 'Skill',
    }),
    terms: optionalText(limits.termsMaxLength, 'Terms'),
    minTrainingDays: z
      .number({ error: 'Enter the number of training days (3 to 30).' })
      .int('Enter a whole number of days.')
      .min(limits.minTrainingDaysMinimum, 'Required initial training needs at least 3 distinct days.')
      .max(limits.minTrainingDaysMaximum, 'Use at most 30 training days.'),
    assessmentChecklist: z
      .array(
        z
          .string()
          .trim()
          .min(limits.checklistItemMinLength, 'Each checklist item must be 3 to 200 characters.')
          .max(limits.checklistItemMaxLength, 'Each checklist item must be 3 to 200 characters.'),
      )
      .max(limits.checklistMaxCount, `Add at most ${String(limits.checklistMaxCount)} checklist items.`),
    trainingPayAmount: z
      .number({ error: trainingPayAmountFormatMessage })
      .gt(0, 'Training pay must be more than 0.')
      .lt(limits.payAmountExclusiveMaximum, 'Training pay is too large.')
      .refine(hasAtMostTwoDecimals, 'Use at most 2 decimal places.')
      .nullable(),
    trainingPayCurrency: z.enum(trainingPayCurrencies, { error: 'Choose a currency.' }).nullable(),
    trainingPayPeriod: z.enum(trainingPayPeriods, { error: 'Choose a pay period.' }).nullable(),
    trainingPayDetails: optionalText(limits.payDetailsMaxLength, 'Training pay details'),
    reimbursementDetails: optionalText(limits.reimbursementDetailsMaxLength, 'Reimbursement details'),
  })
  .superRefine((programInput, refinementContext) => {
    const payParts = [programInput.trainingPayAmount, programInput.trainingPayCurrency, programInput.trainingPayPeriod]
    const setPartCount = payParts.filter((payPart) => payPart !== null).length
    if (setPartCount !== 0 && setPartCount !== payParts.length) {
      refinementContext.addIssue({
        code: 'custom',
        path: ['trainingPayAmount'],
        message: trainingPayAllOrNothingMessage,
      })
    }
  })

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/
const timeOfDayPattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

function optionalTimeOfDay(fieldLabel: string): z.ZodType<string | null> {
  return z
    .string()
    .trim()
    .nullable()
    .transform((timeText) => (timeText === null || timeText.length === 0 ? null : timeText))
    .refine((timeText) => timeText === null || timeOfDayPattern.test(timeText), `${fieldLabel} must be a time like 09:00.`)
}

export const addTrainingSessionInputSchema: z.ZodType<AddTrainingSessionInput> = z
  .object({
    sessionDate: z.string().trim().regex(calendarDatePattern, 'Choose the session date.'),
    sessionKind: z.enum(trainingSessionKinds, { error: 'Choose what the session is for.' }),
    startTime: optionalTimeOfDay('Start time'),
    endTime: optionalTimeOfDay('End time'),
    location: optionalText(trainingSessionLimits.locationMaxLength, 'Location'),
  })
  .superRefine((sessionInput, refinementContext) => {
    if (sessionInput.startTime !== null && sessionInput.endTime !== null && sessionInput.endTime <= sessionInput.startTime) {
      refinementContext.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after the start time.' })
    }
  })

function addCalendarDays(calendarDate: string, dayCount: number): string {
  const shiftedDate = new Date(`${calendarDate}T00:00:00Z`)
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + dayCount)
  return shiftedDate.toISOString().slice(0, 10)
}

/** Same window as add_training_session: Manila today up to one year ahead. */
export function isSessionDateInAllowedWindow(sessionDate: string, manilaToday: string): boolean {
  return sessionDate >= manilaToday && sessionDate <= addCalendarDays(manilaToday, trainingSessionLimits.daysAheadMaximum)
}

export const sessionDateWindowMessage = 'Choose a session date from today up to one year ahead.'
