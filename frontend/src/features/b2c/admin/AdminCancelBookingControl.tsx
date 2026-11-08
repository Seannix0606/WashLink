import type { ReactElement } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Input } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'

const minimumReasonLength = 10
const maximumReasonLength = 500

interface AdminCancelBookingControlProps {
  readonly bookingId: string
  readonly onCancelled: () => Promise<void>
}

/** Suspending a washer leaves a started job in place, so an admin decides here. The database checks the role and the reason, and audits it. */
export function AdminCancelBookingControl({ bookingId, onCancelled }: AdminCancelBookingControlProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const trimmed = reason.trim()
    if (trimmed.length < minimumReasonLength) {
      setError(`Give a reason of at least ${String(minimumReasonLength)} characters.`)
      return
    }
    setIsBusy(true)
    setError(null)
    try {
      await getB2cApi().cancelBooking(bookingId, trimmed)
      toast.success('Booking cancelled')
      setIsOpen(false)
      setReason('')
      await onCancelled()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="w-full space-y-2">
      <p className="text-xs text-[var(--color-ink-500)]">This job has started, so it needs a decision. Suspending the washer does not return it to search.</p>
      {isOpen ? (
        <>
          <Input id={`cancel-reason-${bookingId}`} label="Reason for cancelling" helperText="10 to 500 characters. Saved in the booking history." value={reason}
            maxLength={maximumReasonLength} errorText={error ?? undefined} onChange={(event): void => { setReason(event.target.value) }} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" isLoading={isBusy} onClick={(): void => void submit()}>Confirm cancel</Button>
            <Button size="sm" variant="ghost" onClick={(): void => { setIsOpen(false); setReason(''); setError(null) }}>Keep booking</Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={(): void => { setIsOpen(true) }}>Cancel booking</Button>
      )}
    </div>
  )
}
