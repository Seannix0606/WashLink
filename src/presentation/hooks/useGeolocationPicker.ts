import { useCallback, useState } from 'react'
import { applicationToast } from '../design/ui'

interface GeolocationCoordinates {
  readonly latitude: number
  readonly longitude: number
}

interface UseGeolocationPickerResult {
  readonly isReadingGeolocation: boolean
  readonly requestCurrentGeolocation: () => void
}

interface UseGeolocationPickerOptions {
  readonly onGeolocationResolved: (coordinates: GeolocationCoordinates) => void
}

export function useGeolocationPicker({
  onGeolocationResolved,
}: UseGeolocationPickerOptions): UseGeolocationPickerResult {
  const [isReadingGeolocation, setIsReadingGeolocation] =
    useState<boolean>(false)

  const requestCurrentGeolocation = useCallback((): void => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      applicationToast.error('Your device does not support geolocation.')
      return
    }

    setIsReadingGeolocation(true)
    navigator.geolocation.getCurrentPosition(
      (geolocationPosition) => {
        setIsReadingGeolocation(false)
        onGeolocationResolved({
          latitude: geolocationPosition.coords.latitude,
          longitude: geolocationPosition.coords.longitude,
        })
      },
      (geolocationError) => {
        setIsReadingGeolocation(false)
        applicationToast.error(
          geolocationError.message.length > 0
            ? geolocationError.message
            : 'Could not access your location.',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [onGeolocationResolved])

  return { isReadingGeolocation, requestCurrentGeolocation }
}
