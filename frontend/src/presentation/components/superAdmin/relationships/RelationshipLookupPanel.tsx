import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { UserSearch } from 'lucide-react'
import type { AdminOversightService } from '../../../../application/services/AdminOversightService'
import type { WorkforcePolicyService } from '../../../../application/services/WorkforcePolicyService'
import { firstModerationIssue, lookupNoteSchema, lookupPersonSchema, lookupPurposeSchema } from '../../../../application/validation/moderationSchemas'
import { adminOversightLimits, relationshipLookupPurposes, type RelationshipLookupKind, type RelationshipLookupResult } from '../../../../domain/models/AdminOversight'
import { Button, Card, Input, Select } from '../../../design/ui'
import { useAdminRelationshipLookup } from '../../../hooks/useAdminRelationshipLookup'
import { useWorkforcePolicies } from '../../../hooks/useWorkforcePolicies'
import {
  lookupKindFieldLabel,
  lookupMinimumText,
  lookupMinimumUnavailableText,
  lookupNoRelationshipsText,
  lookupNoteFieldLabel,
  lookupNotFoundText,
  lookupPersonFieldLabel,
  lookupPurposeFieldLabel,
  lookupPurposeLabel,
  lookupSubmitLabel,
  relationshipsHeading,
  relationshipsIntro,
} from '../../../utilities/adminOversightCopy'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

interface FieldErrors {
  readonly person?: string
  readonly purpose?: string
  readonly note?: string
}

const kindOptions = [
  { value: 'worker', label: 'A worker' },
  { value: 'owner', label: 'A shop owner' },
]

const purposeOptions = [
  { value: '', label: 'Choose one' },
  ...relationshipLookupPurposes.map((purpose) => ({ value: purpose, label: lookupPurposeLabel[purpose] })),
]

/** The informational minimum is not in the lookup answer (W14 DB D1); it is read from the W10 policy (its only key). */
function WorkerMinimumNote({ workforcePolicyService }: { readonly workforcePolicyService: WorkforcePolicyService }): ReactElement | null {
  const policiesState = useWorkforcePolicies(workforcePolicyService)
  if (policiesState.isLoading) {
    return null
  }
  const minimumPolicy = policiesState.policies.at(0)
  return <p>{minimumPolicy === undefined ? lookupMinimumUnavailableText : lookupMinimumText(minimumPolicy.integerValue)}</p>
}

function LookupResultView({
  result,
  workforcePolicyService,
}: {
  readonly result: RelationshipLookupResult
  readonly workforcePolicyService: WorkforcePolicyService
}): ReactElement {
  if (!result.isFound) {
    return <p role="status">{lookupNotFoundText}</p>
  }
  return (
    <section aria-label="Lookup result" className="space-y-2 text-xs text-[var(--color-ink-700)]">
      <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{result.displayName}</p>
      {result.distinctQualifyingOwnerCount !== null ? (
        <>
          <p>{`Distinct qualifying owners: ${String(result.distinctQualifyingOwnerCount)}`}</p>
          <WorkerMinimumNote workforcePolicyService={workforcePolicyService} />
        </>
      ) : null}
      {result.relationships.length === 0 ? (
        <p>{lookupNoRelationshipsText}</p>
      ) : (
        <ul aria-label="Relationships" className="space-y-2">
          {result.relationships.map((relationship) => (
            <li key={relationship.relationshipId} className="space-y-0.5 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-2">
              <p className="font-medium break-words text-[var(--color-ink-900)]">
                {`${relationship.counterpartNameSnapshot ?? 'Name not recorded'}${relationship.isOwnerPresent === false ? ' (account removed)' : ''}`}
              </p>
              <p>{`${relationship.status} (${relationship.statusReason}) · ${relationship.countsTowardGoal ? 'counts toward the goal' : 'does not count'} · ${String(
                relationship.qualifyingContractCount,
              )} qualifying contracts`}</p>
              <p>
                {`First accepted ${relationship.firstAcceptedAt === null ? 'not recorded' : formatShortDateTime(relationship.firstAcceptedAt)}`}
                {relationship.endedAt === null ? '' : ` · ended ${formatShortDateTime(relationship.endedAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface RelationshipLookupPanelProps {
  readonly adminOversightService: AdminOversightService
  readonly workforcePolicyService: WorkforcePolicyService
}

/** D-38 / D-55: one audited lookup per worker or owner, with a purpose and a note of 20 to 300 characters. */
export function RelationshipLookupPanel({ adminOversightService, workforcePolicyService }: RelationshipLookupPanelProps): ReactElement {
  const fieldId = useId()
  const lookup = useAdminRelationshipLookup(adminOversightService)
  const [kindInput, setKindInput] = useState<RelationshipLookupKind>('worker')
  const [personInput, setPersonInput] = useState<string>('')
  const [purposeInput, setPurposeInput] = useState<string>('')
  const [noteInput, setNoteInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const submitLookup = async (): Promise<void> => {
    const nextErrors: FieldErrors = {
      person: firstModerationIssue(lookupPersonSchema, personInput),
      purpose: firstModerationIssue(lookupPurposeSchema, purposeInput),
      note: firstModerationIssue(lookupNoteSchema, noteInput),
    }
    setFieldErrors(nextErrors)
    if (Object.values(nextErrors).some((fieldError) => fieldError !== undefined)) {
      return
    }
    await lookup.lookUp(kindInput, personInput, purposeInput, noteInput)
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="relationship-lookups-heading" className="space-y-4">
      <header>
        <h2 id="relationship-lookups-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <UserSearch className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {relationshipsHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{relationshipsIntro}</p>
      </header>
      <form
        aria-label="Look up relationships"
        noValidate
        className="space-y-3"
        onSubmit={(submitEvent): void => {
          submitEvent.preventDefault()
          void submitLookup()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            id={`${fieldId}-kind`}
            name="lookup-kind"
            label={lookupKindFieldLabel}
            options={kindOptions}
            value={kindInput}
            onChange={(changeEvent): void => {
              setKindInput(changeEvent.target.value === 'owner' ? 'owner' : 'worker')
            }}
          />
          <Input
            id={`${fieldId}-person`}
            name="lookup-person"
            label={lookupPersonFieldLabel}
            required
            autoComplete="off"
            value={personInput}
            errorText={fieldErrors.person}
            onChange={(changeEvent): void => {
              setPersonInput(changeEvent.target.value)
            }}
          />
        </div>
        <Select
          id={`${fieldId}-purpose`}
          name="lookup-purpose"
          label={lookupPurposeFieldLabel}
          required
          options={purposeOptions}
          value={purposeInput}
          errorText={fieldErrors.purpose}
          onChange={(changeEvent): void => {
            setPurposeInput(changeEvent.target.value)
          }}
        />
        <WorkerProfileTextArea
          fieldName={`${fieldId}-note`}
          label={lookupNoteFieldLabel}
          value={noteInput}
          maximumLength={adminOversightLimits.lookupNoteMaxLength}
          errorText={fieldErrors.note}
          rows={3}
          onValueChange={setNoteInput}
        />
        <Button type="submit" isLoading={lookup.isLookingUp}>
          {lookupSubmitLabel}
        </Button>
      </form>
      {lookup.errorMessage !== null ? (
        <p role="alert" className="text-sm text-[var(--color-danger-600)]">
          {lookup.errorMessage}
        </p>
      ) : null}
      {lookup.result !== null ? <LookupResultView result={lookup.result} workforcePolicyService={workforcePolicyService} /> : null}
    </Card>
  )
}
