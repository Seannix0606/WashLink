export interface ReverseGeocodeResult {
  readonly latitude: number
  readonly longitude: number
  readonly displayAddress: string
}

const reverseGeocodeEndpoint = 'https://nominatim.openstreetmap.org/reverse'

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult> {
  const requestUrl = `${reverseGeocodeEndpoint}?format=jsonv2&lat=${encodeURIComponent(
    latitude.toString(),
  )}&lon=${encodeURIComponent(longitude.toString())}&zoom=18&addressdetails=1`

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Reverse geocoding failed with status ${response.status}.`,
    )
  }

  const responseBody: unknown = await response.json()
  if (
    responseBody === null ||
    typeof responseBody !== 'object' ||
    typeof (responseBody as { display_name?: unknown }).display_name !==
      'string'
  ) {
    throw new Error('Reverse geocoding response was malformed.')
  }

  const displayAddress = (responseBody as { display_name: string }).display_name
  return {
    latitude,
    longitude,
    displayAddress,
  }
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
