import { useCallback, useMemo, useState } from 'react'
import { applicationToast } from '../../presentation/design/ui'
import type { BookingStepDefinition } from '../../presentation/components/booking/BookingStepProgress'
import {
  findServiceOptionByValue,
  findVehicleOptionByValue,
  serviceOptionDefinitions,
  vehicleOptionDefinitions,
} from '../../presentation/components/booking/bookingCatalog'
import type { CreateBookingInput } from '../../domain/models/Booking'
import type { Shop } from '../../domain/models/Shop'

export type BookingStepKey =
  | 'location'
  | 'vehicle'
  | 'service'
  | 'schedule'
  | 'review'

export const bookingStepDefinitions: readonly BookingStepDefinition<BookingStepKey>[] = [
  { key: 'location', label: 'Location' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'service', label: 'Service' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'review', label: 'Review' },
]

interface UseBookingStepFlowProps {
  readonly onSubmitBooking: (createBookingInput: CreateBookingInput) => Promise<void>
  readonly isSubmittingBooking: boolean
  readonly defaultCustomerName: string
  readonly availableShops: readonly Shop[]
  readonly isLoadingShops: boolean
}

export function useBookingStepFlow({
  onSubmitBooking,
  isSubmittingBooking,
  defaultCustomerName,
  availableShops,
  isLoadingShops,
}: UseBookingStepFlowProps) {
  const [activeStepKey, setActiveStepKey] = useState<BookingStepKey>('location')
  const [selectedLocation, setSelectedLocation] = useState<
    | {
        readonly latitude: number
        readonly longitude: number
        readonly displayAddress: string
      }
    | null
  >(null)
  const [selectedShopIdentifier, setSelectedShopIdentifier] = useState<
    string | null
  >(null)
  const [selectedVehicleValue, setSelectedVehicleValue] = useState<string>(
    vehicleOptionDefinitions[0].value,
  )
  const [selectedServiceValue, setSelectedServiceValue] = useState<string>(
    serviceOptionDefinitions[0].value,
  )
  const [customerName, setCustomerName] = useState<string>(defaultCustomerName)
  const [selectedDateTime, setSelectedDateTime] = useState<string>('')
  const [customerNotesDraft, setCustomerNotesDraft] = useState<string>('')

  const currentStepIndex = bookingStepDefinitions.findIndex(
    (stepDefinition) => stepDefinition.key === activeStepKey,
  )

  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex ===
    bookingStepDefinitions.length - 1

  const selectedVehicleOption = useMemo(
    () => findVehicleOptionByValue(selectedVehicleValue),
    [selectedVehicleValue],
  )

  const selectedServiceOption = useMemo(
    () => findServiceOptionByValue(selectedServiceValue),
    [selectedServiceValue],
  )

  const selectedShopOption = useMemo(
    () =>
      selectedShopIdentifier
        ? availableShops.find((shop) => shop.id === selectedShopIdentifier) ??
          null
        : null,
    [availableShops, selectedShopIdentifier],
  )

  const advanceStep = useCallback(() => {
    if (activeStepKey === 'location') {
      if (!selectedLocation) {
        applicationToast.error('Please set your location on the map first.')
        return
      }
      if (selectedLocation.displayAddress.trim().length === 0) {
        applicationToast.error('Please enter an address.')
        return
      }
    }

    if (activeStepKey === 'schedule') {
      if (customerName.trim().length === 0) {
        applicationToast.error('Please enter your name.')
        return
      }
      if (selectedDateTime.trim().length === 0) {
        applicationToast.error('Please choose a date and time.')
        return
      }
    }

    const nextIndex = Math.min(
      currentStepIndex + 1,
      bookingStepDefinitions.length - 1,
    )
    setActiveStepKey(bookingStepDefinitions[nextIndex].key)
  }, [activeStepKey, currentStepIndex, customerName, selectedDateTime, selectedLocation])

  const regressStep = useCallback(() => {
    const previousIndex = Math.max(currentStepIndex - 1, 0)
    setActiveStepKey(bookingStepDefinitions[previousIndex].key)
  }, [currentStepIndex])

  const handleConfirmBooking = useCallback(async (): Promise<void> => {
    if (!selectedLocation) {
      applicationToast.error('Please set your location on the map first.')
      setActiveStepKey('location')
      return
    }

    const trimmedCustomerNotes = customerNotesDraft.trim()

    await onSubmitBooking({
      customerName: customerName.trim(),
      vehicleType: selectedVehicleValue,
      serviceType: selectedServiceValue,
      address: selectedLocation.displayAddress.trim(),
      time: new Date(selectedDateTime).toISOString(),
      shopIdentifier: selectedShopIdentifier,
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      customerNotes:
        trimmedCustomerNotes.length > 0 ? trimmedCustomerNotes : null,
    })
  }, [customerName, customerNotesDraft, selectedDateTime, selectedLocation, selectedServiceValue, selectedShopIdentifier, selectedVehicleValue, onSubmitBooking])

  return {
    activeStepKey,
    availableShops,
    currentStepIndex,
    customerName,
    customerNotesDraft,
    isFirstStep,
    isLastStep,
    isSubmittingBooking,
    selectedDateTime,
    selectedLocation,
    selectedServiceOption,
    selectedServiceValue,
    selectedShopIdentifier,
    selectedShopOption,
    selectedVehicleOption,
    selectedVehicleValue,
    setActiveStepKey,
    setCustomerName,
    setCustomerNotesDraft,
    setSelectedDateTime,
    setSelectedLocation,
    setSelectedServiceValue,
    setSelectedShopIdentifier,
    setSelectedVehicleValue,
    advanceStep,
    regressStep,
    handleConfirmBooking,
    bookingStepDefinitions,
    isLoadingShops,
  }
}
