export const networkDisabledMessage = 'network disabled in unit tests'

export function rejectNetworkAccess(): Promise<Response> {
  return Promise.reject(new Error(networkDisabledMessage))
}

// Used as the constructor for stubbed WebSocket and XMLHttpRequest, so realtime sockets and XHR clients fail loudly.
export function throwNetworkAccess(): never {
  throw new Error(networkDisabledMessage)
}
