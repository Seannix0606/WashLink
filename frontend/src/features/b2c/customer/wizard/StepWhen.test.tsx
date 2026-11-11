import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatManilaDayKey, upcomingManilaDates, type CatalogService } from '@washlink/shared'
import { BOOKING_CALENDAR_DAYS, StepWhen } from './StepWhen'
import type { WizardDraft } from './BookingWizard'
import { hourLabel } from '../../worker/hourLabel'

const api = vi.hoisted(() => ({ availableSlots: vi.fn() }))
vi.mock('../../b2cApiClient', () => ({ getB2cApi: (): unknown => api, errorMessage: (error: Error): string => error.message }))

const service = { id: 's1', name: 'Full Wash', supportedVehicles: ['sedan'] } as unknown as CatalogService
const draft: WizardDraft = {
  isImmediate: false, scheduledAt: null, address: '', latitude: null, longitude: null, landmark: '', instructions: '',
  serviceId: null, addonIds: [], vehicleCategory: 'sedan', vehicleMake: '', vehicleModel: '',
} as unknown as WizardDraft

// Friday 8 PM to midnight, Saturday and Sunday 10 AM to 10 PM (only the first slot of each is listed here).
const weekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay()
function slotsFor(date: string): readonly { startsAt: string; isAvailable: boolean }[] {
  const day = weekday(date)
  if (day === 5) return [{ startsAt: `${date}T12:00:00.000Z`, isAvailable: true }]
  if (day === 6 || day === 0) return [{ startsAt: `${date}T02:00:00.000Z`, isAvailable: true }, { startsAt: `${date}T02:30:00.000Z`, isAvailable: false }]
  return []
}

beforeEach(() => {
  vi.clearAllMocks()
  api.availableSlots.mockImplementation(({ date }: { date: string }) => Promise.resolve(slotsFor(date)))
})

describe('booking calendar', () => {
  it('asks for every day of the next four weeks and marks only days with free times as open', async () => {
    render(<StepWhen draft={draft} update={vi.fn()} services={[service]} addons={[]} customerId="c1" />)
    const dates = upcomingManilaDates(BOOKING_CALENDAR_DAYS)
    const openDays = dates.filter((date) => slotsFor(date).some((slot) => slot.isAvailable))
    const firstOpen = openDays[0]
    expect(api.availableSlots).toHaveBeenCalledTimes(BOOKING_CALENDAR_DAYS)
    expect(await screen.findByRole('button', { name: `${formatManilaDayKey(firstOpen)}, 1 open time` })).toHaveAttribute('aria-pressed', 'true')
    // A closed weekday in the same month as the first open day is shown but cannot be picked.
    const closed = dates.find((date) => weekday(date) === 3 && date.slice(0, 7) === firstOpen.slice(0, 7))
    if (closed !== undefined) expect(screen.getByRole('button', { name: `${formatManilaDayKey(closed)}, closed` })).toBeDisabled()
    expect(screen.getByText(`Choose a time on ${formatManilaDayKey(firstOpen)}`)).toBeInTheDocument()
  })

  it('lists the times of the chosen day and saves the picked time', async () => {
    const update = vi.fn()
    render(<StepWhen draft={draft} update={update} services={[service]} addons={[]} customerId="c1" />)
    const dates = upcomingManilaDates(BOOKING_CALENDAR_DAYS)
    const firstOpen = dates.find((date) => slotsFor(date).length > 0) ?? ''
    // A Saturday shown in the same month as the first open day (the calendar opens on that month).
    const saturday = dates.find((date) => weekday(date) === 6 && date.slice(0, 7) === firstOpen.slice(0, 7)) ?? ''
    const dayButton = await screen.findByRole('button', { name: `${formatManilaDayKey(saturday)}, 1 open time` })
    await userEvent.click(dayButton)
    const times = screen.getByText(`Choose a time on ${formatManilaDayKey(saturday)}`).closest('fieldset')
    expect(times).not.toBeNull()
    const free = within(times as HTMLElement).getByRole('button', { name: '10:00 AM' })
    expect(within(times as HTMLElement).getByRole('button', { name: '10:30 AM, unavailable' })).toBeDisabled()
    await userEvent.click(free)
    expect(update).toHaveBeenCalledWith({ isImmediate: false, scheduledAt: `${saturday}T02:00:00.000Z` })
  })

  it('says so when no day in the next four weeks is open', async () => {
    api.availableSlots.mockResolvedValue([])
    render(<StepWhen draft={draft} update={vi.fn()} services={[service]} addons={[]} customerId="c1" />)
    expect(await screen.findByText('No open days in the next four weeks')).toBeInTheDocument()
  })
})

describe('working hours labels', () => {
  it('uses 12-hour times, with the end of the day as 12:00 AM', () => {
    expect(hourLabel(0)).toBe('12:00 AM')
    expect(hourLabel(10)).toBe('10:00 AM')
    expect(hourLabel(12)).toBe('12:00 PM')
    expect(hourLabel(20)).toBe('8:00 PM')
    expect(hourLabel(24)).toBe('12:00 AM')
  })
})
