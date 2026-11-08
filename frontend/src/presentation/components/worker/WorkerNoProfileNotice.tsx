import type { ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import { Card } from '../../design/ui'
import { RosterLinkCodeForm } from './RosterLinkCodeForm'

interface WorkerNoProfileNoticeProps {
  readonly rosterLinkService: RosterLinkService
  readonly onRosterLinked: () => void
}

/** Shown when the account is not linked to any shop roster yet. */
export function WorkerNoProfileNotice({
  rosterLinkService,
  onRosterLinked,
}: WorkerNoProfileNoticeProps): ReactElement {
  return (
    <Card elevation="flat" className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning-50)] text-[var(--color-warning-600)]">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-ink-900)]">
            Not linked to a shop roster yet
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-700)]">
            Bookings appear here once a shop owner adds you to their roster and you link
            your account. Ask the owner for a link code and enter it below.
          </p>
        </div>
      </div>
      <RosterLinkCodeForm
        rosterLinkService={rosterLinkService}
        onRosterLinked={onRosterLinked}
      />
    </Card>
  )
}
