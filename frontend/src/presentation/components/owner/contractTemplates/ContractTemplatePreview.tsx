import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import { groupBySection } from '../../../../domain/utilities/contractTemplateDraft'
import { Badge, Button, EmptyState, Skeleton } from '../../../design/ui'
import { useContractTemplatePreview } from '../../../hooks/useContractTemplatePreview'
import { clauseKindDisplay } from '../../../utilities/contractTemplateDisplay'
import { DraftLegalReviewBanner, SectionReviewNotice } from '../../contracts/DraftLegalReviewBanner'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface ContractTemplatePreviewProps {
  readonly contractTemplateService: ContractTemplateService
  readonly versionId: string
  readonly title: string
  readonly onBack: () => void
}

/**
 * A sealed version as the server renders it: placeholders appear as bracketed labels (never
 * real or invented values), with the draft notice on top and under every section heading.
 */
export function ContractTemplatePreview({ contractTemplateService, versionId, title, onBack }: ContractTemplatePreviewProps): ReactElement {
  const preview = useContractTemplatePreview(contractTemplateService, versionId)
  const sections = useMemo(() => groupBySection(preview.resource), [preview.resource])
  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back
      </Button>
      <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{`Preview: ${title}`}</h3>
      <DraftLegalReviewBanner isAcceptanceNoteShown />
      {preview.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the preview">
          <Skeleton heightClassName="h-24" />
          <Skeleton heightClassName="h-24" />
        </div>
      ) : preview.errorMessage !== null ? (
        <LoadErrorNotice
          title="The preview could not be loaded"
          errorMessage={preview.errorMessage}
          onRetry={(): void => {
            void preview.reload()
          }}
        />
      ) : sections.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="Nothing to preview" description="Template not found, or this version is not available." />
      ) : (
        <article aria-label={`Preview of ${title}`} className="space-y-5">
          {sections.map((section) => (
            <section key={section.sectionNumber} aria-label={`Section ${String(section.sectionNumber)}`} className="space-y-2">
              <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">
                {`${String(section.sectionNumber)}. ${section.sectionTitle}`}
              </h4>
              <SectionReviewNotice reviewNotice={section.reviewNotice} />
              {section.rows.map((clause) => (
                <div key={clause.clauseId} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="text-sm font-medium break-words text-[var(--color-ink-900)]">{clause.renderedHeading}</h5>
                    <Badge tone={clauseKindDisplay[clause.kind].tone}>{clauseKindDisplay[clause.kind].label}</Badge>
                  </div>
                  <p className="text-sm whitespace-pre-line break-words text-[var(--color-ink-700)]">{clause.renderedBody}</p>
                </div>
              ))}
            </section>
          ))}
        </article>
      )}
    </div>
  )
}
