import type { ReactElement } from 'react'
import { useCallback, useState } from 'react'
import {
  Crosshair,
  MapPin,
  Phone,
  Sparkles,
  Store,
} from 'lucide-react'
import type { CreateShopInput } from '../../../domain/models/Shop'
import { Button, Card, Input, applicationToast } from '../../design/ui'
import { useGeolocationPicker } from '../../hooks/useGeolocationPicker'
import { reverseGeocodeCoordinates } from '../../services/reverseGeocoding'
import { LocationPickerMap } from '../common/LocationPickerMap'

interface ShopSetupStepProps {
  readonly initialInputs?: Partial<ShopSetupFormValues>
  readonly isSubmitting: boolean
  readonly onShopSetupSubmitted: (createShopInput: CreateShopInput) => void
}

export interface ShopSetupFormValues {
  readonly shopName: string
  readonly shopAddress: string
  readonly shopPhoneNumber: string
  readonly pickedLatitude: number | null
  readonly pickedLongitude: number | null
}

export function ShopSetupStep({
  initialInputs,
  isSubmitting,
  onShopSetupSubmitted,
}: ShopSetupStepProps): ReactElement {
  const [shopName, setShopName] = useState<string>(
    initialInputs?.shopName ?? '',
  )
  const [shopAddress, setShopAddress] = useState<string>(
    initialInputs?.shopAddress ?? '',
  )
  const [shopPhoneNumber, setShopPhoneNumber] = useState<string>(
    initialInputs?.shopPhoneNumber ?? '',
  )
  const [pickedLatitude, setPickedLatitude] = useState<number | null>(
    initialInputs?.pickedLatitude ?? null,
  )
  const [pickedLongitude, setPickedLongitude] = useState<number | null>(
    initialInputs?.pickedLongitude ?? null,
  )
  const [isResolvingAddress, setIsResolvingAddress] = useState<boolean>(false)

  const handleCoordinatesSelected = useCallback(
    async (latitude: number, longitude: number): Promise<void> => {
      setPickedLatitude(latitude)
      setPickedLongitude(longitude)

      if (shopAddress.trim().length === 0) {
        try {
          setIsResolvingAddress(true)
          const reverseGeocodeResult = await reverseGeocodeCoordinates(
            latitude,
            longitude,
          )
          setShopAddress(reverseGeocodeResult.displayAddress)
        } catch {
          // Best-effort enrichment; ignore reverse-geocode errors.
        } finally {
          setIsResolvingAddress(false)
        }
      }
    },
    [shopAddress],
  )

  const { requestCurrentGeolocation } = useGeolocationPicker({
    onGeolocationResolved: ({ latitude, longitude }) =>
      void handleCoordinatesSelected(latitude, longitude),
  })

  const handleSubmit = (
    submitEvent: React.FormEvent<HTMLFormElement>,
  ): void => {
    submitEvent.preventDefault()

    const trimmedShopName = shopName.trim()
    const trimmedShopAddress = shopAddress.trim()
    const trimmedShopPhoneNumber = shopPhoneNumber.trim()

    if (trimmedShopName.length === 0) {
      applicationToast.warning('Please enter your shop name.')
      return
    }
    if (trimmedShopAddress.length === 0) {
      applicationToast.warning('Please enter your shop address.')
      return
    }
    if (pickedLatitude === null || pickedLongitude === null) {
      applicationToast.warning(
        'Drop a pin on the map to set your shop location.',
      )
      return
    }

    const createShopInput: CreateShopInput = {
      name: trimmedShopName,
      address: trimmedShopAddress,
      phoneNumber:
        trimmedShopPhoneNumber.length > 0 ? trimmedShopPhoneNumber : null,
      latitude: pickedLatitude,
      longitude: pickedLongitude,
    }

    onShopSetupSubmitted(createShopInput)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card elevation="flat" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <Store className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-ink-900)]">
              Your shop details
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
              This is how customers will see your car wash in the app.
            </p>
          </div>
        </div>

        <Input
          name="shopName"
          label="Shop name"
          placeholder="e.g. Sparkle Wash Makati"
          required
          leadingIcon={<Sparkles className="h-4 w-4" />}
          value={shopName}
          onChange={(inputChangeEvent) =>
            setShopName(inputChangeEvent.target.value)
          }
        />

        <Input
          name="shopPhoneNumber"
          label="Contact number"
          placeholder="e.g. +63 917 555 0100"
          leadingIcon={<Phone className="h-4 w-4" />}
          value={shopPhoneNumber}
          onChange={(inputChangeEvent) =>
            setShopPhoneNumber(inputChangeEvent.target.value)
          }
        />
      </Card>

      <Card elevation="flat" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-ink-900)]">
              Shop location
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
              Drop a pin so nearby customers can find you.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<Crosshair className="h-4 w-4" />}
            onClick={requestCurrentGeolocation}
          >
            Use my location
          </Button>
        </div>

        <LocationPickerMap
          pickedLocation={
            pickedLatitude !== null && pickedLongitude !== null
              ? { latitude: pickedLatitude, longitude: pickedLongitude }
              : null
          }
          onPickedLocationChanged={(nextPickedLocation) =>
            void handleCoordinatesSelected(
              nextPickedLocation.latitude,
              nextPickedLocation.longitude,
            )
          }
        />

        <Input
          name="shopAddress"
          label="Address"
          placeholder="Street, barangay, city"
          required
          leadingIcon={<MapPin className="h-4 w-4" />}
          value={shopAddress}
          onChange={(inputChangeEvent) =>
            setShopAddress(inputChangeEvent.target.value)
          }
          helperText={
            isResolvingAddress
              ? 'Resolving address from your pin…'
              : undefined
          }
        />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" isLoading={isSubmitting}>
          Save and continue
        </Button>
      </div>
    </form>
  )
}
