import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildJobOpening, testJobOpeningIdentifier, testOwnerIdentifier } from '../../test/fixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { jobOpeningSelectColumns, type SupabaseJobOpeningRow } from '../supabase/supabaseJobOpeningRow'
import {
  jobOpeningDeleteNoRowsMessage,
  jobOpeningUpdateNoRowsMessage,
  SupabaseJobOpeningRepository,
} from './SupabaseJobOpeningRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return {
    isSupabaseConfigured: true,
    getSupabaseClient: createJobOpeningSupabaseClientDouble,
  }
})

function buildJobOpeningRow(overrides: Partial<SupabaseJobOpeningRow> = {}): SupabaseJobOpeningRow {
  return {
    id: testJobOpeningIdentifier, shop_id: '33333333-3333-4333-8333-333333333333', status: 'draft',
    title: 'Car wash attendant', description: null, duties: [], work_location: null,
    openings_count: null, job_type: null, required_skills: [], minimum_years_experience: null,
    experience_requirement: null, availability_requirement: null, schedule_details: null,
    compensation_min_amount: null, compensation_max_amount: null, compensation_currency: null,
    compensation_period: null, compensation_details: null, benefits: null, other_terms: null,
    minimum_qualifications: [], preferred_qualifications: [], required_training: null,
    applicant_requirement: null, certification_expectations: null, application_deadline: null,
    application_instructions: null, first_published_at: null, status_changed_at: null,
    created_at: '2026-10-24T00:00:00+00:00', updated_at: '2026-10-24T00:00:00.123456+00:00',
    ...overrides,
  }
}

describe('SupabaseJobOpeningRepository (W4 job openings)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('w4_supabase_job_opening_repository_selects_explicit_columns', async () => {
    supabaseDouble.queryResult = {
      data: [buildJobOpeningRow({ compensation_min_amount: '650.50', compensation_max_amount: 700, compensation_currency: 'PHP', compensation_period: 'day' })],
      error: null,
    }
    const repository = new SupabaseJobOpeningRepository()

    const jobOpenings = await repository.listOwnJobOpenings()

    expect(recordedArgumentsOf('from')).toEqual([['job_openings']])
    const [selectColumns] = recordedArgumentsOf('select')[0] as [string]
    expect(selectColumns).toBe(jobOpeningSelectColumns)
    expect(selectColumns).not.toContain('*')
    expect(selectColumns).not.toContain('owner_id')
    expect(selectColumns.split(', ')).toHaveLength(32)
    expect(recordedArgumentsOf('eq')).toEqual([['owner_id', testOwnerIdentifier]])
    expect(recordedArgumentsOf('neq')).toEqual([['status', 'archived']])
    expect(recordedArgumentsOf('order')).toEqual([['updated_at', { ascending: false }]])
    expect(recordedArgumentsOf('limit')).toEqual([[200]])
    // numeric(10,2) values arrive as numbers or numeric strings and are kept exactly.
    expect(jobOpenings[0]?.compensationMinAmount).toBe(650.5)
    expect(jobOpenings[0]?.compensationMaxAmount).toBe(700)
    expect(jobOpenings[0]?.updatedAt).toBe('2026-10-24T00:00:00.123456+00:00')

    supabaseDouble.queryResult = {
      data: null,
      error: { code: '42501', message: 'permission denied for table job_openings' },
    }
    await expect(repository.listOwnJobOpenings()).rejects.toThrow('Your account is not allowed to do this.')
  })

  it('w4_job_opening_repository_transition_uses_rpc_with_expected_status', async () => {
    supabaseDouble.rpcResult = { data: buildJobOpeningRow({ status: 'published' }), error: null }
    const repository = new SupabaseJobOpeningRepository()

    const transitionedJobOpening = await repository.transition(testJobOpeningIdentifier, 'draft', 'published')

    expect(recordedArgumentsOf('rpc')).toEqual([
      [
        'transition_job_opening',
        { p_job_opening_id: testJobOpeningIdentifier, p_from_status: 'draft', p_to_status: 'published' },
      ],
    ])
    expect(recordedArgumentsOf('update')).toEqual([])
    expect(transitionedJobOpening.status).toBe('published')

    for (const [errorCode, databaseMessage] of [
      ['55000', 'This job opening changed. Refresh and try again.'],
      ['42501', 'Only a verified shop can publish job openings.'],
      ['42501', 'Job opening not found.'],
      ['23514', 'Complete the required job opening fields before publishing.'],
      ['23514', 'The application deadline has passed.'],
    ] as const) {
      supabaseDouble.rpcResult = { data: null, error: { code: errorCode, message: databaseMessage } }
      await expect(repository.transition(testJobOpeningIdentifier, 'paused', 'published')).rejects.toThrow(databaseMessage)
    }
    supabaseDouble.rpcResult = { data: null, error: { code: 'P0001', message: 'raw internal detail' } }
    await expect(repository.transition(testJobOpeningIdentifier, 'published', 'paused')).rejects.toThrow(
      'Could not change the job opening status.',
    )

    supabaseDouble.recordedCalls.length = 0
    supabaseDouble.rpcResult = { data: true, error: null }
    await expect(repository.isShopVerifiedForPublishing('shop-1')).resolves.toBe(true)
    expect(recordedArgumentsOf('rpc')).toEqual([['is_verified_shop_owner', { p_shop_id: 'shop-1' }]])
    supabaseDouble.rpcResult = { data: false, error: null }
    await expect(repository.isShopVerifiedForPublishing('shop-1')).resolves.toBe(false)
  })

  it('w4_job_opening_repository_treats_zero_affected_rows_as_failure', async () => {
    const repository = new SupabaseJobOpeningRepository()
    const storedJobOpening = buildJobOpening()

    // RLS filters a non-owner's, changed or missing row: 0 rows, no error.
    supabaseDouble.queryResult = { data: [], error: null }
    await expect(
      repository.updateJobOpening(storedJobOpening.id, storedJobOpening, storedJobOpening.updatedAt),
    ).rejects.toThrow(jobOpeningUpdateNoRowsMessage)
    expect(recordedArgumentsOf('eq')).toEqual([
      ['id', testJobOpeningIdentifier],
      ['updated_at', storedJobOpening.updatedAt],
    ])

    // Deleting a non-draft is filtered by jo_delete_owner_draft: 0 rows, no error.
    supabaseDouble.recordedCalls.length = 0
    await expect(repository.deleteDraft(testJobOpeningIdentifier)).rejects.toThrow(jobOpeningDeleteNoRowsMessage)
    expect(jobOpeningDeleteNoRowsMessage).toBe('Only draft job openings can be deleted.')
    expect(recordedArgumentsOf('eq')).toEqual([
      ['id', testJobOpeningIdentifier],
      ['status', 'draft'],
    ])

    supabaseDouble.queryResult = { data: [{ id: testJobOpeningIdentifier }], error: null }
    await expect(repository.deleteDraft(testJobOpeningIdentifier)).resolves.toBeUndefined()
    supabaseDouble.queryResult = { data: [buildJobOpeningRow({ title: 'Updated' })], error: null }
    await expect(
      repository.updateJobOpening(storedJobOpening.id, storedJobOpening, storedJobOpening.updatedAt),
    ).resolves.toMatchObject({ title: 'Updated' })
  })
})
