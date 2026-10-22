import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Crosshair,
  MapPin,
  Phone,
  Store,
} from 'lucide-react'
import type { Shop } from '../../../domain/models/Shop'
import { shopHasCompletePricing } from '../../../domain/utilities/shopPricing'
import { Button, Card, Input } from '../../design/ui'
import { useGeolocationPicker } from '../../hooks/useGeolocationPicker'
import { reverseGeocodeCoordinates } from '../../../services/geocodingService'
import { sortShopsByProximity } from '../../utilities/sortShopsByProximity'
import { LocationPickerMap } from '../shared/LocationPickerMap'
import { ShopPickerRow } from './ShopPickerRow'

export interface SelectedLocationValue {
  readonly latitude: number
  readonly longitude: number
  readonly displayAddress: string
}

interface LocationAndShopStepProps {
  readonly selectedLocation: SelectedLocationValue | null
  readonly onSelectedLocationChanged: (
    nextSelectedLocation: SelectedLocationValue,
  ) => void
  readonly selectedShopIdentifier: string | null
  readonly onSelectedShopIdentifierChanged: (
    nextSelectedShopIdentifier: string | null,
  ) => void
  readonly availableShops: readonly Shop[]
  readonly isLoadingShops: boolean
}

export function LocationAndShopStep({
  selectedLocation,
  onSelectedLocationChanged,
  selectedShopIdentifier,
  onSelectedShopIdentifierChanged,
  availableShops,
  isLoadingShops,
}: LocationAndShopStepProps): ReactElement {
  const [isReverseGeocodingInProgress, setIsReverseGeocodingInProgress] =
    useState<boolean>(false)
  const [addressInputValue, setAddressInputValue] = useState<string>(
    selectedLocation?.displayAddress ?? '',
  )

  useEffect(() => {
    if (selectedLocation) {
      setAddressInputValue(selectedLocation.displayAddress)
    }
  }, [selectedLocation])

  const resolveAddressForCoordinates = useCallback(
    async (latitude: number, longitude: number): Promise<void> => {
      setIsReverseGeocodingInProgress(true)
      try {
        const reverseGeocodeResult = await reverseGeocodeCoordinates(
          latitude,
          longitude,
        )
        onSelectedLocationChanged(reverseGeocodeResult)
      } catch (reverseGeocodeError) {
        console.warn('Reverse geocoding failed.', reverseGeocodeError)
        onSelectedLocationChanged({
          latitude,
          longitude,
          displayAddress:
            addressInputValue.trim().length > 0
              ? addressInputValue.trim()
              : `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`,
        })
      } finally {
        setIsReverseGeocodingInProgress(false)
      }
    },
    [addressInputValue, onSelectedLocationChanged],
  )

  const { isReadingGeolocation, requestCurrentGeolocation } =
    useGeolocationPicker({
      onGeolocationResolved: ({ latitude, longitude }) =>
        void resolveAddressForCoordinates(latitude, longitude),
    })

  const handleAddressInputBlur = (): void => {
    if (!selectedLocation) {
      return
    }
    if (addressInputValue.trim() === selectedLocation.displayAddress.trim()) {
      return
    }
    onSelectedLocationChanged({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      displayAddress: addressInputValue.trim(),
    })
  }

  const shopsSortedByDistance = useMemo(
    () =>
      sortShopsByProximity(
        availableShops,
        selectedLocation
          ? {
              latitude: selectedLocation.latitude,
              longitude: selectedLocation.longitude,
            }
          : null,
      ),
    [availableShops, selectedLocation],
  )
  const shopsForMap = useMemo(
    () => {
      const shopsWithCoordinates = shopsSortedByDistance
        .filter(
          ({ shop }) =>
            typeof shop.latitude === 'number' &&
            typeof shop.longitude === 'number',
        )
        .slice(0, 12)
      if (
        selectedShopIdentifier !== null &&
        !shopsWithCoordinates.some(({ shop }) => shop.id === selectedShopIdentifier)
      ) {
        const selectedShop = shopsSortedByDistance.find(
          ({ shop }) => shop.id === selectedShopIdentifier,
        )
        if (
          selectedShop &&
          typeof selectedShop.shop.latitude === 'number' &&
          typeof selectedShop.shop.longitude === 'number'
        ) {
          return [...shopsWithCoordinates, selectedShop]
        }
      }
      return shopsWithCoordinates
    },
    [selectedShopIdentifier, shopsSortedByDistance],
  )
  const shopMarkers = useMemo(
    () => shopsForMap.map(({ shop }) => shop),
    [shopsForMap],
  )
  const pickedMapLocation = useMemo(
    () =>
      selectedLocation
        ? {
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
          }
        : null,
    [selectedLocation],
  )
  const shopsMissingCoordinatesCount = availableShops.length -
    availableShops.filter(
      (shop) =>
        typeof shop.latitude === 'number' &&
        typeof shop.longitude === 'number',
    ).length

  return (
    <Card elevation="flat" className="space-y-4 p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--color-ink-900)]">
          Where are you?
        </h2>
        <p className="text-sm text-[var(--color-ink-500)]">
          Set your location, then select a shop to see its rates and book.
        </p>
      </header>

      <LocationPickerMap
        pickedLocation={pickedMapLocation}
        nearbyShops={shopMarkers}
        selectedShopIdentifier={selectedShopIdentifier}
        onShopSelected={onSelectedShopIdentifierChanged}
        isLoadingShops={isLoadingShops}
        isShopPicker
        onPickedLocationChanged={(nextPickedLocation) =>
          void resolveAddressForCoordinates(
            nextPickedLocation.latitude,
            nextPickedLocation.longitude,
          )
        }
      />
      <p className="-mt-2 text-xs text-[var(--color-ink-500)]">
        {isLoadingShops
          ? 'Finding approved car washes…'
          : shopMarkers.length > 0
          ? selectedLocation
            ? `Showing ${String(shopMarkers.length)} closest car wash${shopMarkers.length === 1 ? '' : 'es'} to your location.`
            : `Showing ${String(shopMarkers.length)} car wash${shopMarkers.length === 1 ? '' : 'es'}. Set your location to sort by distance.`
          : 'No nearby car washes have map coordinates yet; browse the shop list below.'}
        {shopsMissingCoordinatesCount > 0
          ? ` ${String(shopsMissingCoordinatesCount)} shop${shopsMissingCoordinatesCount === 1 ? '' : 's'} without a map location are listed below.`
          : ''}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="secondary"
          size="md"
          leadingIcon={<Crosshair className="h-4 w-4" />}
          isLoading={isReadingGeolocation}
          onClick={requestCurrentGeolocation}
        >
          Use my current location
        </Button>
        {isReverseGeocodingInProgress ? (
          <span className="text-xs text-[var(--color-ink-500)]">
            Finding address…
          </span>
        ) : null}
      </div>

      <Input
        name="address"
        label="Address"
        placeholder="Street, city, landmark"
        value={addressInputValue}
        onChange={(inputChangeEvent): void => {
          setAddressInputValue(inputChangeEvent.target.value)
        }}
        onBlur={handleAddressInputBlur}
        leadingIcon={<MapPin className="h-4 w-4" />}
        helperText={
          selectedLocation
            ? `Lat ${selectedLocation.latitude.toFixed(5)}, Lng ${selectedLocation.longitude.toFixed(5)}`
            : 'Drop a pin on the map to set coordinates.'
        }
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">
            Choose a shop
          </h3>
          <span className="text-[11px] font-medium text-[var(--color-ink-500)]">
            Required
          </span>
        </div>
        <ul className="space-y-2">
          {isLoadingShops ? (
            <li>
              <div className="rounded-[var(--radius-surface)] border border-dashed border-[var(--color-ink-200)] bg-white px-4 py-5 text-center text-xs text-[var(--color-ink-500)]">
                Loading shops…
              </div>
            </li>
          ) : null}

          {!isLoadingShops && shopsSortedByDistance.length === 0 ? (
            <li>
              <div className="rounded-[var(--radius-surface)] border border-dashed border-[var(--color-ink-200)] bg-white px-4 py-5 text-center text-xs text-[var(--color-ink-500)]">
                No approved shops are available yet. Check back after a shop
                has published its rates.
              </div>
            </li>
          ) : null}

          {shopsSortedByDistance.map(({ shop, distanceKilometers }) => (
            <li key={shop.id}>
              <ShopPickerRow
                isSelected={selectedShopIdentifier === shop.id}
                title={shop.name}
                subtitle={shopHasCompletePricing(shop)
                  ? shop.address
                  : `${shop.address} · Rates not set up yet`}
                isDisabled={!shopHasCompletePricing(shop)}
                leadingIcon={<Store className="h-5 w-5" />}
                trailingMeta={
                  <div className="flex flex-col items-end gap-1 text-right">
                    {typeof distanceKilometers === 'number' ? (
                      <span className="text-[11px] font-semibold text-[var(--color-brand-700)]">
                        {distanceKilometers < 1
                          ? String(Math.round(distanceKilometers * 1000)) + ' m'
                          : distanceKilometers.toFixed(1) + ' km'}
                      </span>
                    ) : null}
                    {shop.phoneNumber ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-500)]">
                        <Phone className="h-3 w-3" />
                        {shop.phoneNumber}
                      </span>
                    ) : null}
                  </div>
                }
                onClick={(): void => {
                  onSelectedShopIdentifierChanged(shop.id)
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
