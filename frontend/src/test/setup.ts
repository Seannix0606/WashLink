import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { rejectNetworkAccess, throwNetworkAccess } from './networkGuard'

// Every test starts with fetch, WebSocket and XMLHttpRequest blocked, so no unit test can reach the network.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(rejectNetworkAccess))
  vi.stubGlobal('WebSocket', vi.fn(function () {
    throwNetworkAccess()
  }))
  vi.stubGlobal('XMLHttpRequest', vi.fn(function () {
    throwNetworkAccess()
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
