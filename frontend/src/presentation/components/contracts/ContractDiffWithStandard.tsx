import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import type { ContractClauseComparison } from '../../../domain/models/WorkerContract'
import { diffClauseWords } from '../../../domain/utilities/clauseTextDiff'
import { groupBySection } from '../../../domain/utilities/contractTemplateDraft'
import { Badge } from '../../design/ui'
import { clauseKindDisplay } from '../../utilities/contractTemplateDisplay'
import { SectionReviewNotice } from './DraftLegalReviewBanner'

const changeLabels: Readonly<Record<ContractClauseComparison['change'], string>> = {
  unchanged: 'Same as the standard',
  edited: 'Edited by the shop',
  added_by_shop: 'Added by the shop',
}

function WordDiff({ standardBody, body }: { readonly standardBody: string; readonly body: string }): ReactElement {
  return (
    <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">
      {diffClauseWords(standardBody, body).map((segment, segmentIndex) =>
        segment.kind === 'same' ? (
          <span key={segmentIndex}>{segment.text}</span>
        ) : segment.kind === 'removed' ? (
          <del key={segmentIndex} aria-label={`Removed: ${segment.text}`} className="bg-[var(--color-danger-50)] text-[var(--color-danger-600)]">
            {segment.text}
          </del>
        ) : (
          <ins key={segmentIndex} aria-label={`Added: ${segment.text}`} className="bg-[var(--color-success-50)] text-[var(--color-success-600)] no-underline">
            {segment.text}
          </ins>
        ),
      )}
    </p>
  )
}

interface ContractDiffWithStandardProps {
  readonly clauses: readonly ContractClauseComparison[]
}

/** The contract compared with the WashLink standard it is based on (rendered with the same values). */
export function ContractDiffWithStandard({ clauses }: ContractDiffWithStandardProps): ReactElement {
  const [isOnlyChangesShown, setIsOnlyChangesShown] = useState<boolean>(true)
  const editedCount = clauses.filter((clause) => clause.change === 'edited').length
  const addedCount = clauses.filter((clause) => clause.change === 'added_by_shop').length
  const sections = useMemo(
    () => groupBySection(isOnlyChangesShown ? clauses.filter((clause) => clause.change !== 'unchanged') : clauses),
    [clauses, isOnlyChangesShown],
  )
  if (clauses.length === 0) {
    return <p className="text-sm text-[var(--color-ink-500)]">No comparison is available for this version.</p>
  }
  return (
    <section aria-label="Comparison with the standard" className="space-y-3">
      <p role="status" className="text-sm text-[var(--color-ink-700)]">
        {`${String(clauses.length - editedCount - addedCount)} same as the standard, ${String(editedCount)} edited, ${String(addedCount)} added by the shop.`}
      </p>
      <label className="flex items-center gap-2 text-sm text-[var(--color-ink-900)]">
        <input
          type="checkbox"
          checked={isOnlyChangesShown}
          onChange={(changeEvent): void => {
            setIsOnlyChangesShown(changeEvent.target.checked)
          }}
        />
        Show only changes
      </label>
      {sections.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-500)]">This contract has the same text as the standard.</p>
      ) : (
        sections.map((section) => (
          <section key={section.sectionNumber} aria-label={`Section ${String(section.sectionNumber)}`} className="space-y-2">
            <h5 className="text-sm font-semibold text-[var(--color-ink-900)]">{`${String(section.sectionNumber)}. ${section.sectionTitle}`}</h5>
            <SectionReviewNotice reviewNotice={section.reviewNotice} />
            <ul className="space-y-2">
              {section.rows.map((clause) => (
                <li
                  key={`${String(clause.sectionNumber)}-${String(clause.position)}`}
                  aria-label={`${clause.heading}: ${changeLabels[clause.change]}`}
                  className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h6 className="text-sm font-medium break-words text-[var(--color-ink-900)]">{clause.heading}</h6>
                    <Badge tone={clause.change === 'unchanged' ? 'neutral' : 'warning'}>{changeLabels[clause.change]}</Badge>
                    <Badge tone={clauseKindDisplay[clause.kind].tone}>{clauseKindDisplay[clause.kind].label}</Badge>
                  </div>
                  {clause.change === 'edited' && clause.standardBody !== null ? (
                    <WordDiff standardBody={clause.standardBody} body={clause.body} />
                  ) : (
                    <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{clause.body}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}
