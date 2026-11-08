import { z } from 'zod'
import { certificationLimits as limits } from '../../domain/models/Certification'
import { optionalText } from './formFieldSchemas'

// Mirrors the W7 CHECKs and RPC rules (w7b, w7c, w7e, w7f). The database stays the authority.

export const certificationReasonMessage = 'Give a reason of 20 to 500 characters.'
export const reviewStatementMessage = 'Write a statement of 20 to 1000 characters.'
export const reassessmentFailureReasonMessage = 'Give a reason for the fail of 10 to 300 characters.'
export const validityMonthsMessage = 'Validity must be 1 to 36 months.'
export const attestationRequiredMessage = 'Confirm the certification statement before issuing.'
export const reassessmentPassNeedsEveryItemMessage = 'A pass needs every checklist item met.'

export const certificationReasonSchema = z
  .string()
  .trim()
  .min(limits.reasonMinLength, certificationReasonMessage)
  .max(limits.reasonMaxLength, certificationReasonMessage)

export const reviewStatementSchema = z
  .string()
  .trim()
  .min(limits.statementMinLength, reviewStatementMessage)
  .max(limits.statementMaxLength, reviewStatementMessage)

/** Whole months 1..36 (D-5). Text input is parsed strictly: no decimals, no blanks. */
export const validityMonthsSchema = z
  .number({ error: validityMonthsMessage })
  .int(validityMonthsMessage)
  .min(limits.validityMinMonths, validityMonthsMessage)
  .max(limits.validityMaxMonths, validityMonthsMessage)

export function parseValidityMonthsInput(validityInput: string): number | null {
  const trimmedInput = validityInput.trim()
  if (!/^\d{1,3}$/.test(trimmedInput)) {
    return null
  }
  const parseResult = validityMonthsSchema.safeParse(Number(trimmedInput))
  return parseResult.success ? parseResult.data : null
}

export const issueCertificationInputSchema = z.object({
  enrollmentId: z.string().min(1),
  expectedAssessmentId: z.string().min(1, 'Reload the training record and try again.'),
  hasConfirmedAttestation: z.literal(true, { error: attestationRequiredMessage }),
})

const failureReasonSchema = z
  .string()
  .nullable()
  .transform((reason) => (reason === null ? null : reason.trim()))

export const recordReassessmentInputSchema = z
  .object({
    certificationId: z.string().min(1),
    itemsMet: z.array(z.boolean()).min(1, 'Mark every checklist item as met or not met.'),
    result: z.enum(['passed', 'failed'], { error: 'Choose passed or failed.' }),
    assessorComment: optionalText(limits.assessorCommentMaxLength, 'Comment'),
    failureReason: failureReasonSchema,
  })
  .refine((reassessment) => reassessment.result === 'failed' || reassessment.itemsMet.every((isItemMet) => isItemMet), {
    message: reassessmentPassNeedsEveryItemMessage,
    path: ['result'],
  })
  .refine(
    (reassessment) => {
      if (reassessment.result === 'passed') {
        return reassessment.failureReason === null
      }
      const reasonLength = (reassessment.failureReason ?? '').length
      return reasonLength >= limits.failureReasonMinLength && reasonLength <= limits.failureReasonMaxLength
    },
    { message: reassessmentFailureReasonMessage, path: ['failureReason'] },
  )
