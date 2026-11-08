import type { ReactElement } from 'react'
import { useState } from 'react'
import { Eye, FileText, PencilLine } from 'lucide-react'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import type { PlatformContractTemplateService } from '../../../../application/services/PlatformContractTemplateService'
import { Badge, Button, Card, EmptyState, Skeleton } from '../../../design/ui'
import { useStandardContractEditor } from '../../../hooks/useStandardContractEditor'
import { savedByRoleLabel, shortContentHash } from '../../../utilities/contractTemplateDisplay'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import {
  standardContractHeading,
  standardContractIntro,
  standardEditButtonLabel,
  standardHistoryEmptyText,
  standardHistoryHeading,
  standardNotFoundTitle,
  standardPreviewButtonLabel,
  stillDraftForLegalReviewText,
} from '../../../utilities/standardContractCopy'
import { standardUnavailableText } from '../../../utilities/contractTemplateCopy'
import { DraftLegalReviewBanner } from '../../contracts/DraftLegalReviewBanner'
import { ContractTemplatePreview } from '../../owner/contractTemplates/ContractTemplatePreview'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { PublishStandardContractModal } from './PublishStandardContractModal'
import { StandardContractEditor } from './StandardContractEditor'

interface StandardContractPanelProps {
  readonly platformTemplateService: PlatformContractTemplateService
  /** W8 reads, reused for the server-rendered preview. */
  readonly contractTemplateService: ContractTemplateService
}

/** Super_admin "Standard contract": the current standard, its versions, preview and a new version editor. */
export function StandardContractPanel({ platformTemplateService, contractTemplateService }: StandardContractPanelProps): ReactElement {
  const editor = useStandardContractEditor(platformTemplateService)
  const [isPreviewShown, setIsPreviewShown] = useState<boolean>(false)
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false)

  const renderBody = (): ReactElement => {
    if (editor.isLoading) {
      return (
        <div aria-busy="true" aria-label="Loading the standard template" className="space-y-2">
          <Skeleton heightClassName="h-24" />
          <Skeleton heightClassName="h-24" />
        </div>
      )
    }
    if (editor.errorMessage !== null) {
      return (
        <LoadErrorNotice
          title="The standard template could not be loaded"
          errorMessage={editor.errorMessage}
          onRetry={(): void => {
            void editor.reload()
          }}
        />
      )
    }
    if (editor.editorData === null) {
      return <EmptyState icon={<FileText className="h-5 w-5" />} title={standardNotFoundTitle} description={standardUnavailableText} />
    }
    const { standard } = editor.editorData
    if (isPreviewShown) {
      return (
        <ContractTemplatePreview
          contractTemplateService={contractTemplateService}
          versionId={standard.versionId}
          title={`${standard.name}, version ${String(standard.versionNumber)}`}
          onBack={(): void => {
            setIsPreviewShown(false)
          }}
        />
      )
    }
    if (editor.draft !== null) {
      return (
        <>
          <StandardContractEditor
            draft={editor.draft}
            changedClauseCount={editor.changedClauseCount}
            draftProblem={editor.draftProblem}
            onChangeClause={editor.changeClause}
            onDiscard={editor.discard}
            onReviewPublish={(): void => {
              setIsPublishModalOpen(true)
            }}
          />
          <PublishStandardContractModal
            isOpen={isPublishModalOpen}
            baseVersionNumber={editor.draft.baseVersionNumber}
            changedClauseCount={editor.changedClauseCount}
            isPublishing={editor.isPublishing}
            onConfirm={(): void => {
              void editor.publish().then(() => {
                setIsPublishModalOpen(false)
              })
            }}
            onClose={(): void => {
              setIsPublishModalOpen(false)
            }}
          />
        </>
      )
    }
    return (
      <div className="space-y-4">
        <DraftLegalReviewBanner />
        <p className="text-sm text-[var(--color-ink-700)]">{stillDraftForLegalReviewText}</p>
        <p className="text-sm text-[var(--color-ink-900)]">
          {`${standard.name} · version ${String(standard.versionNumber)} · fingerprint `}
          <span className="font-mono">{shortContentHash(standard.contentHash)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button leadingIcon={<PencilLine className="h-4 w-4" aria-hidden="true" />} onClick={editor.startEditing}>
            {standardEditButtonLabel}
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
            onClick={(): void => {
              setIsPreviewShown(true)
            }}
          >
            {standardPreviewButtonLabel}
          </Button>
        </div>
        <section aria-label={standardHistoryHeading} className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">{standardHistoryHeading}</h3>
          {editor.history.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-500)]">{standardHistoryEmptyText}</p>
          ) : (
            <ol className="space-y-1 text-xs text-[var(--color-ink-700)]">
              {editor.history.map((version) => (
                <li key={version.versionId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--color-ink-900)]">{`Version ${String(version.versionNumber)}`}</span>
                  {version.isCurrent ? <Badge tone="brand">Current</Badge> : null}
                  <span>{`${formatShortDateTime(version.createdAt)} (${savedByRoleLabel[version.savedByRole]})`}</span>
                  <span className="font-mono">{shortContentHash(version.contentHash)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    )
  }

  return (
    <Card elevation="raised" role="region" aria-labelledby="standard-contract-heading" className="space-y-4">
      <header>
        <h2 id="standard-contract-heading" className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <FileText className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          {standardContractHeading}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{standardContractIntro}</p>
      </header>
      {renderBody()}
    </Card>
  )
}
