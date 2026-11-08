import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { distanceBandLabel, formatManilaDateTime, formatPesos, vehicleCategoryLabel, type DispatchRequest } from '@washlink/shared'
import { Button, Card } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'

interface RequestCardProps {
  readonly request: DispatchRequest
  readonly onChanged: () => Promise<void>
}

/** A request never shows the address or customer; those are revealed only after this washer accepts. */
export function RequestCard({ request, onChanged }: RequestCardProps): ReactElement {
  const [isBusy, setIsBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((Date.parse(request.expiresAt) - Date.now()) / 1000)))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((Date.parse(request.expiresAt) - Date.now()) / 1000)))
    }, 1000)
    return (): void => { window.clearInterval(timer) }
  }, [request.expiresAt])

  const act = async (action: () => Promise<void>, success: string): Promise<void> => {
    setIsBusy(true)
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      await onChanged()
      setIsBusy(false)
    }
  }

  const minutes = Math.floor(secondsLeft / 60)
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold text-[var(--color-ink-900)]">{request.serviceName}</h3>
        <span className="font-semibold tabular-nums text-[var(--color-brand-800)]">You earn {formatPesos(request.workerEarningsCents)}</span>
      </div>
      <p className="text-sm text-[var(--color-ink-700)]">
        {vehicleCategoryLabel[request.vehicleCategory]} · {request.isImmediate ? 'As soon as possible' : formatManilaDateTime(request.scheduledAt)} · about {request.durationMinutes} min
        {request.distanceKm !== null ? ` · ${distanceBandLabel(request.distanceKm)}` : ''}
      </p>
      {request.addonNames.length > 0 ? <p className="text-sm text-[var(--color-ink-700)]">Add-ons: {request.addonNames.join(', ')}</p> : null}
      <p className="text-xs tabular-nums text-[var(--color-ink-500)]">Reference {request.reference} · expires in {minutes}:{String(secondsLeft % 60).padStart(2, '0')}</p>
      <div className="flex gap-2">
        <Button isLoading={isBusy} disabled={secondsLeft === 0} onClick={(): void => void act(() => getB2cApi().acceptRequest(request.id), 'Booking accepted')}>Accept</Button>
        <Button variant="secondary" disabled={isBusy || secondsLeft === 0} onClick={(): void => void act(() => getB2cApi().declineRequest(request.id), 'Request declined')}>Decline</Button>
      </div>
    </Card>
  )
}
