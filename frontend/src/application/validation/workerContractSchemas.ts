import { z } from 'zod'
import {
  workerContractLimits as limits,
  type ContractOwnerValueKey,
  type ContractOwnerValues,
} from '../../domain/models/WorkerContract'
import { normalizeClauseText } from '../../domain/utilities/contractTemplatePlaceholders'
import { findOwnerTextProblem, firstIssueMessage } from './contractTemplateSchemas'

// Mirrors the W9 RPC checks (w9b owner values, w9e terms, w9g notes and reasons) with the same
// messages. The database stays the authority and re-checks everything.

export const classificationRequiredMessage = 'Choose the relationship type for this contract.'
export const startDateRequiredMessage = 'Give a start date.'
export const endBeforeStartMessage = 'The end date cannot be before the start date.'
export const placeholderBracesMessage = 'Placeholder values cannot contain {{ or }}.'
export const declineNoteMessage = 'Keep the note to 500 characters.'
export const terminationReasonMessage = 'Give a reason of 10 to 500 characters.'
export const chooseWorkerMessage = 'Choose a worker.'
export const chooseTemplateMessage = 'Choose a contract template.'
export const contractorAcknowledgementMessage = 'Confirm the independent contractor acknowledgement.'
export const offerStatementMessage = 'Confirm the offer statement before sending.'
export const acceptanceStatementMessage = 'Confirm the acceptance statement before accepting.'
export const flagReviewMessage = 'Confirm that you reviewed the keyword check.'

export const ownerValueLengthMessages: Readonly<Record<ContractOwnerValueKey, string>> = {
  role_title: 'Write the role title in 3 to 120 characters.',
  schedule_summary: 'Write the schedule in 3 to 500 characters.',
  pay_details: 'Write the pay details in 3 to 1000 characters.',
}

const ownerValueLengths: Readonly<Record<ContractOwnerValueKey, readonly [number, number]>> = {
  role_title: [limits.roleTitleMinLength, limits.roleTitleMaxLength],
  schedule_summary: [limits.scheduleSummaryMinLength, limits.scheduleSummaryMaxLength],
  pay_details: [limits.payDetailsMinLength, limits.payDetailsMaxLength],
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

function ownerValueSchema(valueKey: ContractOwnerValueKey): z.ZodType<string> {
  const [minimumLength, maximumLength] = ownerValueLengths[valueKey]
  return z
    .string()
    .transform(normalizeClauseText)
    .superRefine((value, refinementContext) => {
      if (value.includes('{{') || value.includes('}}')) {
        refinementContext.addIssue({ code: 'custom', message: placeholderBracesMessage })
        return
      }
      if (value.length < minimumLength || value.length > maximumLength) {
        refinementContext.addIssue({ code: 'custom', message: ownerValueLengthMessages[valueKey] })
        return
      }
      const ownerTextProblem = findOwnerTextProblem(value)
      if (ownerTextProblem !== null) {
        refinementContext.addIssue({ code: 'custom', message: ownerTextProblem })
      }
    })
}

export const declineNoteSchema = z.string().transform((note) => note.trim()).pipe(z.string().max(limits.declineNoteMaxLength, declineNoteMessage))

export const terminationReasonSchema = z
  .string()
  .transform((reason) => reason.trim())
  .pipe(z.string().min(limits.terminationReasonMinLength, terminationReasonMessage).max(limits.terminationReasonMaxLength, terminationReasonMessage))

/** The contract details the owner edits (classification, dates, owner-typed values). */
export interface ContractDetailsDraft {
  /** null until the owner picks one: nothing is preselected (D-26). */
  readonly classificationKey: string | null
  readonly startDate: string
  readonly endDate: string
  readonly ownerValues: Readonly<Record<ContractOwnerValueKey, string>>
}

export type ContractDetailsField = 'classificationKey' | 'startDate' | 'endDate' | ContractOwnerValueKey

export type ContractDetailsErrors = Readonly<Partial<Record<ContractDetailsField, string>>>

/**
 * Field errors for the details. An empty owner value is allowed while drafting (sending lists
 * it as missing); a filled one must pass the same checks as the server.
 */
export function validateContractDetails(details: ContractDetailsDraft): ContractDetailsErrors {
  const errors: Partial<Record<ContractDetailsField, string>> = {}
  if (details.classificationKey === null || details.classificationKey.length === 0) {
    errors.classificationKey = classificationRequiredMessage
  }
  if (!isoDatePattern.test(details.startDate)) {
    errors.startDate = startDateRequiredMessage
  }
  if (details.endDate.length > 0 && (!isoDatePattern.test(details.endDate) || details.endDate < details.startDate)) {
    errors.endDate = endBeforeStartMessage
  }
  for (const [valueKey, value] of Object.entries(details.ownerValues) as [ContractOwnerValueKey, string][]) {
    if (value.trim().length === 0) {
      continue
    }
    const valueProblem = firstIssueMessage(ownerValueSchema(valueKey), value)
    if (valueProblem !== null) {
      errors[valueKey] = valueProblem
    }
  }
  return errors
}

/** Normalized owner values to send; empty ones are left out (never filled in by WashLink). */
export function toOwnerValues(ownerValues: Readonly<Record<ContractOwnerValueKey, string>>): ContractOwnerValues {
  const normalized: Partial<Record<ContractOwnerValueKey, string>> = {}
  for (const [valueKey, value] of Object.entries(ownerValues) as [ContractOwnerValueKey, string][]) {
    const normalizedValue = normalizeClauseText(value)
    if (normalizedValue.length > 0) {
      normalized[valueKey] = normalizedValue
    }
  }
  return normalized
}

export function firstDetailsError(errors: ContractDetailsErrors): string | null {
  return Object.values(errors).at(0) ?? null
}
