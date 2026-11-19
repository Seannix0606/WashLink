import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { House, LocateFixed, MapPin, Search } from 'lucide-react'
import { findHomeAddress, type SavedAddress } from '@washlink/shared'
import { reverseGeocodeApi, searchAddressApi } from '../../../../api/geocoding.api'
import { LocationPickerMap } from '../../../../presentation/components/shared/LocationPickerMap'
import { Button, Input, Skeleton } from '../../../../presentation/design/ui'
import { joinClassNames } from '../../../../presentation/design/classNames'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import { saveHomeFromSignUp } from '../useHomeAddress'
import type { StepProps } from './BookingWizard'

type PlaceChoice = 'home' | 'other'

const optionClass = (isSelected: boolean): string =>
  joinClassNames(
    'flex w-full min-w-0 items-start gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors cursor-pointer',
    isSelected
      ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-50)] ring-1 ring-[var(--color-brand-700)]'
      : 'border-[var(--color-card-border)] bg-[var(--color-card)] hover:border-[var(--color-brand-300)]',
  )

const isAt = (address: SavedAddress, latitude: number | null, longitude: number | null): boolean =>
  latitude === address.latitude && longitude === address.longitude

/**
 * A customer with a Home location starts there and can switch to another place on the map. GPS is only a starting
 * point: the customer confirms the pin and address, which stay in sync.
 */
export function StepWhere({ draft, update, customerId }: StepProps): ReactElement {
  const [saved, setSaved] = useState<readonly SavedAddress[] | null>(null)
  const [pickedChoice, setChoice] = useState<PlaceChoice | null>(null)
  // The draft when the step opened: an empty one starts at Home once the saved addresses arrive.
  const startedEmpty = useRef(draft.latitude === null && draft.longitude === null)
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [shouldSave, setShouldSave] = useState(false)

  useEffect(() => {
    let isCurrent = true
    saveHomeFromSignUp(customerId).catch(() => undefined)
      .then(async () => getB2cApi().listAddresses())
      .then((next) => {
        if (!isCurrent) return
        setSaved(next)
        const startHome = findHomeAddress(next)
        if (startHome !== null && startedEmpty.current) {
          update({ address: startHome.address, latitude: startHome.latitude, longitude: startHome.longitude, landmark: startHome.landmark, instructions: startHome.instructions })
        }
      })
      .catch(() => { if (isCurrent) setSaved([]) })
    return (): void => { isCurrent = false }
    // update is recreated by the wizard on every render; the start runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  const home = saved === null ? null : findHomeAddress(saved)
  const others = (saved ?? []).filter((address) => address.id !== home?.id)

  const applyAddress = (address: SavedAddress): void => {
    update({ address: address.address, latitude: address.latitude, longitude: address.longitude, landmark: address.landmark, instructions: address.instructions })
  }

  // Until the customer picks: Home when the pin is at Home (or still being filled from it), otherwise another place.
  const choice: PlaceChoice | null = pickedChoice ?? (saved === null ? null : home === null ? 'other'
    : (draft.latitude === null && startedEmpty.current) || isAt(home, draft.latitude, draft.longitude) ? 'home' : 'other')

  const chooseHome = (): void => {
    if (home === null) {
      return
    }
    applyAddress(home)
    setChoice('home')
    setNotice(null)
  }

  const chooseOther = (): void => {
    if (choice !== 'other') {
      update({ address: '', latitude: null, longitude: null, landmark: '', instructions: '' })
      setShouldSave(false)
    }
    setChoice('other')
  }

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

  const details = (
    <>
      <Input label="Landmark (optional)" value={draft.landmark} maxLength={120} onChange={(event): void => { update({ landmark: event.target.value }) }} />
      <Input label="Instructions for your washer (optional)" helperText="For example, the gate code or parking level." value={draft.instructions} maxLength={500}
        onChange={(event): void => { update({ instructions: event.target.value }) }} />
    </>
  )

  return (
    <section aria-labelledby="where-title" className="space-y-4">
      <div>
        <h2 id="where-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Where is the vehicle?</h2>
        <p className="mt-0.5 text-sm text-[var(--color-ink-700)]">We only show times from washers who serve this spot.</p>
      </div>

      {saved === null ? <Skeleton heightClassName="h-20" /> : null}

      {home !== null ? (
        <div role="radiogroup" aria-label="Where to wash" className="grid gap-2 sm:grid-cols-2">
          <button type="button" role="radio" aria-checked={choice === 'home'} className={optionClass(choice === 'home')} onClick={chooseHome}>
            <House className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--color-ink-900)]">Home</span>
              <span className="block text-sm text-[var(--color-ink-500)] [overflow-wrap:anywhere]">{home.address}</span>
            </span>
          </button>
          <button type="button" role="radio" aria-checked={choice === 'other'} className={optionClass(choice === 'other')} onClick={chooseOther}>
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--color-ink-900)]">Another place</span>
              <span className="block text-sm text-[var(--color-ink-500)]">Pin a different spot on the map.</span>
            </span>
          </button>
        </div>
      ) : null}

      {choice === 'home' ? details : null}

      {choice === 'other' ? (
        <>
          {others.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Saved places">
              {others.map((address) => (
                <Button key={address.id} size="sm" variant="secondary" onClick={(): void => { applyAddress(address) }}>{address.label}</Button>
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
            fallbackCenter={home === null ? undefined : { latitude: home.latitude, longitude: home.longitude }}
            heightClassName="h-72"
          />
          <p className="text-sm text-[var(--color-ink-500)]">Tap the map or drag the pin to the exact spot.</p>
          {notice !== null ? <p role="status" className="text-sm text-[var(--color-ink-700)]">{notice}</p> : null}
          <Input label="Full address" required value={draft.address} onChange={(event): void => { update({ address: event.target.value }) }} />
          {details}
          <Button size="sm" variant="ghost" disabled={shouldSave} onClick={(): void => void saveAddress()}>{shouldSave ? 'Address saved' : 'Save this address'}</Button>
        </>
      ) : null}
    </section>
  )
}
