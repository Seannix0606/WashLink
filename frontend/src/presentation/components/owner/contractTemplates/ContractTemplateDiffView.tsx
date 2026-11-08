import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { ArrowLeft, GitCompare } from 'lucide-react'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import type { ContractTemplateDiffRow } from '../../../../domain/models/ContractTemplate'
import { diffClauseWords } from '../../../../domain/utilities/clauseTextDiff'
import { groupBySection } from '../../../../domain/utilities/contractTemplateDraft'
import { Badge, Button, EmptyState, Skeleton } from '../../../design/ui'
import { useContractTemplateDiff } from '../../../hooks/useContractTemplateDiff'
import { clauseChangeDisplay, clauseKindDisplay } from '../../../utilities/contractTemplateDisplay'
import { DraftLegalReviewBanner } from '../../contracts/DraftLegalReviewBanner'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface ContractTemplateDiffViewProps {
  readonly contractTemplateService: ContractTemplateService
  readonly versionId: string
  readonly title: string
  readonly onBack: () => void
}

function WordDiff({ standardBody, versionBody }: { readonly standardBody: string; readonly versionBody: string }): ReactElement {
  const segments = diffClauseWords(standardBody, versionBody)
  return (
    <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">
      {segments.map((segment, segmentIndex) =>
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

function DiffRowView({ row }: { readonly row: ContractTemplateDiffRow }): ReactElement {
  const changeDisplay = clauseChangeDisplay[row.change]
  return (
    <li aria-label={`${row.versionHeading}: ${changeDisplay.label}`} className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-medium break-words text-[var(--color-ink-900)]">{row.versionHeading}</h5>
        <Badge tone={changeDisplay.tone}>{changeDisplay.label}</Badge>
        <Badge tone={clauseKindDisplay[row.kind].tone}>{clauseKindDisplay[row.kind].label}</Badge>
      </div>
      {row.change === 'edited' && row.standardBody !== null ? (
        <WordDiff standardBody={row.standardBody} versionBody={row.versionBody} />
      ) : (
        <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{row.versionBody}</p>
      )}
    </li>
  )
}

/** A version compared with the standard version it is based on: unchanged, edited (word level) and added terms. */
export function ContractTemplateDiffView({ contractTemplateService, versionId, title, onBack }: ContractTemplateDiffViewProps): ReactElement {
  const diff = useContractTemplateDiff(contractTemplateService, versionId)
  const [isOnlyChangesShown, setIsOnlyChangesShown] = useState<boolean>(true)
  const editedCount = diff.resource.filter((row) => row.change === 'edited').length
  const addedCount = diff.resource.filter((row) => row.change === 'added_by_shop').length
  const visibleRows = useMemo(
    () => (isOnlyChangesShown ? diff.resource.filter((row) => row.change !== 'unchanged') : diff.resource),
    [diff.resource, isOnlyChangesShown],
  )
  const sections = useMemo(() => groupBySection(visibleRows), [visibleRows])
  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back
      </Button>
      <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{`Compare with the standard: ${title}`}</h3>
      <DraftLegalReviewBanner />
      {diff.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the comparison">
          <Skeleton heightClassName="h-24" />
        </div>
      ) : diff.errorMessage !== null ? (
        <LoadErrorNotice
          title="The comparison could not be loaded"
          errorMessage={diff.errorMessage}
          onRetry={(): void => {
            void diff.reload()
          }}
        />
      ) : diff.resource.length === 0 ? (
        <EmptyState icon={<GitCompare className="h-5 w-5" />} title="Nothing to compare" description="Template not found, or this version is not available." />
      ) : (
        <>
          <p role="status" className="text-sm text-[var(--color-ink-700)]">
            {`${String(diff.resource.length - editedCount - addedCount)} unchanged, ${String(editedCount)} edited, ${String(addedCount)} added by your shop.`}
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
            <p className="text-sm text-[var(--color-ink-500)]">This version has the same text as the standard.</p>
          ) : (
            sections.map((section) => (
              <section key={section.sectionNumber} aria-label={`Section ${String(section.sectionNumber)}`} className="space-y-2">
                <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">{`${String(section.sectionNumber)}. ${section.sectionTitle}`}</h4>
                <ul className="space-y-2">
                  {section.rows.map((row) => (
                    <DiffRowView key={`${String(row.sectionNumber)}-${String(row.position)}`} row={row} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  )
}
