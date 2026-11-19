import type { ReactElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyBookingDraft,
  findHomeAddress,
  homeLocationFromSignUpData,
  homeLocationProblem,
  homeLocationToSignUpData,
  type SavedAddress,
} from '@washlink/shared'
import { StepWhere } from './wizard/StepWhere'
import type { WizardDraft } from './wizard/BookingWizard'

const api = vi.hoisted(() => ({ listAddresses: vi.fn(), saveAddress: vi.fn() }))
vi.mock('../b2cApiClient', () => ({ getB2cApi: (): unknown => api, errorMessage: (error: Error): string => error.message }))
vi.mock('./useHomeAddress', () => ({ saveHomeFromSignUp: (): Promise<void> => Promise.resolve() }))
vi.mock('../../../presentation/components/shared/LocationPickerMap', () => ({ LocationPickerMap: (): ReactElement => <div data-testid="map" /> }))

const home: SavedAddress = {
  id: 'a-home', label: 'Home', address: '12 Sample Street, Makati City', latitude: 14.5995, longitude: 120.9842,
  landmark: 'Blue gate', instructions: 'Park on the left',
}
const office: SavedAddress = {
  id: 'a-office', label: 'Office', address: '88 Work Avenue, Taguig City', latitude: 14.5547, longitude: 121.0244, landmark: '', instructions: '',
}
const props = { services: [], addons: [], customerId: 'c1' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('home location rules', () => {
  it('needs a pin and a full address', () => {
    expect(homeLocationProblem({ address: '12 Sample Street', latitude: null, longitude: null })).toBe('Pin where you usually want your car washed.')
    expect(homeLocationProblem({ address: 'short', latitude: 14.6, longitude: 121 })).toMatch(/full address/)
    expect(homeLocationProblem({ address: '12 Sample Street', latitude: 14.6, longitude: 121 })).toBeNull()
  })

  it('reads back what was sent at sign-up, and ignores missing or broken data', () => {
    const sent = homeLocationToSignUpData({ address: ' 12 Sample Street ', latitude: 14.6, longitude: 121 })
    expect(homeLocationFromSignUpData({ role: 'customer', ...sent })).toEqual({ address: '12 Sample Street', latitude: 14.6, longitude: 121 })
    expect(homeLocationFromSignUpData({ role: 'customer' })).toBeNull()
    expect(homeLocationFromSignUpData({ home_address: '12 Sample Street', home_latitude: 200, home_longitude: 121 })).toBeNull()
    expect(homeLocationFromSignUpData({ home_address: '12 Sample Street', home_latitude: '14.6', home_longitude: 121 })).toBeNull()
    expect(homeLocationFromSignUpData(null)).toBeNull()
  })

  it('finds the address labelled Home', () => {
    expect(findHomeAddress([office, home])).toBe(home)
    expect(findHomeAddress([office])).toBeNull()
  })
})

describe('where step', () => {
  it('starts a new booking at Home, with its landmark and instructions', async () => {
    api.listAddresses.mockResolvedValue([office, home])
    const update = vi.fn()
    render(<StepWhere {...props} draft={emptyBookingDraft} update={update} />)

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({ address: home.address, latitude: home.latitude, longitude: home.longitude, landmark: 'Blue gate', instructions: 'Park on the left' })
    })
    expect(screen.getByRole('radio', { name: /Home/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('switches to another place: clears the pin, shows the map and the other saved places', async () => {
    api.listAddresses.mockResolvedValue([office, home])
    const update = vi.fn()
    const atHome = { ...emptyBookingDraft, address: home.address, latitude: home.latitude, longitude: home.longitude } as WizardDraft
    render(<StepWhere {...props} draft={atHome} update={update} />)

    await userEvent.click(await screen.findByRole('radio', { name: /Another place/ }))

    expect(update).toHaveBeenCalledWith({ address: '', latitude: null, longitude: null, landmark: '', instructions: '' })
    expect(screen.getByRole('radio', { name: /Another place/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Office' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull()
  })

  it('keeps a booking coming back from a later step at its other place', async () => {
    api.listAddresses.mockResolvedValue([home])
    const update = vi.fn()
    const elsewhere = { ...emptyBookingDraft, address: office.address, latitude: office.latitude, longitude: office.longitude } as WizardDraft
    render(<StepWhere {...props} draft={elsewhere} update={update} />)

    expect(await screen.findByRole('radio', { name: /Another place/ })).toHaveAttribute('aria-checked', 'true')
    expect(update).not.toHaveBeenCalled()
  })

  it('shows only the map when there is no Home address', async () => {
    api.listAddresses.mockResolvedValue([])
    render(<StepWhere {...props} draft={emptyBookingDraft} update={vi.fn()} />)

    expect(await screen.findByTestId('map')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
