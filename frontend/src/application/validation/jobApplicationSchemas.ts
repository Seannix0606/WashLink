import { z } from 'zod'
import { jobApplicationLimits } from '../../domain/models/JobApplication'
import {
  jobOpeningApplicantRequirements,
  jobOpeningCompensationPeriods,
  jobOpeningJobTypes,
} from '../../domain/models/JobOpening'
import {
  marketplaceSearchLimits,
  type MarketplaceSearchFilters,
  type MarketplaceSearchPage,
} from '../../domain/models/MarketplaceJobOpening'
import { optionalText } from './formFieldSchemas'

/** Same message as the database CHECK (`The cover note must be 1000 characters or fewer.`). */
export const coverNoteTooLongMessage = `The cover note must be ${String(jobApplicationLimits.coverNoteMaxLength)} characters or fewer.`

/** Trimmed; empty becomes null (the database stores nullif(trim(...), '')). */
export const coverNoteSchema: z.ZodType<string | null> = z
  .string()
  .trim()
  .max(jobApplicationLimits.coverNoteMaxLength, coverNoteTooLongMessage)
  .nullable()
  .transform((coverNote) => (coverNote === null || coverNote.length === 0 ? null : coverNote))

/** Same message as search_job_openings: "Search filters must be 80 characters or fewer." */
function searchTextFilter(): z.ZodType<string | null> {
  return optionalText(marketplaceSearchLimits.textFilterMaxLength, 'Search filters')
}

export const marketplaceSearchFiltersSchema: z.ZodType<MarketplaceSearchFilters> = z
  .object({
    query: searchTextFilter(),
    location: searchTextFilter(),
    jobType: z.enum(jobOpeningJobTypes, { error: 'Choose a job type.' }).nullable(),
    applicantRequirement: z
      .enum(jobOpeningApplicantRequirements, { error: 'Choose who can apply.' })
      .nullable(),
    requiredSkill: searchTextFilter(),
    payStated: z.boolean().nullable(),
    minPayAmount: z
      .number()
      .min(0, 'The minimum pay amount cannot be negative.')
      .nullable(),
    payPeriod: z
      .enum(jobOpeningCompensationPeriods, { error: 'Choose the pay period.' })
      .nullable(),
  })
  .refine(
    (filters) => filters.minPayAmount === null || filters.payPeriod !== null,
    { message: 'Choose a pay period to filter by pay amount.', path: ['payPeriod'] },
  )

const searchPageMessage = 'Results are limited to 1-50 per page and an offset of 0-1000.'

export const marketplaceSearchPageSchema: z.ZodType<MarketplaceSearchPage> = z.object({
  limit: z
    .number()
    .int(searchPageMessage)
    .min(1, searchPageMessage)
    .max(marketplaceSearchLimits.pageSizeMaximum, searchPageMessage),
  offset: z
    .number()
    .int(searchPageMessage)
    .min(0, searchPageMessage)
    .max(marketplaceSearchLimits.offsetMaximum, searchPageMessage),
})
