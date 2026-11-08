import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateAccountError } from '../../domain/errors/DuplicateAccountError'
import type { SignUpOutcome } from '../../domain/repositories/AuthRepository'
import { AuthLandingPage } from './AuthLandingPage'

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

async function fillAndSubmitSignUp(roleOptionName: RegExp): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('tab', { name: 'Create account' }))
  await user.click(screen.getByRole('button', { name: roleOptionName }))
  await user.type(screen.getByLabelText(/Full name/), 'Test Worker')
  await user.type(screen.getByLabelText(/Phone number/), '09000000000')
  await user.type(screen.getByLabelText(/Email address/), 'worker@local.test')
  await user.type(screen.getByLabelText(/^Password/), 'secret-123')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('AuthLandingPage sign-up (J1 registration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('j1_duplicate_account_shows_sign_in_guidance', async () => {
    authContextDouble.signUpWorker.mockRejectedValue(new DuplicateAccountError())
    render(<AuthLandingPage />)

    await fillAndSubmitSignUp(/I want car wash work/)

    expect(authContextDouble.signUpWorker).toHaveBeenCalledTimes(1)
    const duplicateAccountAlert = await screen.findByRole('alert')
    expect(duplicateAccountAlert).toHaveTextContent('An account with this email already exists.')
    const alertActions = within(duplicateAccountAlert)
    expect(alertActions.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()

    await userEvent.setup().click(alertActions.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('j1_sign_up_shows_check_email_notice', async () => {
    authContextDouble.signUpOwner.mockResolvedValue('confirmation_required')
    render(<AuthLandingPage />)

    await fillAndSubmitSignUp(/I own a car wash/)

    expect(authContextDouble.signUpOwner).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Check your email to confirm your account',
    )
    expect(screen.getByRole('status')).toHaveTextContent('worker@local.test')
  })
})
