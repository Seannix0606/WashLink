import type { ReactElement } from 'react'
import { ListChecks } from 'lucide-react'
import type { ContractOwnerValueKey, ContractVersionChange } from '../../../domain/models/WorkerContract'
import { amendmentCurrentTermsStayText, ownerAmendmentIntroText } from '../../utilities/workerContractCopy'
import { changeKindLabel, ownerValueLabel, type ContractViewerRole } from '../../utilities/workerContractDisplay'

interface ContractAmendmentChangesProps {
  readonly changes: readonly ContractVersionChange[]
  readonly viewerRole: ContractViewerRole
}

function describeChangeItem(change: ContractVersionChange): string {
  if (change.changeKind === 'contract_detail_changed' && change.itemKey !== null) {
    return (ownerValueLabel[change.itemKey as ContractOwnerValueKey] as string | undefined) ?? change.itemKey
  }
  if (change.heading !== null) {
    return change.sectionNumber === null ? change.heading : `Section ${String(change.sectionNumber)}: ${change.heading}`
  }
  return changeKindLabel[change.changeKind]
}

/** What a proposed change alters compared with the version in force. The current terms stay until accepted. */
export function ContractAmendmentChanges({ changes, viewerRole }: ContractAmendmentChangesProps): ReactElement {
  return (
    <section aria-label="What this change alters" className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <ListChecks className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        What this change alters
      </h4>
      <p role="note" className="rounded-[var(--radius-control)] bg-[var(--color-brand-50)] px-3 py-2 text-sm font-medium text-[var(--color-brand-800)]">
        {viewerRole === 'worker' ? amendmentCurrentTermsStayText : ownerAmendmentIntroText}
      </p>
      {changes.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">No differences from the current version were found.</p>
      ) : (
        <ul aria-label="Changes" className="space-y-2">
          {changes.map((change, changeIndex) => (
            <li key={`${change.changeKind}-${String(changeIndex)}`} className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
              <p className="text-sm font-medium text-[var(--color-ink-900)]">{`${changeKindLabel[change.changeKind]}: ${describeChangeItem(change)}`}</p>
              {change.previousText !== null ? (
                <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">
                  <span className="font-medium">Now: </span>
                  {change.previousText}
                </p>
              ) : null}
              {change.newText !== null ? (
                <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-900)]">
                  <span className="font-medium">Proposed: </span>
                  {change.newText}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
