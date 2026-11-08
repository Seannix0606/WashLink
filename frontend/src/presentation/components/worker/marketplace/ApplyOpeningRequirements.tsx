import type { ReactElement } from 'react'
import { useId } from 'react'
import { ListChecks } from 'lucide-react'
import { Button, Skeleton } from '../../../design/ui'
import type { ApplyOpeningRequirementsState } from '../../../utilities/applyOpeningRequirements'
import { notSpecifiedByShopText } from '../../../utilities/jobOpeningDisplay'

function RequirementList({
  title,
  items,
}: {
  readonly title: string
  readonly items: readonly string[]
}): ReactElement {
  return (
    <div className="space-y-0.5">
      <p className="font-medium text-[var(--color-ink-900)]">{title}</p>
      {items.length === 0 ? (
        <p>{notSpecifiedByShopText}</p>
      ) : (
        <ul aria-label={title} className="list-disc space-y-0.5 pl-5">
          {items.map((listItem) => (
            <li key={listItem} className="break-words">
              {listItem}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ApplyOpeningRequirementsSectionProps {
  readonly requirementsState: ApplyOpeningRequirementsState
  readonly onReload?: () => void
}

/** Qualifications and required training of the opening, in the apply dialog itself. */
export function ApplyOpeningRequirementsSection({
  requirementsState,
  onReload,
}: ApplyOpeningRequirementsSectionProps): ReactElement {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] px-4 py-3"
    >
      <h3
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]"
      >
        <ListChecks className="h-4 w-4 shrink-0 text-[var(--color-brand-700)]" aria-hidden="true" />
        Qualifications and required training
      </h3>
      {requirementsState.kind === 'loading' ? (
        <div aria-busy="true" aria-label="Loading qualifications and required training">
          <Skeleton heightClassName="h-12" />
        </div>
      ) : requirementsState.kind === 'unavailable' ? (
        <div className="space-y-2">
          <p role="alert" className="text-[var(--color-danger-500)]">
            {requirementsState.message}
          </p>
          {onReload !== undefined ? (
            <Button size="sm" variant="secondary" onClick={onReload}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2 text-[var(--color-ink-700)]">
          <RequirementList
            title="Minimum qualifications"
            items={requirementsState.requirements.minimumQualifications}
          />
          <RequirementList
            title="Preferred qualifications"
            items={requirementsState.requirements.preferredQualifications}
          />
          <div className="space-y-0.5">
            <p className="font-medium text-[var(--color-ink-900)]">Required training</p>
            <p className="whitespace-pre-line break-words">
              {requirementsState.requirements.requiredTraining ?? notSpecifiedByShopText}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
