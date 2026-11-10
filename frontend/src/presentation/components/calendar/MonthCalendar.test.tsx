import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MonthCalendar, type CalendarEntry } from './MonthCalendar'
import { ViewToggle, useStoredBookingsView } from './ViewToggle'

const entries: readonly CalendarEntry[] = [
  { id: 'e1', dayKey: '2026-11-17', timeLabel: '9:00 AM', title: 'Basic Wash', status: 'no_worker_available' },
  { id: 'e2', dayKey: '2026-11-17', timeLabel: '11:00 AM', title: 'Full Wash', status: 'accepted' },
  { id: 'e3', dayKey: '2026-11-17', timeLabel: '2:00 PM', title: 'Premium Wash', status: 'in_progress' },
  { id: 'r1', dayKey: '2026-11-18', timeLabel: '9:00 AM', title: 'Full Wash', status: 'searching_for_worker', isRequest: true },
]

function Harness(): ReactElement {
  const [selected, setSelected] = useState('2026-11-10')
  return (
    <MonthCalendar label="Your bookings by day" todayKey="2026-11-10" selectedDayKey={selected} onSelectDay={setSelected} entries={entries} hasRequests>
      <p>Selected {selected}</p>
    </MonthCalendar>
  )
}

describe('MonthCalendar', () => {
  it('shows the month Monday first, with each day labelled by its date and booking count', () => {
    render(<Harness />)
    const grid = screen.getByRole('grid', { name: /Your bookings by day, November 2026/ })
    expect(within(grid).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(screen.getByRole('button', { name: 'Tuesday, November 17, 3 bookings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tuesday, November 10, today, no bookings' })).toBeInTheDocument()
  })

  it('shows one pill and "+2 more" on a busy day, and dashes requests', () => {
    render(<Harness />)
    const day = screen.getByRole('button', { name: /November 17/ })
    expect(within(day).getByTitle(/^9:00 AM · Basic Wash/)).toHaveTextContent('9:00 AMBasic Wash')
    expect(within(day).queryByTitle(/^11:00 AM · Full Wash/)).toBeNull()
    expect(within(day).queryByTitle(/^2:00 PM · Premium Wash/)).toBeNull()
    expect(within(day).getByText('+2 more')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /November 18/ })).getByTitle(/Request/).className).toContain('border-dashed')
    expect(screen.getByRole('list', { name: 'Status colors' })).toHaveTextContent('Request')
  })

  it('selects a day by click, and shows that day under the grid', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /November 17/ }))
    expect(screen.getByText('Selected 2026-11-17')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bookings on Tuesday, November 17' })).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { selected: true })).toContainElement(screen.getByRole('button', { name: /November 17/ }))
  })

  it('moves by day, week and month with the keyboard, and selects with Enter', async () => {
    render(<Harness />)
    const today = screen.getByRole('button', { name: /November 10/ })
    expect(today).toHaveAttribute('tabindex', '0')
    today.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: /November 11/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: /November 18/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('Selected 2026-11-18')).toBeInTheDocument()
    await userEvent.keyboard('{PageDown}')
    expect(screen.getByRole('grid', { name: /December 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wednesday, December 16/ })).toHaveFocus()
  })

  it('changes month with the arrows and comes back with Today', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
  })
})

function ToggleHarness(): ReactElement {
  const [view, setView] = useStoredBookingsView('test.view')
  return <><ViewToggle view={view} onChange={setView} /><p>Showing {view}</p></>
}

describe('ViewToggle', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('starts on List, remembers Calendar on this device, and flips with the arrow keys', async () => {
    const { unmount } = render(<ToggleHarness />)
    expect(screen.getByText('Showing list')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Calendar' }))
    expect(window.localStorage.getItem('test.view')).toBe('calendar')
    unmount()
    render(<ToggleHarness />)
    expect(screen.getByRole('radio', { name: 'Calendar' })).toHaveAttribute('aria-checked', 'true')
    screen.getByRole('radio', { name: 'Calendar' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByText('Showing list')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'List' })).toHaveFocus()
  })
})
