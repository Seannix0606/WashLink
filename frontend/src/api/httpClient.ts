export interface ApiError extends Error {
  readonly status: number
  readonly details?: unknown
}

function createApiError(
  status: number,
  message: string,
  details?: unknown,
): ApiError {
  const error = new Error(message) as ApiError & {
    status: number
    details?: unknown
  }

  error.status = status
  error.details = details
  return error
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const responseText = await response.text()
  let responseBody: unknown = responseText

  if (responseText.length > 0) {
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = responseText
    }
  }

  if (!response.ok) {
    const message =
      typeof responseBody === 'object' && responseBody !== null &&
      'message' in responseBody &&
      typeof (responseBody as { message?: unknown }).message === 'string'
        ? (responseBody as { message: string }).message
        : response.statusText || `Request failed with status ${response.status}`

    throw createApiError(response.status, message, responseBody)
  }

  return responseBody as T
}
