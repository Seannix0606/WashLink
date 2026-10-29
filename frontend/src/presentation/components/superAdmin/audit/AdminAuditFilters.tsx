import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { Search } from 'lucide-react'
import { emptyAdminAuditLogFilterInput, type AdminAuditLogFilterInput } from '../../../../application/services/AdminOversightService'
import { Button, Input } from '../../../design/ui'
import { auditSearchLabel } from '../../../utilities/adminOversightCopy'

interface AdminAuditFiltersProps {
  readonly isSearching: boolean
  /** A filter problem found before searching (shown under the form). */
  readonly filterErrorMessage: string | null
  readonly onSearch: (filterInput: AdminAuditLogFilterInput) => void
}

type FilterField = keyof AdminAuditLogFilterInput

const textFields: readonly { readonly field: FilterField; readonly label: string; readonly helperText: string }[] = [
  { field: 'actionPrefix', label: 'Action starts with', helperText: 'For example job_opening_moderation. or shop.' },
  { field: 'subjectType', label: 'Subject type', helperText: 'For example job_opening or worker_contract' },
  { field: 'subjectId', label: 'Subject id', helperText: 'A full id, or empty' },
  { field: 'profileId', label: 'About this account id', helperText: 'A full id, or empty' },
  { field: 'actorId', label: 'Done by account id', helperText: 'A full id, or empty' },
]

/** Audit log filters. Searching is a recorded action, so nothing is read until "Search the audit log". */
export function AdminAuditFilters({ isSearching, filterErrorMessage, onSearch }: AdminAuditFiltersProps): ReactElement {
  const fieldId = useId()
  const [filterInput, setFilterInput] = useState<AdminAuditLogFilterInput>(emptyAdminAuditLogFilterInput)

  const changeField = (field: FilterField, value: string): void => {
    setFilterInput((currentInput) => ({ ...currentInput, [field]: value }))
  }

  return (
    <form
      role="search"
      aria-label="Audit log filters"
      noValidate
      className="space-y-3"
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        onSearch(filterInput)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {textFields.map((textField) => (
          <Input
            key={textField.field}
            id={`${fieldId}-${textField.field}`}
            name={textField.field}
            label={textField.label}
            helperText={textField.helperText}
            value={filterInput[textField.field]}
            autoComplete="off"
            onChange={(changeEvent): void => {
              changeField(textField.field, changeEvent.target.value)
            }}
          />
        ))}
        <Input
          id={`${fieldId}-from`}
          name="from"
          type="datetime-local"
          label="From"
          value={filterInput.from}
          onChange={(changeEvent): void => {
            changeField('from', changeEvent.target.value)
          }}
        />
        <Input
          id={`${fieldId}-to`}
          name="to"
          type="datetime-local"
          label="To"
          value={filterInput.to}
          onChange={(changeEvent): void => {
            changeField('to', changeEvent.target.value)
          }}
        />
      </div>
      {filterErrorMessage !== null ? (
        <p role="alert" className="text-sm text-[var(--color-danger-600)]">
          {filterErrorMessage}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSearching} leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}>
        {auditSearchLabel}
      </Button>
    </form>
  )
}
