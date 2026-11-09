import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ScrollView, View } from 'react-native'
import {
  bookingStepProblem,
  bookingStepTitles,
  createBookingSubmissionKey,
  emptyBookingDraft,
  formatManilaDateTime,
  formatManilaTime,
  formatPesos,
  upcomingManilaDates,
  customerVehicleCategories,
  vehicleCategoryLabel,
  type BookingDraft,
  type BookingQuote,
  type CatalogAddon,
  type CatalogService,
  type SavedAddress,
  type SavedVehicle,
  type TimeSlot,
} from '@washlink/shared'
import { useUserId } from '../src/lib/AuthProvider'
import { api, errorMessage } from '../src/lib/api'
import { lookUpAddress, searchAddress } from '../src/lib/geocoding'
import { Body, Button, Card, Choice, Field, Heading, Notice, Row, Screen, Title } from '../src/ui'
import { PinMap } from '../src/ui/PinMap'

interface StepProps {
  readonly draft: BookingDraft
  readonly update: (patch: Partial<BookingDraft>) => void
  readonly services: readonly CatalogService[]
  readonly addons: readonly CatalogAddon[]
  readonly customerId: string
}

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' })
}

function StepWhen({ draft, update, services }: StepProps): ReactElement {
  const dates = useMemo(() => upcomingManilaDates(14), [])
  const [date, setDate] = useState(dates[0])
  const [slots, setSlots] = useState<readonly TimeSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const probe = draft.serviceId ?? services.find((service) => service.supportedVehicles.includes(draft.vehicleCategory))?.id ?? null

  useEffect(() => {
    if (probe === null) {
      return
    }
    let isCurrent = true
    setSlots(null)
    api.availableSlots({ date, serviceId: probe, category: draft.vehicleCategory, addonIds: draft.addonIds, latitude: draft.latitude, longitude: draft.longitude })
      .then((next) => { if (isCurrent) { setSlots(next); setError(null) } })
      .catch((caught: unknown) => { if (isCurrent) { setError(errorMessage(caught)) } })
    return (): void => { isCurrent = false }
  }, [date, probe, draft.vehicleCategory, draft.addonIds, draft.latitude, draft.longitude])

  return (
    <>
      <Heading>When should we come?</Heading>
      <Choice label="As soon as possible" isSelected={draft.isImmediate} onPress={(): void => { update({ isImmediate: true, scheduledAt: null }) }} />
      <Body>Or choose a date</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {dates.map((value) => <Choice key={value} label={dateLabel(value)} isSelected={value === date} onPress={(): void => { setDate(value) }} />)}
      </ScrollView>
      <Notice tone="error" message={error} />
      {slots?.length === 0 ? <Body muted>No washers on this day. Try another date, or book for as soon as possible.</Body> : null}
      {slots !== null && slots.length > 0 && slots.every((slot) => !slot.isAvailable) ? <Body muted>Every time on this day has passed or is taken. Try another date.</Body> : null}
      <Row>
        {slots?.map((slot) => (
          <Choice key={slot.startsAt} label={formatManilaTime(slot.startsAt)} isDisabled={!slot.isAvailable} isSelected={draft.scheduledAt === slot.startsAt}
            onPress={(): void => { update({ isImmediate: false, scheduledAt: slot.startsAt }) }} />
        ))}
      </Row>
    </>
  )
}

function StepWhere({ draft, update, customerId }: StepProps): ReactElement {
  const [saved, setSaved] = useState<readonly SavedAddress[]>([])
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => { api.listAddresses().then(setSaved).catch(() => { setSaved([]) }) }, [])

  const pin = async (latitude: number, longitude: number): Promise<void> => {
    update({ latitude, longitude })
    const address = await lookUpAddress(latitude, longitude).catch(() => null)
    if (address === null) {
      setNotice('The address could not be looked up. Type the full address below; your pin is kept.')
    } else {
      update({ address })
    }
  }

  const search = async (): Promise<void> => {
    const place = await searchAddress(query.trim()).catch(() => null)
    if (place === null) {
      setNotice('No match found. Move the pin on the map or type the address yourself.')
      return
    }
    update({ latitude: place.latitude, longitude: place.longitude, address: place.displayAddress })
    setNotice('Check the pin and move it if needed.')
  }

  const useMyLocation = async (): Promise<void> => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) {
      setNotice('Location permission was not given. Search or move the pin instead.')
      return
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      await pin(position.coords.latitude, position.coords.longitude)
      setNotice('Your current location is only a starting point. Confirm it is where the car will be.')
    } catch {
      setNotice('Your location could not be found. Search or move the pin instead.')
    }
  }

  const saveAddress = async (): Promise<void> => {
    if (draft.latitude === null || draft.longitude === null) {
      setNotice('Pin the location first.')
      return
    }
    try {
      await api.saveAddress(customerId, { label: 'Saved place', address: draft.address.trim(), latitude: draft.latitude, longitude: draft.longitude, landmark: draft.landmark.trim(), instructions: draft.instructions.trim() })
      setIsSaved(true)
    } catch (caught) {
      setNotice(errorMessage(caught))
    }
  }

  return (
    <>
      <Heading>Where is the vehicle?</Heading>
      <Row>
        {saved.map((address) => (
          <Button key={address.id} label={address.label} variant="secondary"
            onPress={(): void => { update({ address: address.address, latitude: address.latitude, longitude: address.longitude, landmark: address.landmark, instructions: address.instructions }) }} />
        ))}
      </Row>
      <Field label="Search for an address" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={(): void => void search()} />
      <Row>
        <Button label="Search" variant="secondary" isDisabled={query.trim().length < 3} onPress={(): void => void search()} />
        <Button label="Use my location" variant="secondary" onPress={(): void => void useMyLocation()} />
      </Row>
      <PinMap latitude={draft.latitude} longitude={draft.longitude} onPick={(latitude, longitude): void => void pin(latitude, longitude)} />
      <Body muted>Tap the map or drag the pin to the exact spot.</Body>
      <Notice message={notice} />
      <Field label="Full address" value={draft.address} multiline onChangeText={(address): void => { update({ address }) }} />
      <Field label="Landmark (optional)" value={draft.landmark} maxLength={120} onChangeText={(landmark): void => { update({ landmark }) }} />
      <Field label="Instructions for your washer (optional)" helper="For example, the gate code or parking level." value={draft.instructions} maxLength={500} onChangeText={(instructions): void => { update({ instructions }) }} />
      <Button label={isSaved ? 'Address saved' : 'Save this address'} variant="ghost" isDisabled={isSaved} onPress={(): void => void saveAddress()} />
    </>
  )
}

function StepService({ draft, update, services, addons }: StepProps): ReactElement {
  return (
    <>
      <Heading>Choose a service</Heading>
      {services.map((service) => (
        <Choice key={service.id} label={service.name} isSelected={draft.serviceId === service.id}
          detail={`${service.priceIsDraft ? 'Price not set' : `From ${formatPesos(service.basePriceCents)}`} · about ${String(service.durationMinutes)} min. ${service.description}`}
          onPress={(): void => { update({ serviceId: service.id }) }} />
      ))}
      {addons.length > 0 ? <Heading>Add-ons (optional)</Heading> : null}
      {addons.map((addon) => {
        const isChosen = draft.addonIds.includes(addon.id)
        return (
          <Choice key={addon.id} isCheckbox label={addon.name} isSelected={isChosen} detail={addon.priceIsDraft ? 'Price not set' : `+${formatPesos(addon.priceCents)}`}
            onPress={(): void => { update({ addonIds: isChosen ? draft.addonIds.filter((id) => id !== addon.id) : [...draft.addonIds, addon.id] }) }} />
        )
      })}
    </>
  )
}

function StepVehicle({ draft, update, services, customerId }: StepProps): ReactElement {
  const [saved, setSaved] = useState<readonly SavedVehicle[]>([])
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const service = services.find((candidate) => candidate.id === draft.serviceId)
  useEffect(() => { api.listVehicles().then(setSaved).catch(() => { setSaved([]) }) }, [])

  return (
    <>
      <Heading>Which vehicle?</Heading>
      <Row>
        {saved.map((vehicle) => (
          <Button key={vehicle.id} label={`${vehicle.make} ${vehicle.model}`} variant="secondary"
            onPress={(): void => { update({ vehicleCategory: vehicle.category, vehicleMake: vehicle.make, vehicleModel: vehicle.model }) }} />
        ))}
      </Row>
      <Row>
        {customerVehicleCategories.map((category) => (
          <Choice key={category} label={vehicleCategoryLabel[category]} isSelected={draft.vehicleCategory === category} isDisabled={service !== undefined && !service.supportedVehicles.includes(category)}
            onPress={(): void => { update({ vehicleCategory: category }) }} />
        ))}
      </Row>
      <Field label="Make" value={draft.vehicleMake} maxLength={60} onChangeText={(vehicleMake): void => { update({ vehicleMake }) }} />
      <Field label="Model" value={draft.vehicleModel} maxLength={60} onChangeText={(vehicleModel): void => { update({ vehicleModel }) }} />
      <Notice tone="error" message={error} />
      <Button label={isSaved ? 'Vehicle saved' : 'Save this vehicle'} variant="ghost" isDisabled={isSaved}
        onPress={(): void => {
          api.saveVehicle(customerId, { category: draft.vehicleCategory, make: draft.vehicleMake.trim(), model: draft.vehicleModel.trim(), year: null })
            .then(() => { setIsSaved(true) })
            .catch((caught: unknown) => { setError(errorMessage(caught)) })
        }} />
    </>
  )
}

function StepReview({ draft, services, addons, submissionKey, onEdit, onDone }: StepProps & { readonly submissionKey: string; readonly onEdit: (step: number) => void; readonly onDone: () => void }): ReactElement {
  const [quote, setQuote] = useState<(BookingQuote & { readonly priceIsDraft: boolean }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const service = services.find((candidate) => candidate.id === draft.serviceId)
  const chosen = addons.filter((addon) => draft.addonIds.includes(addon.id))

  useEffect(() => {
    if (draft.serviceId !== null) {
      api.quote(draft.serviceId, draft.vehicleCategory, draft.addonIds).then(setQuote).catch((caught: unknown) => { setError(errorMessage(caught)) })
    }
  }, [draft.serviceId, draft.vehicleCategory, draft.addonIds])

  const confirm = async (): Promise<void> => {
    if (draft.serviceId === null || draft.latitude === null || draft.longitude === null) {
      return
    }
    setIsBusy(true)
    setError(null)
    try {
      await api.createBooking({
        serviceId: draft.serviceId, vehicleCategory: draft.vehicleCategory, vehicleMake: draft.vehicleMake.trim(), vehicleModel: draft.vehicleModel.trim(), vehicleYear: null,
        addonIds: draft.addonIds, address: draft.address.trim(), latitude: draft.latitude, longitude: draft.longitude, landmark: draft.landmark.trim(), instructions: draft.instructions.trim(),
        isImmediate: draft.isImmediate, scheduledAt: draft.scheduledAt, submissionKey,
      })
      onDone()
    } catch (caught) {
      // A retry reuses the key, so an interrupted request can't create a second booking.
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }

  const rows: readonly (readonly [string, string, number])[] = [
    ['Time', draft.isImmediate || draft.scheduledAt === null ? 'As soon as possible' : formatManilaDateTime(draft.scheduledAt), 0],
    ['Location', [draft.address, draft.landmark && `Landmark: ${draft.landmark}`, draft.instructions && `Instructions: ${draft.instructions}`].filter(Boolean).join('\n'), 1],
    ['Service', `${service?.name ?? ''}${chosen.length > 0 ? ` with ${chosen.map((addon) => addon.name).join(', ')}` : ''}`, 2],
    ['Vehicle', `${draft.vehicleMake} ${draft.vehicleModel}, ${vehicleCategoryLabel[draft.vehicleCategory]}`, 3],
  ]
  return (
    <>
      <Heading>Review your booking</Heading>
      {rows.map(([label, value, step]) => (
        <Card key={label}>
          <Body muted>{label}</Body>
          <Body>{value}</Body>
          <Button label={`Edit ${label.toLowerCase()}`} variant="ghost" onPress={(): void => { onEdit(step) }} />
        </Card>
      ))}
      <PinMap latitude={draft.latitude} longitude={draft.longitude} height={160} />
      {quote !== null ? (
        <Card>
          <Body>Service: {formatPesos(quote.basePriceCents)}</Body>
          <Body>Vehicle size: {formatPesos(quote.vehicleAdjustmentCents)}</Body>
          <Body>Add-ons: {formatPesos(quote.addonsTotalCents)}</Body>
          <Heading>Total, pay in cash: {formatPesos(quote.customerTotalCents)}</Heading>
          <Body muted>About {quote.durationMinutes} minutes. You pay your washer when the job is done.</Body>
          {quote.priceIsDraft ? <Notice tone="error" message="WashLink has not set final prices for this service yet, so it cannot be booked." /> : null}
        </Card>
      ) : null}
      <Notice tone="error" message={error} />
      <Button label="Confirm booking" isLoading={isBusy} isDisabled={quote === null || quote.priceIsDraft} onPress={(): void => void confirm()} />
    </>
  )
}

export default function BookingWizard(): ReactElement {
  const router = useRouter()
  const customerId = useUserId()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<BookingDraft>(emptyBookingDraft)
  const [services, setServices] = useState<readonly CatalogService[] | null>(null)
  const [addons, setAddons] = useState<readonly CatalogAddon[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const submissionKey = useMemo(() => createBookingSubmissionKey(`${String(Date.now())}-${Math.random().toString(36).slice(2)}`), [])

  useEffect(() => {
    Promise.all([api.listServices(), api.listAddons()])
      .then(([nextServices, nextAddons]) => { setServices(nextServices); setAddons(nextAddons) })
      .catch((caught: unknown) => { setProblem(errorMessage(caught)) })
  }, [])

  const stepProps: StepProps | null = services === null ? null : {
    draft, services, addons, customerId, update: (patch): void => { setDraft((current) => ({ ...current, ...patch })) },
  }
  const leave = (): void => { if (router.canGoBack()) { router.back() } else { router.replace('/') } }

  return (
    <Screen>
      <Button label="Leave booking" variant="ghost" onPress={leave} />
      <Title>Book a car wash</Title>
      <Body muted>Step {step + 1} of {bookingStepTitles.length}: {bookingStepTitles[step]}</Body>
      {stepProps !== null && step === 0 ? <StepWhen {...stepProps} /> : null}
      {stepProps !== null && step === 1 ? <StepWhere {...stepProps} /> : null}
      {stepProps !== null && step === 2 ? <StepService {...stepProps} /> : null}
      {stepProps !== null && step === 3 ? <StepVehicle {...stepProps} /> : null}
      {stepProps !== null && step === 4 ? <StepReview {...stepProps} submissionKey={submissionKey} onEdit={setStep} onDone={(): void => { router.replace('/customer/bookings') }} /> : null}
      <Notice tone="error" message={problem} />
      {step < 4 ? (
        <View style={{ gap: 8 }}>
          <Button label="Continue" onPress={(): void => {
            const next = bookingStepProblem(step, draft)
            setProblem(next)
            if (next === null) { setStep(step + 1) }
          }} />
          {step > 0 ? <Button label="Back" variant="secondary" onPress={(): void => { setProblem(null); setStep(step - 1) }} /> : null}
        </View>
      ) : null}
    </Screen>
  )
}
