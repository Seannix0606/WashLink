import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  serviceBookingStatusGroup,
  serviceBookingStatusGroups,
  serviceBookingStatusLabel,
  serviceBookingStatuses,
} from '@washlink/shared'
import { Section } from './Section'
import { StatusPill } from './StatusPill'
import { Tabs } from './Tabs'

const css = readFileSync('src/index.css', 'utf8')
const lightBlock = css.slice(css.indexOf('@theme'), css.indexOf('\n}', css.indexOf('@theme')))
const darkBlock = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('\n}', css.indexOf(":root[data-theme='dark']")))

function token(block: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)
  if (match?.[1] === undefined) {
    throw new Error(`${name} missing`)
  }
  return match[1]
}

// WCAG relative luminance and contrast ratio.
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('status groups', () => {
  it('puts every status in a group and names each group the way the owner chose', () => {
    for (const status of serviceBookingStatuses) {
      expect(serviceBookingStatusGroups).toContain(serviceBookingStatusGroup[status])
    }
    expect(serviceBookingStatusGroup.searching_for_worker).toBe('waiting')
    expect(serviceBookingStatusGroup.no_worker_available).toBe('action')
    expect(serviceBookingStatusGroup.accepted).toBe('confirmed')
    expect(serviceBookingStatusGroup.arrived).toBe('moving')
    expect(serviceBookingStatusGroup.in_progress).toBe('washing')
    expect(serviceBookingStatusGroup.completed).toBe('done')
    expect(serviceBookingStatusGroup.expired).toBe('stopped')
  })

  it.each([['light', lightBlock], ['dark', darkBlock]] as const)('meets contrast rules in the %s theme', (_theme, block) => {
    const card = token(block, '--color-card')
    for (const group of serviceBookingStatusGroups) {
      const background = token(block, `--status-${group}-bg`)
      const text = token(block, `--status-${group}-fg`)
      const line = token(block, `--status-${group}-line`)
      expect(contrast(text, background), `${group} text on pill`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(line, card), `${group} edge on card`).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives each group a different color', () => {
    for (const block of [lightBlock, darkBlock]) {
      const lines = serviceBookingStatusGroups.map((group) => token(block, `--status-${group}-line`).toLowerCase())
      expect(new Set(lines).size).toBe(lines.length)
    }
  })
})

describe('StatusPill', () => {
  it('always shows the status in words, with its group for styling', () => {
    render(<StatusPill status="worker_on_the_way" />)
    const pill = screen.getByText(serviceBookingStatusLabel.worker_on_the_way)
    expect(pill).toHaveAttribute('data-status-group', 'moving')
    expect(pill).toHaveStyle({ color: 'var(--status-moving-fg)' })
  })
})

describe('Section', () => {
  it('is a labelled region with its title as a heading and an optional count', () => {
    render(<Section title="Upcoming" count={3}><p>Body</p></Section>)
    expect(screen.getByRole('region', { name: /Upcoming/ })).toContainElement(screen.getByText('Body'))
    expect(screen.getByRole('heading', { level: 2, name: /Upcoming/ })).toHaveTextContent('3')
  })
})

describe('Tabs', () => {
  const tabItems = [{ value: 'a', label: 'Home' }, { value: 'b', label: 'Bookings' }, { value: 'c', label: 'Account' }] as const

  it('keeps one row reachable by Tab and moves with the arrow, Home and End keys', async () => {
    const onTabChange = vi.fn()
    render(<Tabs accessibleLabel="Sections" tabItems={tabItems} activeTabValue="a" onTabChange={onTabChange} />)
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Bookings' })).toHaveAttribute('tabindex', '-1')
    screen.getByRole('tab', { name: 'Home' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onTabChange).toHaveBeenLastCalledWith('b')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onTabChange).toHaveBeenLastCalledWith('c')
    await userEvent.keyboard('{End}')
    expect(onTabChange).toHaveBeenLastCalledWith('c')
    await userEvent.keyboard('{Home}')
    expect(onTabChange).toHaveBeenLastCalledWith('a')
  })

  it('stays on one row instead of wrapping', () => {
    render(<Tabs accessibleLabel="Sections" tabItems={tabItems} activeTabValue="a" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tablist').className).toContain('overflow-x-auto')
    expect(screen.getByRole('tablist').className).not.toContain('flex-wrap')
  })
})
