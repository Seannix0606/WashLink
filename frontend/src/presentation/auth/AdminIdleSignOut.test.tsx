import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_IDLE_LIMIT_MS,
  ADMIN_IDLE_WARNING_MS,
  ADMIN_LAST_ACTIVE_KEY,
  msUntilIdleSignOut,
} from '../../application/session/adminIdleSession'
import { AdminIdleSignOut } from './AdminIdleSignOut'

const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('./AuthenticatedUserContext', () => ({ useAuthenticatedUser: (): unknown => auth }))
const toastInfo = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { info: toastInfo } }))

const NOW = new Date('2026-11-11T10:00:00Z').getTime()
const lastActive = (): number => Number(window.localStorage.getItem(ADMIN_LAST_ACTIVE_KEY))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  window.localStorage.clear()
  auth.signOut.mockReset().mockResolvedValue(undefined)
  toastInfo.mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe('admin idle rules', () => {
  it('signs out 30 minutes after the last use and warns 1 minute before', () => {
    expect(ADMIN_IDLE_LIMIT_MS).toBe(30 * 60 * 1000)
    expect(ADMIN_IDLE_WARNING_MS).toBe(60 * 1000)
    expect(msUntilIdleSignOut(NOW - 29 * 60 * 1000, NOW)).toBe(60 * 1000)
    expect(msUntilIdleSignOut(NOW - 31 * 60 * 1000, NOW)).toBeLessThan(0)
  })
})

describe('AdminIdleSignOut', () => {
  it('signs out straight away when the site is reopened after 30 minutes without use, and says why', async () => {
    window.localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(NOW - 31 * 60 * 1000))
    render(<AdminIdleSignOut />)
    act(() => { vi.advanceTimersByTime(0) })
    await act(async () => { await Promise.resolve() })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('signed out after 30 minutes'), expect.anything())
  })

  it('starts the clock for a session that has no record yet', () => {
    render(<AdminIdleSignOut />)
    act(() => { vi.advanceTimersByTime(0) })
    expect(lastActive()).toBe(NOW)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('warns a minute before, keeps the admin signed in on "Stay signed in", and signs out if ignored', async () => {
    window.localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(NOW))
    render(<AdminIdleSignOut />)
    expect(screen.queryByText('Are you still there?')).toBeNull()

    act(() => { vi.advanceTimersByTime(29 * 60 * 1000 + 1000) })
    expect(screen.getByText('Are you still there?')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('59 seconds')
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
    expect(lastActive()).toBe(Date.now())
    // Past the old deadline: still signed in, because the clock restarted.
    act(() => { vi.advanceTimersByTime(2 * 60 * 1000) })
    expect(auth.signOut).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(28 * 60 * 1000) })
    await act(async () => { await Promise.resolve() })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('counts clicks and key presses as use', () => {
    window.localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(NOW))
    render(<AdminIdleSignOut />)
    act(() => { vi.advanceTimersByTime(20 * 60 * 1000) })
    fireEvent.keyDown(window, { key: 'a' })
    expect(lastActive()).toBe(NOW + 20 * 60 * 1000)
    act(() => { vi.advanceTimersByTime(20 * 60 * 1000) })
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})
