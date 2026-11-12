import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

function stubScreen(isWide: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: isWide, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('AppShell', () => {
  it('renders the summary panel only on wide screens', () => {
    stubScreen(false)
    const { unmount } = render(<AppShell title="Hello" navigation={<span>nav</span>} summary={<p>Glance</p>}><p>Body</p></AppShell>)
    expect(screen.queryByText('Glance')).toBeNull()
    unmount()
    stubScreen(true)
    render(<AppShell title="Hello" navigation={<span>nav</span>} summary={<p>Glance</p>}><p>Body</p></AppShell>)
    expect(screen.getByRole('complementary', { name: 'Summary' })).toHaveTextContent('Glance')
  })

  it('renders the navigation once, with the brand for the desktop rail and the title as the only h1', () => {
    render(<AppShell title="Hello" navigation={<span>nav</span>}><p>Body</p></AppShell>)
    expect(screen.getAllByText('nav')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
