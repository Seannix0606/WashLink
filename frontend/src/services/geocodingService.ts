import type { ReverseGeocodeApiResult } from '../api/geocoding.api'
import { reverseGeocodeApi } from '../api/geocoding.api'

export interface ReverseGeocodeResult {
  readonly latitude: number
  readonly longitude: number
  readonly displayAddress: string
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult> {
  const result: ReverseGeocodeApiResult = await reverseGeocodeApi(
    latitude,
    longitude,
  )
  return result
}

export function computeDistanceInKilometers(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
): number {
  const earthRadiusKilometers = 6371
  const latitudeDeltaRadians = degreesToRadians(
    secondLatitude - firstLatitude,
  )
  const longitudeDeltaRadians = degreesToRadians(
    secondLongitude - firstLongitude,
  )
  const firstLatitudeRadians = degreesToRadians(firstLatitude)
  const secondLatitudeRadians = degreesToRadians(secondLatitude)

  const haversineInner =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDeltaRadians / 2) ** 2
  const haversineCentralAngle =
    2 * Math.atan2(Math.sqrt(haversineInner), Math.sqrt(1 - haversineInner))

  return earthRadiusKilometers * haversineCentralAngle
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
