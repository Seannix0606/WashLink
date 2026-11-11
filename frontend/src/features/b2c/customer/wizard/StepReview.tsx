import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatManilaDateTime, formatPesos, vehicleCategoryLabel, type BookingQuote } from '@washlink/shared'
import { LocationPickerMap } from '../../../../presentation/components/shared/LocationPickerMap'
import { Button, Card, Skeleton } from '../../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import type { StepProps } from './BookingWizard'

interface StepReviewProps extends StepProps {
  readonly submissionKey: string
  readonly onEditStep: (step: number) => void
  readonly onDone: () => void
}

function Row({ label, step, onEdit, children }: { readonly label: string; readonly step: number; readonly onEdit: (step: number) => void; readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-xs text-[var(--color-ink-500)]">{label}</dt>
        <dd className="text-sm text-[var(--color-ink-900)] [overflow-wrap:anywhere]">{children}</dd>
      </div>
      <button type="button" aria-label={`Edit ${label.toLowerCase()}`} className="min-h-11 shrink-0 px-2 text-sm font-medium text-[var(--color-brand-700)] underline"
        onClick={(): void => { onEdit(step) }}>
        Edit
      </button>
    </div>
  )
}

/** The total shown is the server's quote; the server calculates it again when the booking is created. */
export function StepReview({ draft, services, addons, submissionKey, onEditStep, onDone }: StepReviewProps): ReactElement {
  const [quote, setQuote] = useState<(BookingQuote & { readonly priceIsDraft: boolean }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const service = services.find((candidate) => candidate.id === draft.serviceId)
  const chosenAddons = addons.filter((addon) => draft.addonIds.includes(addon.id))

  useEffect(() => {
    if (draft.serviceId === null) {
      return
    }
    let isCurrent = true
    getB2cApi().quote(draft.serviceId, draft.vehicleCategory, draft.addonIds)
      .then((next) => { if (isCurrent) { setQuote(next) } })
      .catch((caught: unknown) => { if (isCurrent) { setError(errorMessage(caught)) } })
    return (): void => { isCurrent = false }
  }, [draft.serviceId, draft.vehicleCategory, draft.addonIds])

  const confirm = async (): Promise<void> => {
    if (draft.serviceId === null || draft.latitude === null || draft.longitude === null) {
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const booking = await getB2cApi().createBooking({
        serviceId: draft.serviceId, vehicleCategory: draft.vehicleCategory, vehicleMake: draft.vehicleMake.trim(),
        vehicleModel: draft.vehicleModel.trim(), vehicleYear: null, addonIds: draft.addonIds, address: draft.address.trim(),
        latitude: draft.latitude, longitude: draft.longitude, landmark: draft.landmark.trim(), instructions: draft.instructions.trim(),
        isImmediate: draft.isImmediate, scheduledAt: draft.scheduledAt, submissionKey,
      })
      toast.success(`Booking ${booking.reference} received`)
      onDone()
    } catch (caught) {
      // Nothing is shown as booked unless the server confirmed it. Retrying reuses the key, so it cannot double-book.
      setError(errorMessage(caught))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="review-title" className="space-y-4">
      <h2 id="review-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Review your booking</h2>
      <Card className="px-4 py-1">
        <dl className="divide-y divide-[var(--color-ink-100)]">
          <Row label="Time" step={0} onEdit={onEditStep}>{draft.isImmediate || draft.scheduledAt === null ? 'As soon as possible' : formatManilaDateTime(draft.scheduledAt)}</Row>
          <Row label="Location" step={1} onEdit={onEditStep}>
            {draft.address}
            {draft.landmark !== '' ? <><br />Landmark: {draft.landmark}</> : null}
            {draft.instructions !== '' ? <><br />Instructions: {draft.instructions}</> : null}
          </Row>
          <Row label="Service" step={2} onEdit={onEditStep}>
            {service?.name}{chosenAddons.length > 0 ? ` with ${chosenAddons.map((addon) => addon.name).join(', ')}` : ''}
          </Row>
          <Row label="Vehicle" step={3} onEdit={onEditStep}>{draft.vehicleMake} {draft.vehicleModel}, {vehicleCategoryLabel[draft.vehicleCategory]}</Row>
        </dl>
      </Card>
      {draft.latitude !== null && draft.longitude !== null ? (
        <LocationPickerMap
          pickedLocation={{ latitude: draft.latitude, longitude: draft.longitude }}
          onPickedLocationChanged={(): void => undefined}
          heightClassName="h-44"
          zoomLevel={16}
          overlayTitle="Your washer comes here"
          overlayHint="To move the pin, edit the location above."
        />
      ) : null}
      {quote === null && error === null ? <Skeleton heightClassName="h-28" /> : null}
      {quote !== null ? (
        <Card className="space-y-1.5 p-4 text-sm tabular-nums text-[var(--color-ink-700)]">
          <div className="flex justify-between"><span>Service</span><span>{formatPesos(quote.basePriceCents)}</span></div>
          <div className="flex justify-between"><span>Vehicle size</span><span>{formatPesos(quote.vehicleAdjustmentCents)}</span></div>
          <div className="flex justify-between"><span>Add-ons</span><span>{formatPesos(quote.addonsTotalCents)}</span></div>
          <div className="flex justify-between border-t border-[var(--color-card-border)] pt-2 text-base font-semibold text-[var(--color-ink-900)]">
            <span>Total, pay in cash</span><span>{formatPesos(quote.customerTotalCents)}</span>
          </div>
          <p className="text-xs text-[var(--color-ink-500)]">About {quote.durationMinutes} minutes. You pay your washer when the job is done.</p>
          {quote.priceIsDraft ? <p className="text-[var(--color-warning-600)]">WashLink has not set final prices for this service yet, so it cannot be booked.</p> : null}
        </Card>
      ) : null}
      {error !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p> : null}
      <Button isFullWidth size="lg" isLoading={isSubmitting} disabled={quote === null || quote.priceIsDraft} onClick={(): void => void confirm()}>
        Confirm booking
      </Button>
    </section>
  )
}
