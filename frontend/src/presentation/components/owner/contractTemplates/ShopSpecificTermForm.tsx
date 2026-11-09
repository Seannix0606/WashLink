import type { ReactElement } from 'react'
import { Trash2 } from 'lucide-react'
import { contractTemplateLimits } from '../../../../domain/models/ContractTemplate'
import type { ShopTermDraft } from '../../../../domain/utilities/contractTemplateDraft'
import { Badge, Button, Input } from '../../../design/ui'
import { shopSpecificTermLabel } from '../../../utilities/contractTemplateCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

interface ShopSpecificTermFormProps {
  readonly shopTerm: ShopTermDraft
  readonly termNumber: number
  readonly headingError?: string
  readonly bodyError?: string
  readonly isReadOnly: boolean
  readonly onChange: (draftId: string, fieldName: 'heading' | 'body', value: string) => void
  readonly onRemove: (draftId: string) => void
}

/** One shop-specific term: a heading of 3 to 160 and a text of 10 to 4000 characters. */
export function ShopSpecificTermForm({
  shopTerm,
  termNumber,
  headingError,
  bodyError,
  isReadOnly,
  onChange,
  onRemove,
}: ShopSpecificTermFormProps): ReactElement {
  const termName = `Shop-specific term ${String(termNumber)}`
  if (isReadOnly) {
    return (
      <article aria-label={termName} className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-info-200)] bg-[var(--color-info-50)]/40 p-3">
        <Badge tone="info">{shopSpecificTermLabel}</Badge>
        <h4 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{shopTerm.heading}</h4>
        <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{shopTerm.body}</p>
      </article>
    )
  }
  const fieldPrefix = `shop-term-${shopTerm.draftId}`
  return (
    <fieldset aria-label={termName} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-info-200)] bg-[var(--color-info-50)]/40 p-3">
      <legend className="sr-only">{termName}</legend>
      <div className="flex items-center justify-between gap-2">
        <Badge tone="info">{shopSpecificTermLabel}</Badge>
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          aria-label={`Remove ${termName.toLowerCase()}`}
          onClick={(): void => {
            onRemove(shopTerm.draftId)
          }}
        >
          Remove
        </Button>
      </div>
      <Input
        id={`${fieldPrefix}-heading`}
        name={`${fieldPrefix}-heading`}
        label="Term heading"
        value={shopTerm.heading}
        maxLength={contractTemplateLimits.shopTermHeadingMaxLength}
        errorText={headingError}
        helperText="3 to 160 characters."
        onChange={(changeEvent): void => {
          onChange(shopTerm.draftId, 'heading', changeEvent.target.value)
        }}
      />
      <WorkerProfileTextArea
        fieldName={`${fieldPrefix}-body`}
        label="Term text"
        value={shopTerm.body}
        maximumLength={contractTemplateLimits.shopTermBodyMaxLength}
        errorText={bodyError}
        rows={4}
        onValueChange={(nextBody): void => {
          onChange(shopTerm.draftId, 'body', nextBody)
        }}
      />
    </fieldset>
  )
}
