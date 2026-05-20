import type { ReactElement } from 'react'
import { Card } from '../../presentation/design/ui'
import { BookingStepProgress } from '../../presentation/components/booking/BookingStepProgress'
import { useBookingStepFlow } from './useBookingStepFlow'
import { BookingStepFlowSteps } from './BookingStepFlowSteps'
import type { CreateBookingInput } from '../../domain/models/Booking'
import type { Shop } from '../../domain/models/Shop'

interface BookingStepFlowProps {
  readonly onSubmitBooking: (
    createBookingInput: CreateBookingInput,
  ) => Promise<void>
  readonly isSubmittingBooking: boolean
  readonly defaultCustomerName: string
  readonly availableShops: readonly Shop[]
  readonly isLoadingShops: boolean
}

export function BookingStepFlow({
  onSubmitBooking,
  isSubmittingBooking,
  defaultCustomerName,
  availableShops,
  isLoadingShops,
}: BookingStepFlowProps): ReactElement {
  const bookingFlow = useBookingStepFlow({
    onSubmitBooking,
    isSubmittingBooking,
    defaultCustomerName,
    availableShops,
    isLoadingShops,
  })

  return (
    <div className="space-y-5 pb-28 sm:pb-0">
      <Card elevation="flat" className="space-y-4 p-4 sm:p-5">
        <BookingStepProgress
          steps={bookingFlow.bookingStepDefinitions}
          activeStepKey={bookingFlow.activeStepKey}
        />
      </Card>

      <BookingStepFlowSteps
        activeStepKey={bookingFlow.activeStepKey}
        availableShops={bookingFlow.availableShops}
        currentStepIndex={bookingFlow.currentStepIndex}
        customerName={bookingFlow.customerName}
        customerNotesDraft={bookingFlow.customerNotesDraft}
        isFirstStep={bookingFlow.isFirstStep}
        isLastStep={bookingFlow.isLastStep}
        isSubmittingBooking={bookingFlow.isSubmittingBooking}
        selectedDateTime={bookingFlow.selectedDateTime}
        selectedVehicleValue={bookingFlow.selectedVehicleValue}
        selectedServiceValue={bookingFlow.selectedServiceValue}
        selectedVehicleOption={bookingFlow.selectedVehicleOption}
        selectedServiceOption={bookingFlow.selectedServiceOption}
        selectedShopOption={bookingFlow.selectedShopOption}
        selectedShopLabel={
          bookingFlow.selectedShopOption?.name ?? 'Any available shop'
        }
        selectedLocation={bookingFlow.selectedLocation}
        customerNotesPreview={bookingFlow.customerNotesDraft.trim()}
        isLoadingShops={bookingFlow.isLoadingShops}
        onSelectedLocationChanged={bookingFlow.setSelectedLocation}
        onSelectedShopIdentifierChanged={bookingFlow.setSelectedShopIdentifier}
        onVehicleSelected={bookingFlow.setSelectedVehicleValue}
        onServiceSelected={bookingFlow.setSelectedServiceValue}
        onCustomerNameChanged={bookingFlow.setCustomerName}
        onSelectedDateTimeChanged={bookingFlow.setSelectedDateTime}
        onCustomerNotesDraftChanged={bookingFlow.setCustomerNotesDraft}
        onBackClicked={bookingFlow.regressStep}
        onContinueClicked={bookingFlow.advanceStep}
        onConfirmClicked={bookingFlow.handleConfirmBooking}
      />
    </div>
  )
}
