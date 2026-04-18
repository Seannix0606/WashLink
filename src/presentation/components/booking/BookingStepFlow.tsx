import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  StickyNote,
  User as UserIcon,
} from 'lucide-react'
import type { CreateBookingInput } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { Button, Card, Input } from '../../design/ui'
import { applicationToast } from '../../design/ui'
import { joinClassNames } from '../../design/classNames'
import {
  BookingStepProgress,
  type BookingStepDefinition,
} from './BookingStepProgress'
import {
  findServiceOptionByValue,
  findVehicleOptionByValue,
  serviceOptionDefinitions,
  vehicleOptionDefinitions,
} from './bookingCatalog'
import {
  LocationAndShopStep,
  type SelectedLocationValue,
} from './LocationAndShopStep'

type BookingStepKey =
  | 'location'
  | 'vehicle'
  | 'service'
  | 'schedule'
  | 'review'

const bookingStepDefinitions: readonly BookingStepDefinition<BookingStepKey>[] =
  [
    { key: 'location', label: 'Location' },
    { key: 'vehicle', label: 'Vehicle' },
    { key: 'service', label: 'Service' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'review', label: 'Review' },
  ]

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
  const [activeStepKey, setActiveStepKey] = useState<BookingStepKey>('location')
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocationValue | null>(null)
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

  const currentStepIndex = bookingStepDefinitions.findIndex(
    (stepDefinition) => stepDefinition.key === activeStepKey,
  )
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === bookingStepDefinitions.length - 1

  const advanceStep = (): void => {
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
  }

  const regressStep = (): void => {
    const previousIndex = Math.max(currentStepIndex - 1, 0)
    setActiveStepKey(bookingStepDefinitions[previousIndex].key)
  }

  const handleConfirmBooking = async (): Promise<void> => {
    if (!selectedLocation) {
      applicationToast.error('Please set your location on the map first.')
      setActiveStepKey('location')
      return
    }
    try {
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
    } catch (error) {
      applicationToast.error(
        error instanceof Error
          ? error.message
          : 'Booking submission failed. Please try again.',
      )
    }
  }

  return (
    <div className="space-y-5 pb-28 sm:pb-0">
      <Card elevation="flat" className="space-y-4 p-4 sm:p-5">
        <BookingStepProgress
          steps={bookingStepDefinitions}
          activeStepKey={activeStepKey}
        />
      </Card>

      <div className="wl-animate-in" key={activeStepKey}>
        {activeStepKey === 'location' ? (
          <LocationAndShopStep
            selectedLocation={selectedLocation}
            onSelectedLocationChanged={setSelectedLocation}
            selectedShopIdentifier={selectedShopIdentifier}
            onSelectedShopIdentifierChanged={setSelectedShopIdentifier}
            availableShops={availableShops}
            isLoadingShops={isLoadingShops}
          />
        ) : null}
        {activeStepKey === 'vehicle' ? (
          <VehicleSelectionStep
            selectedVehicleValue={selectedVehicleValue}
            onVehicleSelected={setSelectedVehicleValue}
          />
        ) : null}
        {activeStepKey === 'service' ? (
          <ServiceSelectionStep
            selectedServiceValue={selectedServiceValue}
            onServiceSelected={setSelectedServiceValue}
          />
        ) : null}
        {activeStepKey === 'schedule' ? (
          <ScheduleStep
            customerName={customerName}
            onCustomerNameChanged={setCustomerName}
            selectedDateTime={selectedDateTime}
            onSelectedDateTimeChanged={setSelectedDateTime}
            customerNotesDraft={customerNotesDraft}
            onCustomerNotesDraftChanged={setCustomerNotesDraft}
          />
        ) : null}
        {activeStepKey === 'review' ? (
          <ReviewStep
            customerName={customerName}
            addressDisplay={selectedLocation?.displayAddress ?? '—'}
            selectedDateTime={selectedDateTime}
            selectedVehicleLabel={selectedVehicleOption?.label ?? ''}
            selectedServiceLabel={selectedServiceOption?.label ?? ''}
            selectedServicePriceLabel={selectedServiceOption?.priceLabel ?? ''}
            selectedServiceDurationLabel={
              selectedServiceOption?.durationLabel ?? ''
            }
            selectedShopLabel={selectedShopOption?.name ?? 'Any available shop'}
            customerNotesPreview={customerNotesDraft.trim()}
          />
        ) : null}
      </div>

      <div className="hidden items-center justify-between gap-3 sm:flex">
        <Button
          type="button"
          variant="secondary"
          onClick={regressStep}
          disabled={isFirstStep || isSubmittingBooking}
          leadingIcon={<ArrowLeft className="h-4 w-4" />}
        >
          Back
        </Button>
        {isLastStep ? (
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void handleConfirmBooking()
            }}
            isLoading={isSubmittingBooking}
            leadingIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            Confirm booking
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            onClick={advanceStep}
            trailingIcon={<ArrowRight className="h-4 w-4" />}
          >
            Continue
          </Button>
        )}
      </div>

      <StickyMobileBookingBar
        currentStepIndex={currentStepIndex}
        totalStepCount={bookingStepDefinitions.length}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isSubmittingBooking={isSubmittingBooking}
        selectedServicePriceLabel={selectedServiceOption?.priceLabel ?? ''}
        onBackClicked={regressStep}
        onContinueClicked={advanceStep}
        onConfirmClicked={() => {
          void handleConfirmBooking()
        }}
      />
    </div>
  )
}

interface VehicleSelectionStepProps {
  readonly selectedVehicleValue: string
  readonly onVehicleSelected: (nextVehicleValue: string) => void
}

function VehicleSelectionStep({
  selectedVehicleValue,
  onVehicleSelected,
}: VehicleSelectionStepProps): ReactElement {
  return (
    <Card elevation="flat" className="space-y-4 p-5">
      <StepHeader
        title="What are we washing?"
        description="Pick the vehicle type so we can estimate time and price."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {vehicleOptionDefinitions.map((vehicleOption) => {
          const isSelected = vehicleOption.value === selectedVehicleValue
          return (
            <button
              key={vehicleOption.value}
              type="button"
              onClick={() => onVehicleSelected(vehicleOption.value)}
              aria-pressed={isSelected}
              className={joinClassNames(
                'flex flex-col items-start gap-2 rounded-[var(--radius-surface)] border px-4 py-4 text-left transition-all',
                isSelected
                  ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-50)] shadow-[var(--shadow-card)]'
                  : 'border-[var(--color-ink-200)] bg-white hover:border-[var(--color-brand-300)]',
              )}
            >
              <span
                className={joinClassNames(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  isSelected
                    ? 'bg-[var(--color-brand-700)] text-white'
                    : 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]',
                )}
              >
                {vehicleOption.icon}
              </span>
              <span className="text-sm font-semibold text-[var(--color-ink-900)]">
                {vehicleOption.label}
              </span>
              <span className="text-xs text-[var(--color-ink-500)]">
                {vehicleOption.description}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

interface ServiceSelectionStepProps {
  readonly selectedServiceValue: string
  readonly onServiceSelected: (nextServiceValue: string) => void
}

function ServiceSelectionStep({
  selectedServiceValue,
  onServiceSelected,
}: ServiceSelectionStepProps): ReactElement {
  return (
    <Card elevation="flat" className="space-y-4 p-5">
      <StepHeader
        title="Choose a service"
        description="Pick a package. Final price is confirmed on arrival."
      />
      <ul className="space-y-3">
        {serviceOptionDefinitions.map((serviceOption) => {
          const isSelected = serviceOption.value === selectedServiceValue
          return (
            <li key={serviceOption.value}>
              <button
                type="button"
                onClick={() => onServiceSelected(serviceOption.value)}
                aria-pressed={isSelected}
                className={joinClassNames(
                  'flex w-full items-start gap-3 rounded-[var(--radius-surface)] border px-4 py-3 text-left transition-all',
                  isSelected
                    ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-50)] shadow-[var(--shadow-card)]'
                    : 'border-[var(--color-ink-200)] bg-white hover:border-[var(--color-brand-300)]',
                )}
              >
                <span
                  className={joinClassNames(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    isSelected
                      ? 'bg-[var(--color-brand-700)] text-white'
                      : 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]',
                  )}
                >
                  {serviceOption.icon}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--color-ink-900)]">
                      {serviceOption.label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-brand-700)]">
                      {serviceOption.priceLabel}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-ink-500)]">
                    {serviceOption.description}
                  </span>
                  <span className="mt-1 text-[11px] font-medium text-[var(--color-ink-500)]">
                    {serviceOption.durationLabel}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

interface ScheduleStepProps {
  readonly customerName: string
  readonly onCustomerNameChanged: (nextCustomerName: string) => void
  readonly selectedDateTime: string
  readonly onSelectedDateTimeChanged: (nextSelectedDateTime: string) => void
  readonly customerNotesDraft: string
  readonly onCustomerNotesDraftChanged: (nextCustomerNotesDraft: string) => void
}

const customerNotesMaximumLength = 280

function ScheduleStep({
  customerName,
  onCustomerNameChanged,
  selectedDateTime,
  onSelectedDateTimeChanged,
  customerNotesDraft,
  onCustomerNotesDraftChanged,
}: ScheduleStepProps): ReactElement {
  const customerNotesRemainingCharacters =
    customerNotesMaximumLength - customerNotesDraft.length
  return (
    <Card elevation="flat" className="space-y-4 p-5">
      <StepHeader
        title="When should we come?"
        description="We'll use the location you set earlier."
      />
      <div className="space-y-4">
        <Input
          name="customerName"
          label="Your name"
          placeholder="Juan Dela Cruz"
          required
          value={customerName}
          onChange={(event) => onCustomerNameChanged(event.target.value)}
          leadingIcon={<UserIcon className="h-4 w-4" />}
        />
        <Input
          name="selectedDateTime"
          type="datetime-local"
          label="Date and time"
          required
          value={selectedDateTime}
          onChange={(event) => onSelectedDateTimeChanged(event.target.value)}
          leadingIcon={<CalendarClock className="h-4 w-4" />}
        />
        <div className="space-y-1.5">
          <label
            htmlFor="customerNotesInput"
            className="flex items-center justify-between text-sm font-medium text-[var(--color-ink-900)]"
          >
            <span className="inline-flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-[var(--color-ink-500)]" />
              Notes for the worker{' '}
              <span className="text-xs font-normal text-[var(--color-ink-500)]">
                (optional)
              </span>
            </span>
            <span className="text-[11px] font-medium text-[var(--color-ink-500)]">
              {customerNotesRemainingCharacters}
            </span>
          </label>
          <textarea
            id="customerNotesInput"
            name="customerNotes"
            value={customerNotesDraft}
            onChange={(changeEvent) =>
              onCustomerNotesDraftChanged(
                changeEvent.target.value.slice(0, customerNotesMaximumLength),
              )
            }
            rows={3}
            placeholder="Gate code, parking slot, car color, anything the worker should know…"
            className={joinClassNames(
              'w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm text-[var(--color-ink-900)] placeholder:text-[var(--color-ink-400)] outline-none transition-colors',
              'focus:border-[var(--color-brand-600)]',
            )}
          />
          <p className="text-[11px] text-[var(--color-ink-500)]">
            Your worker will see these notes on their job card.
          </p>
        </div>
      </div>
    </Card>
  )
}

interface ReviewStepProps {
  readonly customerName: string
  readonly addressDisplay: string
  readonly selectedDateTime: string
  readonly selectedVehicleLabel: string
  readonly selectedServiceLabel: string
  readonly selectedServicePriceLabel: string
  readonly selectedServiceDurationLabel: string
  readonly selectedShopLabel: string
  readonly customerNotesPreview: string
}

function ReviewStep({
  customerName,
  addressDisplay,
  selectedDateTime,
  selectedVehicleLabel,
  selectedServiceLabel,
  selectedServicePriceLabel,
  selectedServiceDurationLabel,
  selectedShopLabel,
  customerNotesPreview,
}: ReviewStepProps): ReactElement {
  const formattedDateTime = selectedDateTime
    ? new Date(selectedDateTime).toLocaleString()
    : '—'
  return (
    <Card elevation="flat" className="space-y-4 p-5">
      <StepHeader
        title="Review your booking"
        description="Double-check the details before confirming."
      />
      <dl className="divide-y divide-[var(--color-ink-200)] rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white">
        <ReviewSummaryRow label="Name" value={customerName || '—'} />
        <ReviewSummaryRow label="Shop" value={selectedShopLabel} />
        <ReviewSummaryRow label="Vehicle" value={selectedVehicleLabel || '—'} />
        <ReviewSummaryRow
          label="Service"
          value={`${selectedServiceLabel} · ${selectedServiceDurationLabel}`}
        />
        <ReviewSummaryRow label="Address" value={addressDisplay} />
        <ReviewSummaryRow label="Date and time" value={formattedDateTime} />
        <ReviewSummaryRow
          label="Notes"
          value={
            customerNotesPreview.length > 0
              ? customerNotesPreview
              : 'No notes added'
          }
        />
        <ReviewSummaryRow
          label="Estimated price"
          value={selectedServicePriceLabel}
          emphasize
        />
      </dl>
      <p className="text-xs text-[var(--color-ink-500)]">
        Once confirmed, your booking will be pending until a worker is assigned.
        You'll get realtime updates on the home screen.
      </p>
    </Card>
  )
}

interface ReviewSummaryRowProps {
  readonly label: string
  readonly value: string
  readonly emphasize?: boolean
}

function ReviewSummaryRow({
  label,
  value,
  emphasize,
}: ReviewSummaryRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-500)]">
        {label}
      </dt>
      <dd
        className={joinClassNames(
          'text-right text-sm',
          emphasize
            ? 'font-bold text-[var(--color-brand-700)]'
            : 'font-semibold text-[var(--color-ink-900)]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

interface StepHeaderProps {
  readonly title: string
  readonly description: string
}

function StepHeader({ title, description }: StepHeaderProps): ReactElement {
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-bold text-[var(--color-ink-900)]">{title}</h2>
      <p className="text-sm text-[var(--color-ink-500)]">{description}</p>
    </header>
  )
}

interface StickyMobileBookingBarProps {
  readonly currentStepIndex: number
  readonly totalStepCount: number
  readonly isFirstStep: boolean
  readonly isLastStep: boolean
  readonly isSubmittingBooking: boolean
  readonly selectedServicePriceLabel: string
  readonly onBackClicked: () => void
  readonly onContinueClicked: () => void
  readonly onConfirmClicked: () => void
}

function StickyMobileBookingBar({
  currentStepIndex,
  totalStepCount,
  isFirstStep,
  isLastStep,
  isSubmittingBooking,
  selectedServicePriceLabel,
  onBackClicked,
  onContinueClicked,
  onConfirmClicked,
}: StickyMobileBookingBarProps): ReactElement {
  return (
    <div className="fixed inset-x-0 bottom-14 z-30 border-t border-[var(--color-ink-200)] bg-white/95 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-500)]">
            Step {currentStepIndex + 1} of {totalStepCount}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
            {selectedServicePriceLabel || 'Estimating…'}
          </p>
        </div>
        {!isFirstStep ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onBackClicked}
            disabled={isSubmittingBooking}
            leadingIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        ) : null}
        {isLastStep ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onConfirmClicked}
            isLoading={isSubmittingBooking}
          >
            Confirm
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onContinueClicked}
            trailingIcon={<ArrowRight className="h-4 w-4" />}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}
