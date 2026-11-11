import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from '../../presentation/design/ui'
import { greeting } from './greeting'

describe('page greeting', () => {
  it('greets by Manila time of day with the first name', () => {
    expect(greeting('Bea Customer', new Date('2026-11-12T00:30:00Z'))).toBe('Good morning, Bea')
    expect(greeting('Bea Customer', new Date('2026-11-12T06:00:00Z'))).toBe('Good afternoon, Bea')
    expect(greeting('  Wes  Washer ', new Date('2026-11-12T12:00:00Z'))).toBe('Good evening, Wes')
    expect(greeting(undefined, new Date('2026-11-12T12:00:00Z'))).toBe('Good evening')
  })
})

function NavigationTabs(): ReactElement {
  const [tab, setTab] = useState<'one' | 'two'>('one')
  return (
    <Tabs variant="navigation" accessibleLabel="Sections" activeTabValue={tab} onTabChange={setTab}
      tabItems={[{ value: 'one', label: 'One', icon: <svg data-testid="icon-one" /> }, { value: 'two', label: 'Two' }]} />
  )
}

describe('navigation tabs', () => {
  it('show decorative icons and move with Up and Down as well as Left and Right', async () => {
    render(<NavigationTabs />)
    expect(screen.getByTestId('icon-one').parentElement).toHaveAttribute('aria-hidden', 'true')
    screen.getByRole('tab', { name: 'One' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')
  })
})
