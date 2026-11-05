import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccountSection } from './DeleteAccountSection'

const mocks = vi.hoisted(() => ({
  deleteMyAccount: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('./b2cApiClient', () => ({
  getB2cApi: (): unknown => ({ deleteMyAccount: mocks.deleteMyAccount }),
  errorMessage: (error: Error): string => error.message,
}))
vi.mock('../../infrastructure/supabase/supabaseClient', () => ({
  getSupabaseClient: (): unknown => ({
    auth: { getSession: mocks.getSession, signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
  }),
}))

async function confirmWith(password: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  await userEvent.type(screen.getByLabelText(/Enter your password/), password)
  await userEvent.click(screen.getByRole('button', { name: 'Permanently delete my account' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ data: { session: { user: { email: 'bea@local.test' } } } })
  mocks.signInWithPassword.mockResolvedValue({ error: null })
  mocks.deleteMyAccount.mockResolvedValue(undefined)
  mocks.signOut.mockResolvedValue({ error: null })
})

describe('delete account', () => {
  it('says what is removed and what is kept, and asks before anything happens', async () => {
    render(<DeleteAccountSection />)
    expect(screen.getByText(/anonymous record of past bookings/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(mocks.deleteMyAccount).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Permanently delete my account' })).toBeDisabled()
  })

  it('deletes after the password is confirmed, then clears the session', async () => {
    render(<DeleteAccountSection />)
    await confirmWith('correct-password')
    await waitFor(() => { expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' }) })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'bea@local.test', password: 'correct-password' })
    expect(mocks.deleteMyAccount).toHaveBeenCalledTimes(1)
  })

  it('does not delete on a wrong password', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: 'bad' } })
    render(<DeleteAccountSection />)
    await confirmWith('wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('password is not correct')
    expect(mocks.deleteMyAccount).not.toHaveBeenCalled()
  })

  it('keeps the person signed in and explains when the server refuses', async () => {
    mocks.deleteMyAccount.mockRejectedValue(new Error('Finish, cancel or hand back your current bookings first.'))
    render(<DeleteAccountSection />)
    await confirmWith('correct-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('current bookings')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
