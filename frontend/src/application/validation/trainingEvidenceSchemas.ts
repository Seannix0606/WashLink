import { z } from 'zod'
import {
  trainingAttendanceStatuses,
  trainingEvidenceLimits as limits,
  type CorrectTrainingAssessmentInput,
  type CorrectTrainingAttendanceInput,
  type RecordTrainingAssessmentInput,
  type RecordTrainingAttendanceInput,
} from '../../domain/models/TrainingEvidence'
import { optionalText } from './formFieldSchemas'
import { requiredReason } from './trainingProgramSchemas'

// Mirrors the evidence CHECKs and RPC rules (W6d, W6g). Records are never edited or deleted.

export const correctionReasonMessage = 'Give a correction reason of 10 to 300 characters.'
export const passNeedsEveryItemMessage = 'A pass needs every checklist item met.'
export const failureReasonMessage = 'Give a reason for the fail of 10 to 300 characters.'

const correctionReasonSchema = requiredReason(correctionReasonMessage)
const progressNoteSchema = optionalText(limits.progressNoteMaxLength, 'Progress note')
const assessorCommentSchema = optionalText(limits.assessorCommentMaxLength, 'Comment')
const attendanceStatusSchema = z.enum(trainingAttendanceStatuses, { error: 'Choose Present or Absent.' })
const assessmentResultSchema = z.enum(['passed', 'failed'], { error: 'Choose Passed or Not passed.' })
const itemsMetSchema = z.array(z.boolean()).min(1, 'Mark every checklist item as met or not met.')

export const recordAttendanceInputSchema: z.ZodType<RecordTrainingAttendanceInput> = z.object({
  enrollmentId: z.string().min(1),
  sessionId: z.string().min(1),
  attendanceStatus: attendanceStatusSchema,
  progressNote: progressNoteSchema,
})

export const correctAttendanceInputSchema: z.ZodType<CorrectTrainingAttendanceInput> = z.object({
  attendanceId: z.string().min(1),
  attendanceStatus: attendanceStatusSchema,
  progressNote: progressNoteSchema,
  correctionReason: correctionReasonSchema,
})

function everyItemMetForPass(assessment: { readonly result: string; readonly itemsMet: readonly boolean[] }): boolean {
  return assessment.result === 'failed' || assessment.itemsMet.every((isItemMet) => isItemMet)
}

/** A fail needs a trimmed reason of 10..300 characters; a pass carries none. */
function failureReasonFitsResult(assessment: { readonly result: string; readonly failureReason: string | null }): boolean {
  if (assessment.result === 'passed') {
    return assessment.failureReason === null
  }
  const reasonLength = (assessment.failureReason ?? '').trim().length
  return reasonLength >= limits.failureReasonMinLength && reasonLength <= limits.failureReasonMaxLength
}

const failureReasonSchema = z
  .string()
  .nullable()
  .transform((reason) => (reason === null ? null : reason.trim()))

export const recordAssessmentInputSchema: z.ZodType<RecordTrainingAssessmentInput> = z
  .object({
    enrollmentId: z.string().min(1),
    itemsMet: itemsMetSchema,
    result: assessmentResultSchema,
    assessorComment: assessorCommentSchema,
    failureReason: failureReasonSchema,
  })
  .refine(everyItemMetForPass, { message: passNeedsEveryItemMessage, path: ['result'] })
  .refine(failureReasonFitsResult, { message: failureReasonMessage, path: ['failureReason'] })

export const correctAssessmentInputSchema: z.ZodType<CorrectTrainingAssessmentInput> = z
  .object({
    assessmentId: z.string().min(1),
    itemsMet: itemsMetSchema,
    result: assessmentResultSchema,
    assessorComment: assessorCommentSchema,
    failureReason: failureReasonSchema,
    correctionReason: correctionReasonSchema,
  })
  .refine(everyItemMetForPass, { message: passNeedsEveryItemMessage, path: ['result'] })
  .refine(failureReasonFitsResult, { message: failureReasonMessage, path: ['failureReason'] })
