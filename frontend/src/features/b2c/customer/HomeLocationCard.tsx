import type { ReactElement } from 'react'
import { lazy, Suspense, useState } from 'react'
import { toast } from 'sonner'
import { House, MapPin } from 'lucide-react'
import { completeHomeLocation, emptyHomeLocationDraft, homeLocationProblem, type HomeLocationDraft } from '@washlink/shared'
import { Button, Card, Modal, Skeleton } from '../../../presentation/design/ui'
import { errorMessage } from '../b2cApiClient'
import { useHomeAddress } from './useHomeAddress'

const HomeLocationField = lazy(async () => ({ default: (await import('./HomeLocationField')).HomeLocationField }))

interface HomeLocationCardProps {
  readonly customerId: string
  /** Called after the home location is saved, so lists showing addresses can reload. */
  readonly onSaved?: () => void
}

/** Shows where the customer's car is usually washed, and lets them set or move it. */
export function HomeLocationCard({ customerId, onSaved }: HomeLocationCardProps): ReactElement {
  const { home, error, saveHome } = useHomeAddress(customerId)
  const [draft, setDraft] = useState<HomeLocationDraft | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const open = (): void => {
    setProblem(null)
    setDraft(home === null || home === undefined ? emptyHomeLocationDraft : { address: home.address, latitude: home.latitude, longitude: home.longitude })
  }

  const save = async (): Promise<void> => {
    if (draft === null) {
      return
    }
    const nextProblem = homeLocationProblem(draft)
    const location = completeHomeLocation(draft)
    setProblem(nextProblem)
    if (location === null) {
      return
    }
    setIsSaving(true)
    try {
      await saveHome(location)
      toast.success('Home location saved')
      setDraft(null)
      onSaved?.()
    } catch (caught) {
      setProblem(errorMessage(caught))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
          <House className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-ink-900)]">Your home location</p>
          {home === undefined ? <Skeleton heightClassName="h-4" widthClassName="w-48" className="mt-1" /> : null}
          {home === null ? <p className="text-sm text-[var(--color-ink-500)]">Not set yet. Set it and every booking starts from there.</p> : null}
          {home !== null && home !== undefined ? (
            <p className="flex items-start gap-1 text-sm text-[var(--color-ink-700)] [overflow-wrap:anywhere]">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {home.address}
            </p>
          ) : null}
          {error !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{error}</p> : null}
        </div>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0" disabled={home === undefined} onClick={open}>
        {home === null ? 'Set home location' : 'Change'}
      </Button>
      <Modal isOpen={draft !== null} onClose={(): void => { setDraft(null) }} title="Your home location" maxWidthClassName="max-w-lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={(): void => { setDraft(null) }}>Cancel</Button>
            <Button variant="primary" isLoading={isSaving} onClick={(): void => void save()}>Save home</Button>
          </div>
        )}>
        <p className="mb-3 text-sm text-[var(--color-ink-500)]">Where you usually want your car washed. Bookings start here, and you can still choose another place each time.</p>
        {draft !== null ? (
          <Suspense fallback={<Skeleton heightClassName="h-56" />}>
            <HomeLocationField value={draft} onChange={(next): void => { setDraft(next); setProblem(null) }} addressLabel="Home address" />
          </Suspense>
        ) : null}
        {problem !== null ? <p role="alert" className="mt-2 text-sm text-[var(--color-danger-600)]">{problem}</p> : null}
      </Modal>
    </Card>
  )
}
