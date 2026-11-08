import type { ReactElement } from 'react'
import { Copy, KeyRound, X } from 'lucide-react'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import { Button, IconButton } from '../../design/ui'
import { useOwnerRosterLinkCode } from '../../hooks/useOwnerRosterLinkCode'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'

interface OwnerRosterLinkCodeButtonProps {
  readonly rosterLinkService: RosterLinkService
  readonly workerRowIdentifier: string
  readonly workerName: string
}

/** For unlinked roster rows: issue a one-time code the worker enters to link their account. */
export function OwnerRosterLinkCodeButton({
  rosterLinkService,
  workerRowIdentifier,
  workerName,
}: OwnerRosterLinkCodeButtonProps): ReactElement {
  const {
    issuedRosterLinkCode,
    isIssuingRosterLinkCode,
    issueRosterLinkCode,
    copyIssuedRosterLinkCode,
    dismissIssuedRosterLinkCode,
  } = useOwnerRosterLinkCode(rosterLinkService, workerRowIdentifier)

  if (issuedRosterLinkCode === null) {
    return (
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<KeyRound className="h-4 w-4" />}
        isLoading={isIssuingRosterLinkCode}
        aria-label={`Get a link code for ${workerName}`}
        onClick={(): void => {
          void issueRosterLinkCode()
        }}
      >
        Link code
      </Button>
    )
  }

  return (
    <div
      role="status"
      className="w-full space-y-2 rounded-[var(--radius-control)] border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--color-ink-700)]">
          Give this code to {workerName}. It is shown only once and works until{' '}
          {formatShortDateTime(issuedRosterLinkCode.expiresAt)}.
        </p>
        <IconButton
          size="sm"
          accessibleLabel="Hide link code"
          icon={<X className="h-4 w-4" />}
          onClick={dismissIssuedRosterLinkCode}
        />
      </div>
      <div className="flex items-center gap-2">
        <code className="select-all rounded bg-white px-2 py-1 font-mono text-base font-semibold tracking-widest text-[var(--color-ink-900)]">
          {issuedRosterLinkCode.linkCode}
        </code>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Copy className="h-4 w-4" />}
          onClick={(): void => {
            void copyIssuedRosterLinkCode()
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  )
}
