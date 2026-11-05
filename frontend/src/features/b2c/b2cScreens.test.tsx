import type { ReactElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssignedBooking, CatalogService, CustomerBooking, DispatchRequest } from '@washlink/shared'
import { AssignedJobCard } from './worker/AssignedJobCard'
import { RequestCard } from './worker/RequestCard'
import { BookingCard } from './customer/BookingCard'
import { StepReview } from './customer/wizard/StepReview'
import { StepService } from './customer/wizard/StepService'
import { B2cOperationsPanel } from './admin/B2cOperationsPanel'
import type { WizardDraft } from './customer/wizard/BookingWizard'

const api = vi.hoisted(() => ({
  acceptRequest: vi.fn(), declineRequest: vi.fn(), advanceBooking: vi.fn(), cancelBooking: vi.fn(), reviewBooking: vi.fn(), quote: vi.fn(),
  createBooking: vi.fn(), adminSummary: vi.fn(), adminCatalog: vi.fn(), adminWorkers: vi.fn(), adminBookings: vi.fn(), adminUpdateRules: vi.fn(), adminReviewWorker: vi.fn(),
}))
vi.mock('./b2cApiClient', () => ({ getB2cApi: (): unknown => api, errorMessage: (error: Error): string => error.message }))
vi.mock('../../presentation/components/shared/LocationPickerMap', () => ({ LocationPickerMap: (): ReactElement => <div data-testid="map" /> }))

const request: DispatchRequest = {
  id: 'r1', bookingId: 'b1', reference: 'WL-1', serviceName: 'Full wash', vehicleCategory: 'sedan', addonNames: [], scheduledAt: '2026-11-06T01:00:00Z',
  isImmediate: false, durationMinutes: 90, workerEarningsCents: 45000, distanceKm: 2, expiresAt: new Date(Date.now() + 120000).toISOString(),
} as unknown as DispatchRequest

const service: CatalogService = {
  id: 's1', key: 'full', category: 'wash', name: 'Full wash', description: 'Everything', imageUrl: null, requirements: '', basePriceCents: 45000, durationMinutes: 90,
  priceIsDraft: false, supportedVehicles: ['sedan'],
} as unknown as CatalogService

const draft: WizardDraft = {
  isImmediate: false, scheduledAt: '2026-11-06T01:00:00Z', address: '12 Ayala Avenue, Makati City', latitude: 14.5, longitude: 121, landmark: '', instructions: '',
  serviceId: 's1', addonIds: [], vehicleCategory: 'sedan', vehicleMake: 'Toyota', vehicleModel: 'Vios',
}
const quote = { basePriceCents: 45000, vehicleAdjustmentCents: 0, addonsTotalCents: 0, customerTotalCents: 45000, durationMinutes: 90, priceIsDraft: false }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('worker request', () => {
  it('shows no address or customer, and accepts through the server', async () => {
    api.acceptRequest.mockResolvedValue(undefined)
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(<RequestCard request={request} onChanged={onChanged} />)
    expect(screen.getByText(/You earn ₱450/)).toBeInTheDocument()
    expect(screen.queryByText(/address|customer/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(api.acceptRequest).toHaveBeenCalledWith('r1')
    expect(onChanged).toHaveBeenCalled()
  })

  it('refreshes when another washer took the request first', async () => {
    api.acceptRequest.mockRejectedValue(new Error('taken'))
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(<RequestCard request={request} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => { expect(onChanged).toHaveBeenCalled() })
  })

  it('stops accepting once the request has expired', () => {
    render(<RequestCard request={{ ...request, expiresAt: new Date(Date.now() - 1000).toISOString() }} onChanged={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled()
  })
})

describe('worker job', () => {
  const job = {
    id: 'b1', reference: 'WL-1', status: 'accepted', serviceName: 'Full wash', scheduledAt: '2026-11-06T01:00:00Z', durationMinutes: 90, vehicleMake: 'Toyota', vehicleModel: 'Vios',
    vehicleCategory: 'sedan', addonNames: [], address: '12 Ayala Avenue', landmark: '', instructions: 'Gate 2', customerName: 'Bea', customerPhone: null, latitude: 14.5, longitude: 121,
    customerTotalCents: 50000, workerEarningsCents: 45000,
  } as unknown as AssignedBooking

  it('shows one next action and sends the status it was looking at', async () => {
    api.advanceBooking.mockResolvedValue(undefined)
    render(<AssignedJobCard job={job} onChanged={vi.fn().mockResolvedValue(undefined)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start travelling' }))
    expect(api.advanceBooking).toHaveBeenCalledWith('b1', 'accepted')
  })

  it('offers no status action on a finished job', () => {
    render(<AssignedJobCard job={{ ...job, status: 'completed' }} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Start travelling' })).toBeNull()
  })
})

describe('customer booking card', () => {
  const booking = {
    id: 'b1', reference: 'WL-1', status: 'accepted', serviceName: 'Full wash', scheduledAt: '2026-11-06T01:00:00Z', isImmediate: false, address: '12 Ayala Avenue', vehicleMake: 'Toyota', vehicleModel: 'Vios',
    customerTotalCents: 45000, workerName: 'Wes', workerPhone: null, hasReview: false,
  } as unknown as CustomerBooking

  it('asks before cancelling', async () => {
    api.cancelBooking.mockResolvedValue(undefined)
    render(<BookingCard booking={booking} onChanged={vi.fn().mockResolvedValue(undefined)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(api.cancelBooking).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(api.cancelBooking).toHaveBeenCalledWith('b1')
  })

  it('offers a rating only on an unrated completed booking', () => {
    const { rerender } = render(<BookingCard booking={booking} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Submit rating' })).toBeNull()
    rerender(<BookingCard booking={{ ...booking, status: 'completed' }} onChanged={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Submit rating' })).toBeDisabled()
    rerender(<BookingCard booking={{ ...booking, status: 'completed', hasReview: true }} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Submit rating' })).toBeNull()
  })
})

describe('booking review step', () => {
  const props = { draft, update: vi.fn(), services: [service], addons: [], customerId: 'c1', submissionKey: 'key-1', onEditStep: vi.fn(), onDone: vi.fn() }

  it('shows the server quote and sends no price when booking', async () => {
    api.quote.mockResolvedValue(quote)
    api.createBooking.mockResolvedValue({ id: 'b1', reference: 'WL-1', status: 'searching_for_worker' })
    render(<StepReview {...props} />)
    expect(await screen.findAllByText('₱450')).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    const sent = api.createBooking.mock.calls[0][0] as Record<string, unknown>
    expect(sent.submissionKey).toBe('key-1')
    expect(Object.keys(sent).some((name) => /price|total|cents/i.test(name))).toBe(false)
    await waitFor(() => { expect(props.onDone).toHaveBeenCalled() })
  })

  it('stays on the step and shows why when the server refuses', async () => {
    api.quote.mockResolvedValue(quote)
    api.createBooking.mockRejectedValue(new Error('That time was just taken.'))
    render(<StepReview {...props} onDone={vi.fn()} />)
    await screen.findAllByText('₱450')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That time was just taken.')
  })

  it('refuses a draft price', async () => {
    api.quote.mockResolvedValue({ ...quote, priceIsDraft: true })
    render(<StepReview {...props} />)
    expect(await screen.findByText(/has not set final prices/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
  })
})

describe('service step', () => {
  it('does not show a draft price as real', () => {
    const props = { draft, update: vi.fn(), addons: [], customerId: 'c1' }
    render(<StepService {...props} services={[{ ...service, priceIsDraft: true }]} />)
    expect(screen.getByText('Price not set')).toBeInTheDocument()
    expect(screen.queryByText(/₱450/)).toBeNull()
  })
})

describe('admin panel', () => {
  beforeEach(() => {
    api.adminSummary.mockResolvedValue({ draft_prices: 2, customer_total_cents: 100000, platform_fee_cents: 0 })
    api.adminCatalog.mockResolvedValue({ settings: { bookings_open: false, commission_bps: 0 }, services: [], addons: [] })
    api.adminWorkers.mockResolvedValue([{ profile_id: 'w1', full_name: 'Wes', verification_status: 'verified', has_service_area: true, service_radius_km: 10, completed_count: 0 }])
    api.adminBookings.mockResolvedValue([])
  })

  it('warns about draft prices and does not call cash received', async () => {
    render(<B2cOperationsPanel />)
    expect(await screen.findByText(/2 services still have draft prices/)).toBeInTheDocument()
    expect(screen.getByText('Expected cash')).toBeInTheDocument()
    expect(screen.queryByText(/paid/i)).toBeNull()
  })

  it('asks before suspending a washer', async () => {
    api.adminReviewWorker.mockResolvedValue(undefined)
    render(<B2cOperationsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(api.adminReviewWorker).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm suspend' }))
    expect(api.adminReviewWorker).toHaveBeenCalledWith('w1', 'suspended', '')
  })
})
