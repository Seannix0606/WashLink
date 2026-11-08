import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingWasherAndApp } from '../b2c/landing/LandingWasherAndApp'

describe('installing WashLink from the browser', () => {
  it('shows an install button once the browser offers to install, and opens the browser dialog', async () => {
    render(<LandingWasherAndApp onSignUp={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Install the app' })).toBeNull()

    const prompt = vi.fn().mockResolvedValue(undefined)
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => { window.dispatchEvent(offer) })
    expect(offer.defaultPrevented).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Install the app' }))
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Install the app' })).toBeNull()
  })

  it('stops offering to install once the app is installed', () => {
    render(<LandingWasherAndApp onSignUp={vi.fn()} />)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(screen.getByText(/You are using the WashLink app/)).toBeInTheDocument()
  })
})
