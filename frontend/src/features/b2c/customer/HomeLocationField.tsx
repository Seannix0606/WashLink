import type { KeyboardEvent, ReactElement } from 'react'
import { useState } from 'react'
import { LocateFixed, Search } from 'lucide-react'
import type { HomeLocationDraft } from '@washlink/shared'
import { reverseGeocodeApi, searchAddressApi } from '../../../api/geocoding.api'
import { LocationPickerMap, type PickedLocationValue } from '../../../presentation/components/shared/LocationPickerMap'
import { Button, Input } from '../../../presentation/design/ui'

interface HomeLocationFieldProps {
  readonly value: HomeLocationDraft
  readonly onChange: (next: HomeLocationDraft) => void
  /** Where the map opens before a pin is placed. */
  readonly fallbackCenter?: PickedLocationValue
  readonly mapHeightClassName?: string
  readonly addressLabel?: string
}

/**
 * Search, "use my location" or a tap on the map places the pin; the address is looked up from the pin and can be corrected.
 * Lives inside other forms, so nothing here submits: Enter in the search box searches.
 */
export function HomeLocationField({
  value, onChange, fallbackCenter, mapHeightClassName = 'h-56', addressLabel = 'Full address',
}: HomeLocationFieldProps): ReactElement {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const pin = async (latitude: number, longitude: number): Promise<void> => {
    onChange({ ...value, latitude, longitude })
    try {
      const result = await reverseGeocodeApi(latitude, longitude)
      onChange({ address: result.displayAddress, latitude, longitude })
      setNotice(null)
    } catch {
      setNotice('The address could not be looked up. Type the full address below; your pin is kept.')
    }
  }

  const search = async (): Promise<void> => {
    if (query.trim().length < 3) {
      setNotice('Type at least 3 characters to search.')
      return
    }
    setIsSearching(true)
    try {
      const result = await searchAddressApi(query.trim())
      if (result === null) {
        setNotice('No match found. Move the pin on the map or type the address yourself.')
      } else {
        onChange({ address: result.displayAddress, latitude: result.latitude, longitude: result.longitude })
        setNotice('Check the pin and move it if needed.')
      }
    } catch {
      setNotice('Address search is unavailable. Move the pin on the map and type the address yourself.')
    } finally {
      setIsSearching(false)
    }
  }

  const useMyLocation = (): void => {
    if (!('geolocation' in navigator)) {
      setNotice('This browser cannot share a location. Search or move the pin instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void pin(position.coords.latitude, position.coords.longitude)
        setNotice('Your current location is only a starting point. Check the pin.')
      },
      () => { setNotice('Location permission was not given. Search or move the pin instead.') },
    )
  }

  const searchOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void search()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input label="Search for an address" value={query} onKeyDown={searchOnEnter} onChange={(event): void => { setQuery(event.target.value) }} />
        </div>
        <Button variant="secondary" isLoading={isSearching} leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />} onClick={(): void => void search()}>Search</Button>
      </div>
      <Button size="sm" variant="ghost" leadingIcon={<LocateFixed className="h-4 w-4" aria-hidden="true" />} onClick={useMyLocation}>Use my location</Button>
      <LocationPickerMap
        pickedLocation={value.latitude !== null && value.longitude !== null ? { latitude: value.latitude, longitude: value.longitude } : null}
        onPickedLocationChanged={(next): void => void pin(next.latitude, next.longitude)}
        fallbackCenter={fallbackCenter}
        heightClassName={mapHeightClassName}
      />
      <p className="text-xs text-[var(--color-ink-500)]">Tap the map or drag the pin to the exact spot.</p>
      {notice !== null ? <p role="status" className="text-sm text-[var(--color-ink-700)]">{notice}</p> : null}
      <Input label={addressLabel} isRequiredByForm value={value.address} maxLength={300} onChange={(event): void => { onChange({ ...value, address: event.target.value }) }} />
    </div>
  )
}
