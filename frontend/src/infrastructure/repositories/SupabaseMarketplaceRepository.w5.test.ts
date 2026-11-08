import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyMarketplaceSearchFilters } from '../../domain/models/MarketplaceJobOpening'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseMarketplaceRepository } from './SupabaseMarketplaceRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return {
    isSupabaseConfigured: true,
    getSupabaseClient: createJobOpeningSupabaseClientDouble,
  }
})

describe('SupabaseMarketplaceRepository (W5 marketplace)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('w5_marketplace_repository_passes_filters_to_search_rpc', async () => {
    const repository = new SupabaseMarketplaceRepository()
    supabaseDouble.rpcResult = {
      data: [
        {
          job_opening_id: 'opening-1',
          shop_id: 'shop-1',
          shop_name: 'Test Shop',
          title: 'Car wash attendant',
          work_location: 'Test City',
          job_type: 'part_time',
          applicant_requirement: 'trainees_welcome',
          required_skills: null,
          compensation_min_amount: '550.00',
          compensation_max_amount: null,
          compensation_currency: 'PHP',
          compensation_period: 'day',
          application_deadline: '2026-11-30',
          first_published_at: '2026-10-25T00:00:00+00:00',
          my_application_status: 'submitted',
        },
      ],
      error: null,
    }

    const searchResults = await repository.searchJobOpenings(
      {
        query: 'attendant',
        location: 'Test City',
        jobType: 'part_time',
        applicantRequirement: 'trainees_welcome',
        requiredSkill: 'buffing',
        payStated: true,
        minPayAmount: 500,
        payPeriod: 'day',
      },
      { limit: 20, offset: 40 },
    )

    expect(recordedArgumentsOf('rpc')).toEqual([
      [
        'search_job_openings',
        {
          p_query: 'attendant',
          p_location: 'Test City',
          p_job_type: 'part_time',
          p_applicant_requirement: 'trainees_welcome',
          p_required_skill: 'buffing',
          p_pay_stated: true,
          p_min_pay_amount: 500,
          p_pay_period: 'day',
          p_limit: 20,
          p_offset: 40,
        },
      ],
    ])
    // Stored values only: the numeric string becomes the same number, nothing else is filled in.
    expect(searchResults).toEqual([
      expect.objectContaining({
        jobOpeningId: 'opening-1',
        compensationMinAmount: 550,
        compensationMaxAmount: null,
        requiredSkills: [],
        myApplicationStatus: 'submitted',
      }),
    ])

    // Unset filters are sent as null ("not filtered"), never as invented defaults.
    supabaseDouble.rpcResult = { data: [], error: null }
    await repository.searchJobOpenings(emptyMarketplaceSearchFilters, { limit: 20, offset: 0 })
    const [, unfilteredArguments] = recordedArgumentsOf('rpc')[1] as [string, Record<string, unknown>]
    expect(Object.entries(unfilteredArguments).filter(([, value]) => value !== null)).toEqual([
      ['p_limit', 20],
      ['p_offset', 0],
    ])

    // Input refusals from the RPC keep their exact text.
    supabaseDouble.rpcResult = {
      data: null,
      error: { code: '22023', message: 'Choose a pay period to filter by pay amount.' },
    }
    await expect(
      repository.searchJobOpenings(emptyMarketplaceSearchFilters, { limit: 20, offset: 0 }),
    ).rejects.toThrow('Choose a pay period to filter by pay amount.')
    expect(recordedArgumentsOf('insert')).toEqual([])
  })
})
