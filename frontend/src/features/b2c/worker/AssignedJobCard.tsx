import type { ReactElement } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Navigation, Phone } from 'lucide-react'
import {
  canWorkerAdvanceNow,
  directionsUrl,
  formatManilaDateTime,
  formatPesos,
  nextWorkerActionLabel,
  nextWorkerStatus,
  serviceBookingStatusLabel,
  vehicleCategoryLabel,
  workerEarlyStepNotice,
  type AssignedBooking,
} from '@washlink/shared'
import { Badge, Button, Card, Input } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { useCurrentTime } from '../useCurrentTime'

type NoteMode = 'problem' | 'release' | 'cancel'
const noteModeLabel: Readonly<Record<NoteMode, string>> = {
  problem: 'What happened?',
  release: 'Why can\'t you do this booking?',
  cancel: 'Reason for cancelling',
}
const noteModeSuccess: Readonly<Record<NoteMode, string>> = {
  problem: 'Problem reported',
  release: 'Booking handed back',
  cancel: 'Booking cancelled',
}
const noteActions: Readonly<Record<NoteMode, (id: string, note: string) => Promise<void>>> = {
  problem: (id, note) => getB2cApi().reportProblem(id, note),
  release: (id, note) => getB2cApi().releaseBooking(id, note),
  cancel: (id, note) => getB2cApi().operatorCancelBooking(id, note),
}

interface AssignedJobCardProps {
  readonly job: AssignedBooking
  /** The server refuses every step while the account is paused, so the step is not offered as available. */
  readonly isPaused?: boolean
  /** Only a WashLink operator account may cancel; the database checks this again. Other washers hand a job back. */
  readonly canCancel?: boolean
  readonly onChanged: () => Promise<void>
}

export function AssignedJobCard({ job, isPaused = false, canCancel = false, onChanged }: AssignedJobCardProps): ReactElement {
  const [isBusy, setIsBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteMode, setNoteMode] = useState<NoteMode | null>(null)
  const canRelease = job.status === 'accepted' || job.status === 'worker_on_the_way'
  // The server has the last word; a refusal still reaches the washer through act().
  const canAdvance = canWorkerAdvanceNow(job.scheduledAt, useCurrentTime(), job.status)

  const act = async (action: () => Promise<void>, success: string): Promise<void> => {
    setIsBusy(true)
    try {
      await action()
      toast.success(success)
      setNoteMode(null)
      setNote('')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      await onChanged()
      setIsBusy(false)
    }
  }

  const actionLabel = nextWorkerActionLabel[job.status]
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--color-ink-900)]">{job.serviceName}</h3>
        <Badge tone="info">{serviceBookingStatusLabel[job.status]}</Badge>
      </div>
      <div className="space-y-1 text-sm text-[var(--color-ink-700)]">
        <p>{formatManilaDateTime(job.scheduledAt)} · about {job.durationMinutes} min</p>
        <p>{job.vehicleMake} {job.vehicleModel}, {vehicleCategoryLabel[job.vehicleCategory]}</p>
        {job.addonNames.length > 0 ? <p>Add-ons: {job.addonNames.join(', ')}</p> : null}
        <p className="font-medium text-[var(--color-ink-900)] [overflow-wrap:anywhere]">{job.address}</p>
        {job.landmark ? <p>Landmark: {job.landmark}</p> : null}
        {job.instructions ? <p>Instructions: {job.instructions}</p> : null}
        {job.customerName ? <p>Customer: {job.customerName}</p> : null}
        <p className="tabular-nums">Collect {formatPesos(job.customerTotalCents)} in cash. You earn {formatPesos(job.workerEarningsCents)}.</p>
      </div>
      {actionLabel !== undefined && !canAdvance ? <p className="text-sm text-[var(--color-ink-700)]">{workerEarlyStepNotice(job.status)}</p> : null}
      <div className="flex flex-wrap gap-2">
        {actionLabel !== undefined ? (
          <Button isLoading={isBusy} disabled={isBusy || !canAdvance || isPaused} onClick={(): void => void act(() => getB2cApi().advanceBooking(job.id, job.status), nextWorkerStatus(job.status) === 'completed' ? 'Booking completed' : 'Status updated')}>
            {actionLabel}
          </Button>
        ) : null}
        {job.latitude !== null && job.longitude !== null ? (
          <a className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-ink-300)] bg-[var(--color-card)] px-4 text-sm font-medium text-[var(--color-ink-900)]"
            href={directionsUrl(job.latitude, job.longitude)} target="_blank" rel="noreferrer">
            <Navigation className="h-4 w-4" aria-hidden="true" />Navigate
          </a>
        ) : null}
        {job.customerPhone ? (
          <a className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-ink-300)] bg-[var(--color-card)] px-4 text-sm font-medium text-[var(--color-ink-900)]" href={`tel:${job.customerPhone}`}>
            <Phone className="h-4 w-4" aria-hidden="true" />Call customer
          </a>
        ) : null}
      </div>
      {noteMode === null ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={(): void => { setNoteMode('problem') }}>Report a problem</Button>
          {canRelease && !canCancel ? <Button size="sm" variant="ghost" onClick={(): void => { setNoteMode('release') }}>I can&apos;t do this booking</Button> : null}
          {canCancel && !isPaused ? <Button size="sm" variant="ghost" onClick={(): void => { setNoteMode('cancel') }}>Cancel booking</Button> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <Input label={noteModeLabel[noteMode]} helperText={noteMode === 'cancel' ? '10 to 500 characters. The customer is told the booking was cancelled.' : '10 to 500 characters.'} value={note} maxLength={500} onChange={(event): void => { setNote(event.target.value) }} />
          <div className="flex gap-2">
            <Button size="sm" variant={noteMode === 'cancel' ? 'danger' : 'primary'} isLoading={isBusy} onClick={(): void => void act(
              () => noteActions[noteMode](job.id, note),
              noteModeSuccess[noteMode],
            )}>{noteMode === 'cancel' ? 'Cancel booking' : 'Send'}</Button>
            <Button size="sm" variant="ghost" onClick={(): void => { setNoteMode(null) }}>Back</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
