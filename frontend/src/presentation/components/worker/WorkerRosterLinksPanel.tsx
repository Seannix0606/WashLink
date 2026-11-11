import type { ReactElement } from 'react'
import { useState } from 'react'
import { Link2Off, Plus, Store } from 'lucide-react'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import type { RosterLinkEntry } from '../../../domain/models/RosterLink'
import { Button, Card } from '../../design/ui'
import { RosterLinkCodeForm } from './RosterLinkCodeForm'
import { rosterLinkRecordNotice } from '../../utilities/rosterLinkResultDisplay'

interface WorkerRosterLinksPanelProps {
  readonly rosterLinkEntries: readonly RosterLinkEntry[]
  readonly unlinkingWorkerRowIdentifier: string | null
  readonly rosterLinkService: RosterLinkService
  readonly onUnlinkRosterEntry: (workerRowIdentifier: string) => void
  readonly onRosterLinked: () => void
}

export function WorkerRosterLinksPanel({
  rosterLinkEntries,
  unlinkingWorkerRowIdentifier,
  rosterLinkService,
  onUnlinkRosterEntry,
  onRosterLinked,
}: WorkerRosterLinksPanelProps): ReactElement {
  const [isLinkFormOpen, setIsLinkFormOpen] = useState<boolean>(false)

  return (
    <Card elevation="flat" className="space-y-4" aria-labelledby="worker-roster-links-heading">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="worker-roster-links-heading"
            className="text-base font-semibold text-[var(--color-ink-900)]"
          >
            My shop rosters
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            {rosterLinkRecordNotice}
          </p>
        </div>
        {!isLinkFormOpen ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={(): void => {
              setIsLinkFormOpen(true)
            }}
          >
            Link another
          </Button>
        ) : null}
      </header>

      <ul className="space-y-2">
        {rosterLinkEntries.map((rosterLinkEntry) => (
          <li
            key={rosterLinkEntry.workerRowIdentifier}
            className="flex flex-col gap-2 rounded-[var(--radius-surface)] border border-[var(--color-card-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-ink-900)]">
                {rosterLinkEntry.rosterDisplayName}
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)]">
                <Store className="h-3.5 w-3.5" aria-hidden="true" />
                {rosterLinkEntry.ownerShopNames.length > 0
                  ? rosterLinkEntry.ownerShopNames.join(', ')
                  : 'No verified, active shop yet'}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Link2Off className="h-4 w-4" />}
              isLoading={unlinkingWorkerRowIdentifier === rosterLinkEntry.workerRowIdentifier}
              aria-label={`Unlink from ${rosterLinkEntry.rosterDisplayName}`}
              className="text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
              onClick={(): void => {
                if (
                  window.confirm(
                    'Unlink your account from this shop roster? The shop will no longer be able to assign bookings to you.',
                  )
                ) {
                  onUnlinkRosterEntry(rosterLinkEntry.workerRowIdentifier)
                }
              }}
            >
              Unlink
            </Button>
          </li>
        ))}
      </ul>

      {isLinkFormOpen ? (
        <RosterLinkCodeForm
          rosterLinkService={rosterLinkService}
          onRosterLinked={(): void => {
            setIsLinkFormOpen(false)
            onRosterLinked()
          }}
        />
      ) : null}
    </Card>
  )
}
