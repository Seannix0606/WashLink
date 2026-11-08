import { describe, expect, it, vi } from 'vitest'
import { testWorkerUserIdentifier } from '../../test/fixtures'
import { SupabaseAuthRepository } from './SupabaseAuthRepository'

const recordedProfileQueries = vi.hoisted(() => [] as unknown[][])

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => ({
    auth: {
      getSession: (): Promise<unknown> =>
        Promise.resolve({
          data: {
            session: {
              user: {
                id: '55555555-5555-4555-8555-555555555555',
                email: 'worker@local.test',
                // Forged metadata must never decide the role (S5).
                user_metadata: { role: 'super_admin' },
              },
            },
          },
          error: null,
        }),
    },
    from: (tableName: string): unknown => {
      const queryBuilder = {
        select: (columns: string): unknown => {
          recordedProfileQueries.push([tableName, columns])
          return queryBuilder
        },
        eq: (columnName: string, value: string): unknown => {
          recordedProfileQueries.push(['eq', columnName, value])
          return queryBuilder
        },
        single: (): Promise<unknown> =>
          Promise.resolve({
            data: {
              id: '55555555-5555-4555-8555-555555555555',
              role: 'worker',
              full_name: 'Test Worker',
              phone_number: '09000000000',
            },
            error: null,
          }),
      }
      return queryBuilder
    },
  }),
}))

describe('SupabaseAuthRepository (J17 authorization)', () => {
  it('j17_auth_role_comes_from_profiles_row_not_user_metadata', async () => {
    const authenticatedUser =
      await new SupabaseAuthRepository().getCurrentSessionUserWithProfile()

    expect(authenticatedUser?.role).toBe('worker')
    expect(recordedProfileQueries[0]).toEqual(['profiles', 'id, role, full_name, phone_number'])
    expect(recordedProfileQueries[1]).toEqual(['eq', 'id', testWorkerUserIdentifier])
  })
})
