import {
  jobOpeningApplicantRequirements,
  jobOpeningCompensationPeriods,
  jobOpeningJobTypes,
  type JobOpeningApplicantRequirement,
  type JobOpeningCompensationPeriod,
  type JobOpeningJobType,
} from '../../domain/models/JobOpening'
import type { MarketplaceSearchFilters } from '../../domain/models/MarketplaceJobOpening'
import { marketplaceSearchFiltersSchema } from './jobApplicationSchemas'

/** Raw form values of the marketplace filter bar ('' means "any"). */
export interface MarketplaceFilterDraft {
  readonly query: string
  readonly location: string
  readonly jobType: string
  readonly applicantRequirement: string
  readonly requiredSkill: string
  /** '', 'stated' or 'not_stated'. */
  readonly payStated: string
  readonly minPayAmount: string
  readonly payPeriod: string
}

export const emptyMarketplaceFilterDraft: MarketplaceFilterDraft = {
  query: '',
  location: '',
  jobType: '',
  applicantRequirement: '',
  requiredSkill: '',
  payStated: '',
  minPayAmount: '',
  payPeriod: '',
}

export type ParsedMarketplaceFilterDraft =
  | { readonly isValid: true; readonly filters: MarketplaceSearchFilters }
  | { readonly isValid: false; readonly fieldName: string; readonly errorMessage: string }

function pickOption<OptionValue extends string>(
  rawValue: string,
  allowedValues: readonly OptionValue[],
): OptionValue | null {
  return (allowedValues as readonly string[]).includes(rawValue) ? (rawValue as OptionValue) : null
}

function toPayStated(rawValue: string): boolean | null {
  if (rawValue === 'stated') {
    return true
  }
  return rawValue === 'not_stated' ? false : null
}

/** Converts the form into search filters with the same limits as search_job_openings. */
export function parseMarketplaceFilterDraft(draft: MarketplaceFilterDraft): ParsedMarketplaceFilterDraft {
  const trimmedMinimumPay = draft.minPayAmount.trim()
  const minPayAmount = trimmedMinimumPay === '' ? null : Number(trimmedMinimumPay)
  if (minPayAmount !== null && !Number.isFinite(minPayAmount)) {
    return { isValid: false, fieldName: 'minPayAmount', errorMessage: 'Enter the minimum pay as a number.' }
  }
  const parseResult = marketplaceSearchFiltersSchema.safeParse({
    query: draft.query,
    location: draft.location,
    jobType: pickOption<JobOpeningJobType>(draft.jobType, jobOpeningJobTypes),
    applicantRequirement: pickOption<JobOpeningApplicantRequirement>(
      draft.applicantRequirement,
      jobOpeningApplicantRequirements,
    ),
    requiredSkill: draft.requiredSkill,
    payStated: toPayStated(draft.payStated),
    minPayAmount,
    payPeriod: pickOption<JobOpeningCompensationPeriod>(draft.payPeriod, jobOpeningCompensationPeriods),
  })
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues.at(0)
    return {
      isValid: false,
      fieldName: String(firstIssue?.path.at(0) ?? 'query'),
      errorMessage: firstIssue?.message ?? 'Check the search filters.',
    }
  }
  return { isValid: true, filters: parseResult.data }
}
