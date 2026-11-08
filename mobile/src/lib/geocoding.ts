// Same provider as the web app, with the same limits: docs/b2c/OPERATIONS.md.
const BASE = 'https://nominatim.openstreetmap.org'

interface Place {
  readonly displayAddress: string
  readonly latitude: number
  readonly longitude: number
}

function toPlace(value: unknown): Place | null {
  const row = value as { display_name?: unknown; lat?: unknown; lon?: unknown } | null
  if (typeof row?.display_name !== 'string' || typeof row.lat !== 'string' || typeof row.lon !== 'string') {
    return null
  }
  return { displayAddress: row.display_name, latitude: Number(row.lat), longitude: Number(row.lon) }
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'WashLink-Mobile' } })
  if (!response.ok) {
    throw new Error('lookup failed')
  }
  return response.json()
}

export async function lookUpAddress(latitude: number, longitude: number): Promise<string | null> {
  return toPlace(await getJson(`/reverse?format=jsonv2&lat=${String(latitude)}&lon=${String(longitude)}&zoom=18`))?.displayAddress ?? null
}

export async function searchAddress(query: string): Promise<Place | null> {
  const results = await getJson(`/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`)
  return Array.isArray(results) ? toPlace(results[0]) : null
}
