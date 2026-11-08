import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LocateFixed, Search } from 'lucide-react'
import { type SavedAddress } from '@washlink/shared'
import { reverseGeocodeApi, searchAddressApi } from '../../../../api/geocoding.api'
import { LocationPickerMap } from '../../../../presentation/components/shared/LocationPickerMap'
import { Button, Input } from '../../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import type { StepProps } from './BookingWizard'

/** GPS is only a starting point: the customer confirms the pin and address, which stay in sync. */
export function StepWhere({ draft, update, customerId }: StepProps): ReactElement {
  const [saved, setSaved] = useState<readonly SavedAddress[]>([])
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [shouldSave, setShouldSave] = useState(false)

  useEffect(() => {
    getB2cApi().listAddresses().then(setSaved).catch(() => { setSaved([]) })
  }, [])

  const pin = async (latitude: number, longitude: number): Promise<void> => {
    update({ latitude, longitude })
    try {
      const result = await reverseGeocodeApi(latitude, longitude)
      update({ address: result.displayAddress })
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
        update({ latitude: result.latitude, longitude: result.longitude, address: result.displayAddress })
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
        setNotice('Your current location is only a starting point. Confirm it is where the car will be.')
      },
      () => { setNotice('Location permission was not given. Search or move the pin instead.') },
    )
  }

  const saveAddress = async (): Promise<void> => {
    if (draft.latitude === null || draft.longitude === null) {
      setNotice('Pin the location first.')
      return
    }
    try {
      await getB2cApi().saveAddress(customerId, {
        label: 'Saved place', address: draft.address.trim(), latitude: draft.latitude, longitude: draft.longitude,
        landmark: draft.landmark.trim(), instructions: draft.instructions.trim(),
      })
      setShouldSave(true)
      toast.success('Address saved')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  return (
    <section aria-labelledby="where-title" className="space-y-4">
      <h2 id="where-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Where is the vehicle?</h2>
      {saved.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {saved.map((address) => (
            <Button key={address.id} size="sm" variant="secondary"
              onClick={(): void => { update({ address: address.address, latitude: address.latitude, longitude: address.longitude, landmark: address.landmark, instructions: address.instructions }) }}>
              {address.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input label="Search for an address" value={query} onChange={(event): void => { setQuery(event.target.value) }} />
        </div>
        <Button variant="secondary" isLoading={isSearching} leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />} onClick={(): void => void search()}>Search</Button>
      </div>
      <Button variant="ghost" leadingIcon={<LocateFixed className="h-4 w-4" aria-hidden="true" />} onClick={useMyLocation}>Use my location</Button>
      <LocationPickerMap
        pickedLocation={draft.latitude !== null && draft.longitude !== null ? { latitude: draft.latitude, longitude: draft.longitude } : null}
        onPickedLocationChanged={(next): void => void pin(next.latitude, next.longitude)}
        heightClassName="h-72"
      />
      <p className="text-sm text-[var(--color-ink-500)]">Tap the map or drag the pin to the exact spot.</p>
      {notice !== null ? <p role="status" className="text-sm text-[var(--color-ink-700)]">{notice}</p> : null}
      <Input label="Full address" required value={draft.address} onChange={(event): void => { update({ address: event.target.value }) }} />
      <Input label="Landmark (optional)" value={draft.landmark} maxLength={120} onChange={(event): void => { update({ landmark: event.target.value }) }} />
      <Input label="Instructions for your washer (optional)" helperText="For example, the gate code or parking level." value={draft.instructions} maxLength={500}
        onChange={(event): void => { update({ instructions: event.target.value }) }} />
      <Button size="sm" variant="ghost" disabled={shouldSave} onClick={(): void => void saveAddress()}>{shouldSave ? 'Address saved' : 'Save this address'}</Button>
    </section>
  )
}
