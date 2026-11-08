import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testWorkerUserIdentifier } from '../../test/fixtures'
import { SupabaseWorkerProfileRepository } from './SupabaseWorkerProfileRepository'

type RecordedQueryCall = readonly [methodName: string, methodArguments: unknown[]]

const supabaseClientDouble = vi.hoisted(() => {
  const recordedQueryCalls: RecordedQueryCall[] = []
  const singleResult: { data: unknown; error: { code: string; message: string } | null } = {
    data: null,
    error: null,
  }

  function createQueryBuilder(): Record<string, (...methodArguments: unknown[]) => unknown> {
    const queryBuilder: Record<string, (...methodArguments: unknown[]) => unknown> = {}
    for (const methodName of ['upsert', 'select', 'eq', 'delete']) {
      queryBuilder[methodName] = (...methodArguments: unknown[]): unknown => {
        recordedQueryCalls.push([methodName, methodArguments])
        return queryBuilder
      }
    }
    queryBuilder.single = (): Promise<typeof singleResult> => Promise.resolve(singleResult)
    return queryBuilder
  }

  const auth = {
    getSession: (): Promise<unknown> =>
      Promise.resolve({
        data: { session: { user: { id: '55555555-5555-4555-8555-555555555555' } } },
        error: null,
      }),
  }
  const fromTable = (...methodArguments: unknown[]): unknown => {
    recordedQueryCalls.push(['from', methodArguments])
    return createQueryBuilder()
  }
  return { recordedQueryCalls, singleResult, fromTable, auth }
})

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => ({
    from: supabaseClientDouble.fromTable,
    auth: supabaseClientDouble.auth,
  }),
}))

describe('SupabaseWorkerProfileRepository (J1 worker profile)', () => {
  beforeEach(() => {
    supabaseClientDouble.recordedQueryCalls.length = 0
    supabaseClientDouble.singleResult.error = null
  })

  it('j1_supabase_worker_profile_repository_uses_session_id', async () => {
    supabaseClientDouble.singleResult.data = {
      profile_id: testWorkerUserIdentifier,
      headline: 'Detailer',
      experience_summary: null,
      years_of_experience: 2,
      skills: ['Waxing'],
      preferred_locations: [],
      availability_status: 'weekends_only',
      availability_notes: null,
      created_at: '2026-10-24T00:00:00+00:00',
      updated_at: '2026-10-24T00:00:00+00:00',
    }
    const repository = new SupabaseWorkerProfileRepository()

    const savedProfile = await repository.upsertOwnWorkerProfile({
      headline: 'Detailer',
      experienceSummary: null,
      yearsOfExperience: 2,
      skills: ['Waxing'],
      preferredLocations: [],
      availabilityStatus: 'weekends_only',
      availabilityNotes: null,
    })

    const [, [tableName]] = supabaseClientDouble.recordedQueryCalls[0]
    expect(tableName).toBe('worker_profiles')
    const [, [upsertPayload, upsertOptions]] = supabaseClientDouble.recordedQueryCalls[1]
    expect(upsertPayload).toMatchObject({
      profile_id: testWorkerUserIdentifier,
      availability_status: 'weekends_only',
    })
    expect(upsertOptions).toEqual({ onConflict: 'profile_id' })
    expect(savedProfile.availabilityStatus).toBe('weekends_only')

    await repository.deleteOwnWorkerProfile()
    const deleteFilter = supabaseClientDouble.recordedQueryCalls.find(
      ([methodName]) => methodName === 'eq',
    )
    expect(deleteFilter?.[1]).toEqual(['profile_id', testWorkerUserIdentifier])
  })

  it('j1_worker_profile_repository_hides_raw_database_errors', async () => {
    supabaseClientDouble.singleResult.data = null
    supabaseClientDouble.singleResult.error = {
      code: '23514',
      message: 'new row for relation "worker_profiles" violates check constraint',
    }
    const repository = new SupabaseWorkerProfileRepository()

    await expect(
      repository.upsertOwnWorkerPrivateContact({
        contactPhone: null,
        contactEmail: null,
        preferredContactMethod: 'in_app',
      }),
    ).rejects.toThrow('Some details are outside the allowed limits. Check them and try again.')
  })
})
