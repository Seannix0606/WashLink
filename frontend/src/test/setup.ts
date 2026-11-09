import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { rejectNetworkAccess, throwNetworkAccess } from './networkGuard'

// jsdom doesn't lay out pages, so it has no scrollIntoView; components call it to keep a selected tab or day in view.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = (): void => undefined
}

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
