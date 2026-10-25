import type { JobApplicationStatus } from '../../domain/models/JobApplication'
import type {
  JobOpening,
  JobOpeningApplicantRequirement,
  JobOpeningCompensationCurrency,
  JobOpeningCompensationPeriod,
  JobOpeningJobType,
} from '../../domain/models/JobOpening'
import type {
  MarketplaceJobOpening,
  MarketplaceSearchFilters,
  MarketplaceSearchPage,
} from '../../domain/models/MarketplaceJobOpening'
import type { MarketplaceRepository } from '../../domain/repositories/MarketplaceRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  jobOpeningSelectColumns,
  mapJobOpeningRow,
  toAmount,
  type SupabaseJobOpeningRow,
} from '../supabase/supabaseJobOpeningRow'

interface SupabaseMarketplaceRow {
  job_opening_id: string
  shop_id: string
  shop_name: string
  title: string
  work_location: string | null
  job_type: JobOpeningJobType | null
  applicant_requirement: JobOpeningApplicantRequirement | null
  required_skills: string[] | null
  compensation_min_amount: number | string | null
  compensation_max_amount: number | string | null
  compensation_currency: JobOpeningCompensationCurrency | null
  compensation_period: JobOpeningCompensationPeriod | null
  application_deadline: string | null
  first_published_at: string | null
  my_application_status: JobApplicationStatus | null
}

function mapMarketplaceRow(marketplaceRow: SupabaseMarketplaceRow): MarketplaceJobOpening {
  return {
    jobOpeningId: marketplaceRow.job_opening_id,
    shopId: marketplaceRow.shop_id,
    shopName: marketplaceRow.shop_name,
    title: marketplaceRow.title,
    workLocation: marketplaceRow.work_location,
    jobType: marketplaceRow.job_type,
    applicantRequirement: marketplaceRow.applicant_requirement,
    requiredSkills: marketplaceRow.required_skills ?? [],
    compensationMinAmount: toAmount(marketplaceRow.compensation_min_amount),
    compensationMaxAmount: toAmount(marketplaceRow.compensation_max_amount),
    compensationCurrency: marketplaceRow.compensation_currency,
    compensationPeriod: marketplaceRow.compensation_period,
    applicationDeadline: marketplaceRow.application_deadline,
    firstPublishedAt: marketplaceRow.first_published_at,
    myApplicationStatus: marketplaceRow.my_application_status,
  }
}

/** search_job_openings argument names; every filter is sent, null meaning "not filtered". */
export function toSearchJobOpeningsArguments(
  marketplaceSearchFilters: MarketplaceSearchFilters,
  marketplaceSearchPage: MarketplaceSearchPage,
): Record<string, string | number | boolean | null> {
  return {
    p_query: marketplaceSearchFilters.query,
    p_location: marketplaceSearchFilters.location,
    p_job_type: marketplaceSearchFilters.jobType,
    p_applicant_requirement: marketplaceSearchFilters.applicantRequirement,
    p_required_skill: marketplaceSearchFilters.requiredSkill,
    p_pay_stated: marketplaceSearchFilters.payStated,
    p_min_pay_amount: marketplaceSearchFilters.minPayAmount,
    p_pay_period: marketplaceSearchFilters.payPeriod,
    p_limit: marketplaceSearchPage.limit,
    p_offset: marketplaceSearchPage.offset,
  }
}

export class SupabaseMarketplaceRepository implements MarketplaceRepository {
  public async searchJobOpenings(
    marketplaceSearchFilters: MarketplaceSearchFilters,
    marketplaceSearchPage: MarketplaceSearchPage,
  ): Promise<MarketplaceJobOpening[]> {
    const rpcResponse = await getSupabaseClient().rpc(
      'search_job_openings',
      toSearchJobOpeningsArguments(marketplaceSearchFilters, marketplaceSearchPage),
    )
    if (rpcResponse.error) {
      throw toUserFacingError(rpcResponse.error, 'Could not search job openings.')
    }
    const marketplaceRows = (rpcResponse.data ?? []) as SupabaseMarketplaceRow[]
    return marketplaceRows.map(mapMarketplaceRow)
  }

  public async fetchJobOpening(jobOpeningId: string): Promise<JobOpening | null> {
    const queryResponse = await getSupabaseClient()
      .from('job_openings')
      .select(jobOpeningSelectColumns)
      .eq('id', jobOpeningId)
      .limit(1)
    if (queryResponse.error) {
      throw toUserFacingError(queryResponse.error, 'Could not load the job opening.')
    }
    const openingRows = queryResponse.data as unknown as SupabaseJobOpeningRow[]
    const openingRow = openingRows.at(0)
    return openingRow === undefined ? null : mapJobOpeningRow(openingRow)
  }
}
