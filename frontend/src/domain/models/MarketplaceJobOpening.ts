import type { JobApplicationStatus } from './JobApplication'
import type {
  JobOpeningApplicantRequirement,
  JobOpeningCompensationCurrency,
  JobOpeningCompensationPeriod,
  JobOpeningJobType,
} from './JobOpening'

/** One row of search_job_openings: a published opening of a verified shop, open for applications. */
export interface MarketplaceJobOpening {
  readonly jobOpeningId: string
  readonly shopId: string
  readonly shopName: string
  readonly title: string
  readonly workLocation: string | null
  readonly jobType: JobOpeningJobType | null
  readonly applicantRequirement: JobOpeningApplicantRequirement | null
  readonly requiredSkills: readonly string[]
  readonly compensationMinAmount: number | null
  readonly compensationMaxAmount: number | null
  readonly compensationCurrency: JobOpeningCompensationCurrency | null
  readonly compensationPeriod: JobOpeningCompensationPeriod | null
  /** Asia/Manila calendar date (YYYY-MM-DD). */
  readonly applicationDeadline: string | null
  readonly firstPublishedAt: string | null
  /** The caller's non-withdrawn application to this opening, if any (it blocks re-applying). */
  readonly myApplicationStatus: JobApplicationStatus | null
}

/** Every filter is optional; null means "not filtered". Pay filters use stated values only. */
export interface MarketplaceSearchFilters {
  readonly query: string | null
  readonly location: string | null
  readonly jobType: JobOpeningJobType | null
  readonly applicantRequirement: JobOpeningApplicantRequirement | null
  readonly requiredSkill: string | null
  /** true: pay stated; false: no pay stated; null: either. */
  readonly payStated: boolean | null
  /** Requires payPeriod; matches openings whose stated max (or min) is at least this amount. */
  readonly minPayAmount: number | null
  readonly payPeriod: JobOpeningCompensationPeriod | null
}

export const emptyMarketplaceSearchFilters: MarketplaceSearchFilters = {
  query: null,
  location: null,
  jobType: null,
  applicantRequirement: null,
  requiredSkill: null,
  payStated: null,
  minPayAmount: null,
  payPeriod: null,
}

export interface MarketplaceSearchPage {
  readonly limit: number
  readonly offset: number
}

/** Mirrors the input checks of search_job_openings (W5d). */
export const marketplaceSearchLimits = {
  textFilterMaxLength: 80,
  pageSize: 20,
  pageSizeMaximum: 50,
  offsetMaximum: 1000,
} as const
