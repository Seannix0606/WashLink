import { describe, expect, it } from 'vitest'
import { createMockAuthRepository } from '../../test/fixtures'
import { AuthService } from './AuthService'

describe('AuthService (J1 registration)', () => {
  it('j1_auth_service_sign_up_worker_sends_worker_role', async () => {
    const authRepository = createMockAuthRepository()
    authRepository.signUp.mockResolvedValue('confirmation_required')
    const authService = new AuthService(authRepository)
    const signUpInput = {
      emailAddress: 'worker@local.test',
      password: 'secret-123',
      fullName: 'Test Worker',
      phoneNumber: '09000000000',
    }

    const signUpOutcome = await authService.signUpWorker(signUpInput)

    expect(signUpOutcome).toBe('confirmation_required')
    expect(authRepository.signUp).toHaveBeenCalledTimes(1)
    expect(authRepository.signUp).toHaveBeenCalledWith(signUpInput, 'worker')
  })
})
