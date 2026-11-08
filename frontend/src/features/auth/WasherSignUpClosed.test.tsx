import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFeatureFlags } from '@washlink/shared'
import type { SignUpOutcome } from '../../domain/repositories/AuthRepository'
import { AuthLandingPage } from './AuthLandingPage'
import { LandingWasherAndApp } from '../b2c/landing/LandingWasherAndApp'

// The release with WashLink operating the washes itself: B2B off and washer sign-up closed.
vi.mock('../../application/featureFlags', () => ({
  featureFlags: { isB2bEnabled: false, isB2cEnabled: true, isWasherSignUpEnabled: false },
}))

const authContextDouble = vi.hoisted(() => ({
  signUpCustomer: vi.fn<() => Promise<SignUpOutcome>>(),
  signUpOwner: vi.fn<() => Promise<SignUpOutcome>>(),
  signUpWorker: vi.fn<() => Promise<SignUpOutcome>>(),
  signIn: vi.fn<() => Promise<void>>(),
}))

vi.mock('../../presentation/auth/AuthenticatedUserContext', () => ({
  useAuthenticatedUser: (): unknown => ({
    ...authContextDouble,
    authService: { sendPasswordResetEmail: vi.fn() },
    authenticatedUser: null,
  }),
}))

describe('washer sign-up closed (OP-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the washer sign-up flag as off unless it is exactly true', () => {
    expect(readFeatureFlags(() => undefined).isWasherSignUpEnabled).toBe(false)
    expect(readFeatureFlags((name) => (name === 'FEATURE_WASHER_SIGNUP' ? 'yes' : undefined)).isWasherSignUpEnabled).toBe(false)
    expect(readFeatureFlags((name) => (name === 'FEATURE_WASHER_SIGNUP' ? 'true' : undefined)).isWasherSignUpEnabled).toBe(true)
  })

  it('offers no account type choice and signs up a customer', async () => {
    authContextDouble.signUpCustomer.mockResolvedValue('confirmation_required')
    const user = userEvent.setup()
    render(<AuthLandingPage />)
    await user.click(screen.getByRole('tab', { name: 'Create account' }))

    expect(screen.queryByText('Choose your account type')).toBeNull()
    expect(screen.queryByRole('button', { name: /car wash work/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /own a car wash/ })).toBeNull()

    await user.type(screen.getByLabelText(/Full name/), 'Test Customer')
    await user.type(screen.getByLabelText(/Phone number/), '09000000000')
    await user.type(screen.getByLabelText(/Email address/), 'customer@local.test')
    await user.type(screen.getByLabelText(/^Password/), 'secret-123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(authContextDouble.signUpCustomer).toHaveBeenCalledTimes(1)
    expect(authContextDouble.signUpWorker).not.toHaveBeenCalled()
  })

  it('drops the washer section from the landing page and keeps the install help', () => {
    render(<LandingWasherAndApp onSignUp={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Sign up as a washer' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'WashLink on your phone' })).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
  })
})
