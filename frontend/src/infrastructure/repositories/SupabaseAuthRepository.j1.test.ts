import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateAccountError } from '../../domain/errors/DuplicateAccountError'
import { testWorkerUserIdentifier } from '../../test/fixtures'
import { SupabaseAuthRepository } from './SupabaseAuthRepository'

const authDouble = vi.hoisted(() => ({
  signUpResult: { data: {}, error: null } as { data: unknown; error: unknown },
  recordedSignUpCalls: [] as unknown[],
}))

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => ({
    auth: {
      signUp: (signUpArguments: unknown): Promise<unknown> => {
        authDouble.recordedSignUpCalls.push(signUpArguments)
        return Promise.resolve(authDouble.signUpResult)
      },
    },
  }),
}))

const signUpInput = {
  emailAddress: 'worker@local.test',
  password: 'secret-123',
  fullName: 'Test Worker',
  phoneNumber: '09000000000',
}

const signedUpUser = { id: testWorkerUserIdentifier, identities: [{ id: 'identity' }] }

describe('SupabaseAuthRepository sign-up (J1 registration)', () => {
  beforeEach(() => {
    authDouble.recordedSignUpCalls.length = 0
  })

  it('j1_sign_up_reports_confirmation_required', async () => {
    const authRepository = new SupabaseAuthRepository()

    authDouble.signUpResult = { data: { user: signedUpUser, session: null }, error: null }
    await expect(authRepository.signUp(signUpInput, 'worker')).resolves.toBe(
      'confirmation_required',
    )

    authDouble.signUpResult = {
      data: { user: signedUpUser, session: { access_token: 'token' } },
      error: null,
    }
    await expect(authRepository.signUp(signUpInput, 'worker')).resolves.toBe('can_sign_in')

    expect(authDouble.recordedSignUpCalls[0]).toMatchObject({
      email: 'worker@local.test',
      options: { data: { role: 'worker' } },
    })
  })

  it('sends a customer home location with the sign-up, and never for other roles', async () => {
    const authRepository = new SupabaseAuthRepository()
    authDouble.signUpResult = { data: { user: signedUpUser, session: null }, error: null }
    const homeLocation = { address: '12 Sample Street, Makati City', latitude: 14.5995, longitude: 120.9842 }

    await authRepository.signUp({ ...signUpInput, homeLocation }, 'customer')
    await authRepository.signUp({ ...signUpInput, homeLocation }, 'worker')

    expect(authDouble.recordedSignUpCalls[0]).toMatchObject({
      options: { data: { role: 'customer', home_address: '12 Sample Street, Makati City', home_latitude: 14.5995, home_longitude: 120.9842 } },
    })
    expect(JSON.stringify(authDouble.recordedSignUpCalls[1])).not.toContain('home_')
  })

  it('j1_sign_up_maps_existing_account_to_duplicate_error', async () => {
    const authRepository = new SupabaseAuthRepository()

    authDouble.signUpResult = {
      data: { user: { ...signedUpUser, identities: [] }, session: null },
      error: null,
    }
    await expect(authRepository.signUp(signUpInput, 'customer')).rejects.toBeInstanceOf(
      DuplicateAccountError,
    )

    authDouble.signUpResult = {
      data: { user: null, session: null },
      error: { code: 'user_already_exists', message: 'User already registered', status: 422 },
    }
    await expect(authRepository.signUp(signUpInput, 'owner')).rejects.toBeInstanceOf(
      DuplicateAccountError,
    )

    authDouble.signUpResult = {
      data: { user: null, session: null },
      error: { message: 'Database error saving new user', status: 500 },
    }
    await expect(authRepository.signUp(signUpInput, 'owner')).rejects.toThrow(
      'We could not create your account right now. Please try again later.',
    )
  })
})
