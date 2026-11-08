import type { ReactElement } from 'react'
import { Lock, Send, Undo2 } from 'lucide-react'
import { contractTemplateLimits } from '../../../../domain/models/ContractTemplate'
import type { StandardContractDraft } from '../../../../domain/models/PlatformContractTemplateDraft'
import { groupBySection } from '../../../../domain/utilities/contractTemplateDraft'
import { Badge, Button, Input } from '../../../design/ui'
import { editableClauseLabel, lockedClauseLabel } from '../../../utilities/contractTemplateCopy'
import {
  clauseBodyLabel,
  clauseHeadingLabel,
  standardChangeCountText,
  standardDiscardLabel,
  standardEditorHeading,
  standardReviewPublishLabel,
} from '../../../utilities/standardContractCopy'
import { DraftLegalReviewBanner, SectionReviewNotice } from '../../contracts/DraftLegalReviewBanner'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

interface StandardContractEditorProps {
  readonly draft: StandardContractDraft
  readonly changedClauseCount: number
  /** Why the draft cannot be published yet (null when it can). */
  readonly draftProblem: string | null
  readonly onChangeClause: (clauseKey: string, change: { readonly heading?: string; readonly body?: string }) => void
  readonly onDiscard: () => void
  readonly onReviewPublish: () => void
}

/**
 * Editor for a new standard version. WashLink safeguard clauses are read-only here (the database
 * also refuses any added, removed or changed safeguard clause, W16 D-87); editable clauses can change heading and text.
 */
export function StandardContractEditor({
  draft,
  changedClauseCount,
  draftProblem,
  onChangeClause,
  onDiscard,
  onReviewPublish,
}: StandardContractEditorProps): ReactElement {
  const sections = groupBySection(draft.clauses)
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-[var(--color-ink-900)]">{`${standardEditorHeading} (from version ${String(draft.baseVersionNumber)})`}</h3>
      <DraftLegalReviewBanner />
      <div className="space-y-5">
        {sections.map((section) => (
          <section key={section.sectionNumber} aria-label={`Section ${String(section.sectionNumber)}`} className="space-y-3">
            <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">{`${String(section.sectionNumber)}. ${section.sectionTitle}`}</h4>
            <SectionReviewNotice reviewNotice={section.reviewNotice} />
            {section.rows.map((clause) =>
              clause.kind === 'locked_safeguard' ? (
                <div key={clause.clauseKey} className="space-y-1 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Lock className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
                    <h5 className="text-sm font-medium break-words text-[var(--color-ink-900)]">{clause.originalHeading}</h5>
                    <Badge tone="neutral">{lockedClauseLabel}</Badge>
                  </div>
                  <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{clause.originalBody}</p>
                </div>
              ) : (
                <fieldset key={clause.clauseKey} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
                  <legend className="px-1">
                    <Badge tone="brand">{editableClauseLabel}</Badge>
                  </legend>
                  <Input
                    id={`standard-${clause.clauseKey}-heading`}
                    name={`standard-${clause.clauseKey}-heading`}
                    label={`${clauseHeadingLabel}: ${clause.originalHeading}`}
                    value={clause.heading}
                    maxLength={contractTemplateLimits.shopTermHeadingMaxLength}
                    onChange={(changeEvent): void => {
                      onChangeClause(clause.clauseKey, { heading: changeEvent.target.value })
                    }}
                  />
                  <WorkerProfileTextArea
                    fieldName={`standard-${clause.clauseKey}-body`}
                    label={`${clauseBodyLabel}: ${clause.originalHeading}`}
                    value={clause.body}
                    maximumLength={contractTemplateLimits.clauseBodyMaxLength}
                    rows={4}
                    onValueChange={(nextBody): void => {
                      onChangeClause(clause.clauseKey, { body: nextBody })
                    }}
                  />
                </fieldset>
              ),
            )}
          </section>
        ))}
      </div>
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[var(--color-ink-200)] bg-white py-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-sm text-[var(--color-ink-700)]">
          {standardChangeCountText(changedClauseCount)}
          {draftProblem !== null ? <span className="block text-xs text-[var(--color-ink-500)]">{draftProblem}</span> : null}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" leadingIcon={<Undo2 className="h-4 w-4" aria-hidden="true" />} onClick={onDiscard}>
            {standardDiscardLabel}
          </Button>
          <Button leadingIcon={<Send className="h-4 w-4" aria-hidden="true" />} disabled={draftProblem !== null} onClick={onReviewPublish}>
            {standardReviewPublishLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
