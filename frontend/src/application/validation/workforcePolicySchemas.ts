import { z } from 'zod'
import { workforcePolicyLimits } from '../../domain/models/WorkforcePolicy'

/** Same texts as `set_workforce_policy_value` (w10c), so the client and the server say the same thing. */
export const policyValueRangeMessage = 'Choose a whole number from 1 to 10.'
export const policyReasonLengthMessage = 'Give a reason of 10 to 300 characters.'
export const policySameValueMessage = 'This is already the current value.'
export const policyStaleMessage = 'This policy changed. Reload it and try again.'

/** A whole number 1..10 typed into a text field (no decimals, signs or exponents). */
export const workforcePolicyValueSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{1,2}$/, policyValueRangeMessage)
  .transform((valueText) => Number(valueText))
  .pipe(
    z
      .number()
      .int(policyValueRangeMessage)
      .min(workforcePolicyLimits.minimumValue, policyValueRangeMessage)
      .max(workforcePolicyLimits.maximumValue, policyValueRangeMessage),
  )

export const workforcePolicyReasonSchema = z
  .string()
  .trim()
  .min(workforcePolicyLimits.reasonMinLength, policyReasonLengthMessage)
  .max(workforcePolicyLimits.reasonMaxLength, policyReasonLengthMessage)

export type WorkforcePolicyField = 'value' | 'reason'

/** The field a server message belongs to, so it can be shown next to that field. */
export function workforcePolicyFieldForMessage(message: string): WorkforcePolicyField | null {
  if (message === policyValueRangeMessage || message === policySameValueMessage) {
    return 'value'
  }
  return message === policyReasonLengthMessage ? 'reason' : null
}
