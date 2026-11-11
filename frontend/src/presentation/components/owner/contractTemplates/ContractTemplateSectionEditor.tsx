import type { ReactElement } from 'react'
import { Lock, Plus } from 'lucide-react'
import {
  editableFieldKey,
  shopTermFieldKey,
  type ContractTemplateDraftErrors,
} from '../../../../application/validation/contractTemplateDraftValidation'
import { contractTemplateLimits, type ContractTemplateClause } from '../../../../domain/models/ContractTemplate'
import type { ContractTemplateDraft, ContractTemplateSection } from '../../../../domain/utilities/contractTemplateDraft'
import { Badge, Button } from '../../../design/ui'
import { lockedClauseExplanation, noShopTermsSectionText, ownerInputNeededText } from '../../../utilities/contractTemplateCopy'
import { clauseKindDisplay } from '../../../utilities/contractTemplateDisplay'
import { SectionReviewNotice } from '../../contracts/DraftLegalReviewBanner'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'
import { ShopSpecificTermForm } from './ShopSpecificTermForm'

interface ContractTemplateSectionEditorProps {
  readonly section: ContractTemplateSection<ContractTemplateClause>
  readonly draft: ContractTemplateDraft
  readonly draftErrors: ContractTemplateDraftErrors
  readonly canAddShopTerm: boolean
  readonly isReadOnly: boolean
  readonly onEditableBodyChange: (clauseKey: string, body: string) => void
  readonly onAddShopTerm: (sectionNumber: number) => void
  readonly onShopTermChange: (draftId: string, fieldName: 'heading' | 'body', value: string) => void
  readonly onRemoveShopTerm: (draftId: string) => void
}

function LockedClause({ clause }: { readonly clause: ContractTemplateClause }): ReactElement {
  return (
    <article aria-label={clause.heading} className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-3">
      <Badge tone={clauseKindDisplay.locked_safeguard.tone}>
        <Lock className="h-3 w-3" aria-hidden="true" />
        {clauseKindDisplay.locked_safeguard.label}
      </Badge>
      <h4 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{clause.heading}</h4>
      <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{clause.body}</p>
      <p className="text-xs text-[var(--color-ink-500)]">{lockedClauseExplanation}</p>
    </article>
  )
}

interface EditableClauseProps {
  readonly clause: ContractTemplateClause
  readonly body: string
  readonly errorText?: string
  readonly isReadOnly: boolean
  readonly onChange: (clauseKey: string, body: string) => void
}

function EditableClause({ clause, body, errorText, isReadOnly, onChange }: EditableClauseProps): ReactElement {
  const clauseKey = clause.clauseKey ?? clause.clauseId
  const isInstructionUnchanged = clause.requiresOwnerInput && body === clause.body
  return (
    <div className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-brand-200)] p-3">
      <Badge tone={clauseKindDisplay.editable.tone}>{clauseKindDisplay.editable.label}</Badge>
      {isReadOnly ? (
        <article aria-label={clause.heading} className="space-y-1">
          <h4 className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{clause.heading}</h4>
          <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{body}</p>
        </article>
      ) : (
        <>
          <WorkerProfileTextArea
            fieldName={`clause-${clauseKey}`}
            label={clause.heading}
            value={body}
            maximumLength={contractTemplateLimits.clauseBodyMaxLength}
            errorText={errorText}
            rows={4}
            onValueChange={(nextBody): void => {
              onChange(clauseKey, nextBody)
            }}
          />
          {isInstructionUnchanged ? <p className="text-xs text-[var(--color-ink-500)]">{ownerInputNeededText}</p> : null}
        </>
      )}
    </div>
  )
}

/** One of the 15 sections: locked safeguards read-only, editable bodies, and shop terms where allowed. */
export function ContractTemplateSectionEditor({
  section,
  draft,
  draftErrors,
  canAddShopTerm,
  isReadOnly,
  onEditableBodyChange,
  onAddShopTerm,
  onShopTermChange,
  onRemoveShopTerm,
}: ContractTemplateSectionEditorProps): ReactElement {
  const headingId = `contract-section-${String(section.sectionNumber)}`
  const sectionShopTerms = draft.shopTerms.filter((shopTerm) => shopTerm.sectionNumber === section.sectionNumber)
  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t border-[var(--color-card-border)] pt-4">
      <header className="space-y-0.5">
        <h3 id={headingId} className="text-sm font-semibold text-[var(--color-ink-900)]">
          {`${String(section.sectionNumber)}. ${section.sectionTitle}`}
        </h3>
        <SectionReviewNotice reviewNotice={section.reviewNotice} />
      </header>
      {section.rows
        .filter((clause) => clause.kind !== 'shop_specific')
        .map((clause) =>
          clause.kind === 'locked_safeguard' ? (
            <LockedClause key={clause.clauseId} clause={clause} />
          ) : (
            <EditableClause
              key={clause.clauseId}
              clause={clause}
              body={draft.editableBodies[clause.clauseKey ?? ''] ?? clause.body}
              errorText={draftErrors.fieldErrors[editableFieldKey(clause.clauseKey ?? '')]}
              isReadOnly={isReadOnly}
              onChange={onEditableBodyChange}
            />
          ),
        )}
      {sectionShopTerms.map((shopTerm, termIndex) => (
        <ShopSpecificTermForm
          key={shopTerm.draftId}
          shopTerm={shopTerm}
          termNumber={termIndex + 1}
          headingError={draftErrors.fieldErrors[shopTermFieldKey(shopTerm.draftId, 'heading')]}
          bodyError={draftErrors.fieldErrors[shopTermFieldKey(shopTerm.draftId, 'body')]}
          isReadOnly={isReadOnly}
          onChange={onShopTermChange}
          onRemove={onRemoveShopTerm}
        />
      ))}
      {isReadOnly ? null : canAddShopTerm ? (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          aria-label={`Add a shop-specific term to section ${String(section.sectionNumber)}`}
          onClick={(): void => {
            onAddShopTerm(section.sectionNumber)
          }}
        >
          Add shop-specific term
        </Button>
      ) : (
        <p className="text-xs text-[var(--color-ink-500)]">{noShopTermsSectionText}</p>
      )}
    </section>
  )
}
