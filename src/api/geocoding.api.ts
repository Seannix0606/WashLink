import { z } from 'zod'
import { fetchJson } from './httpClient'

const ReverseGeocodingQuerySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

const ReverseGeocodeResponseSchema = z.object({
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
})

export interface ReverseGeocodeApiResult {
  readonly displayAddress: string
  readonly latitude: number
  readonly longitude: number
}

export async function reverseGeocodeApi(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeApiResult> {
  const validatedQuery = ReverseGeocodingQuerySchema.parse({
    latitude,
    longitude,
  })

  const requestUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
    String(validatedQuery.latitude),
  )}&lon=${encodeURIComponent(String(validatedQuery.longitude))}&zoom=18&addressdetails=1`

  const response = await fetchJson<unknown>(requestUrl)
  const parsedResponse = ReverseGeocodeResponseSchema.parse(response)

  return {
    displayAddress: parsedResponse.display_name,
    latitude: Number(parsedResponse.lat),
    longitude: Number(parsedResponse.lon),
  }
}
