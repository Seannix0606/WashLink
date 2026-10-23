import type { ReactElement } from 'react'
import type { RosterLinkEntry } from '../../../domain/models/RosterLink'
import { Select } from '../../design/ui'

interface WorkerRosterEntryPickerProps {
  readonly rosterLinkEntries: readonly RosterLinkEntry[]
  readonly selectedWorkerRowIdentifier: string
  readonly onRosterEntrySelected: (workerRowIdentifier: string) => void
}

function describeRosterEntry(rosterLinkEntry: RosterLinkEntry): string {
  return rosterLinkEntry.ownerShopNames.length > 0
    ? `${rosterLinkEntry.ownerShopNames.join(', ')} (as ${rosterLinkEntry.rosterDisplayName})`
    : rosterLinkEntry.rosterDisplayName
}

/** Shown only when the account is linked to more than one shop roster. */
export function WorkerRosterEntryPicker({
  rosterLinkEntries,
  selectedWorkerRowIdentifier,
  onRosterEntrySelected,
}: WorkerRosterEntryPickerProps): ReactElement | null {
  if (rosterLinkEntries.length <= 1) {
    return null
  }
  return (
    <Select
      name="selectedRosterEntry"
      label="Show jobs for"
      options={rosterLinkEntries.map((rosterLinkEntry) => ({
        value: rosterLinkEntry.workerRowIdentifier,
        label: describeRosterEntry(rosterLinkEntry),
      }))}
      value={selectedWorkerRowIdentifier}
      onChange={(changeEvent): void => {
        onRosterEntrySelected(changeEvent.target.value)
      }}
    />
  )
}
