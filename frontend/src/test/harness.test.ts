import { describe, expect, it } from 'vitest'
import { networkDisabledMessage } from './networkGuard'

describe('unit test harness isolation', () => {
  it('harness_unit_tests_cannot_reach_network', async () => {
    await expect(fetch('https://example.com/')).rejects.toThrow(
      networkDisabledMessage,
    )
    await expect(fetch('http://127.0.0.1:9/rest/v1/bookings')).rejects.toThrow(
      networkDisabledMessage,
    )
  })

  it('harness_unit_tests_cannot_open_websocket', () => {
    expect(() => new WebSocket('ws://127.0.0.1:9/realtime/v1/websocket')).toThrow(
      networkDisabledMessage,
    )
  })

  it('harness_unit_tests_cannot_use_xmlhttprequest', () => {
    expect(() => new XMLHttpRequest()).toThrow(networkDisabledMessage)
  })

  it('harness_env_uses_placeholder_supabase_url', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:9')
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBe(
      'vitest-placeholder-not-a-key',
    )
  })
})
