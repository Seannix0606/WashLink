import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicLandingPage } from './PublicLandingPage'

const listServices = vi.hoisted(() => vi.fn())
vi.mock('../b2cApiClient', () => ({ getB2cApi: (): unknown => ({ listServices }), errorMessage: (error: Error): string => error.message }))

const service = { id: 's1', name: 'Full wash', description: 'Everything', basePriceCents: 45000, durationMinutes: 90, priceIsDraft: false, supportedVehicles: ['sedan'] }

beforeEach(() => {
  listServices.mockReset()
})

describe('public landing page', () => {
  it('has one main heading and sends booking and sign-in to the account forms', async () => {
    listServices.mockResolvedValue([service])
    const onSignIn = vi.fn()
    render(<PublicLandingPage onSignIn={onSignIn} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await userEvent.click(screen.getAllByRole('button', { name: 'Book a car wash' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledTimes(2)
  })

  it('shows live final prices', async () => {
    listServices.mockResolvedValue([service])
    render(<PublicLandingPage onSignIn={vi.fn()} />)
    expect(await screen.findByText(/₱450/)).toBeInTheDocument()
  })

  it('never advertises a draft price', async () => {
    listServices.mockResolvedValue([{ ...service, priceIsDraft: true }])
    render(<PublicLandingPage onSignIn={vi.fn()} />)
    const card = (await screen.findByText('Full wash')).closest<HTMLElement>('li') ?? document.body
    expect(within(card).getByText(/Price coming soon/)).toBeInTheDocument()
    expect(screen.queryByText(/₱450/)).toBeNull()
  })

  it('claims no app store availability', () => {
    listServices.mockResolvedValue([])
    render(<PublicLandingPage onSignIn={vi.fn()} />)
    expect(screen.queryByText(/App Store|Google Play/i)).toBeNull()
  })
})
