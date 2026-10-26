import type { ReactElement } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { ContractAcceptanceRecord } from '../../../domain/models/WorkerContract'
import { Badge } from '../../design/ui'
import { shortContentHash } from '../../utilities/contractTemplateDisplay'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
import { acceptanceExplanationText, acceptanceRecordLabel } from '../../utilities/workerContractCopy'
import { partyRoleLabel } from '../../utilities/workerContractDisplay'

interface ContractAcceptanceRecordsProps {
  readonly acceptances: readonly ContractAcceptanceRecord[]
}

/** Who accepted which version (by number and fingerprint), when, and the statement they confirmed. */
export function ContractAcceptanceRecords({ acceptances }: ContractAcceptanceRecordsProps): ReactElement {
  return (
    <section aria-label="Acceptance records" className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <ClipboardCheck className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Acceptance records
      </h4>
      <p className="text-xs text-[var(--color-ink-500)]">{acceptanceExplanationText}</p>
      {acceptances.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">No acceptance is recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {acceptances.map((acceptance) => (
            <li
              key={`${acceptance.versionId}-${acceptance.partyRole}`}
              aria-label={`${partyRoleLabel[acceptance.partyRole]} acceptance of version ${String(acceptance.versionNumber)}`}
              className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{acceptance.recordLabel.length > 0 ? acceptance.recordLabel : acceptanceRecordLabel}</Badge>
                <span className="text-sm font-medium text-[var(--color-ink-900)]">
                  {`${partyRoleLabel[acceptance.partyRole]}: ${acceptance.partyName ?? 'Name not recorded'}`}
                </span>
              </div>
              <p className="text-xs text-[var(--color-ink-500)]">
                {`Version ${String(acceptance.versionNumber)} · fingerprint ${shortContentHash(acceptance.versionContentHash)} · ${formatShortDateTime(acceptance.acceptedAt)}`}
              </p>
              <p className="text-sm text-[var(--color-ink-700)]">{acceptance.statementText}</p>
              {acceptance.contractorAckText !== null ? (
                <p className="text-sm text-[var(--color-ink-700)]">{acceptance.contractorAckText}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
