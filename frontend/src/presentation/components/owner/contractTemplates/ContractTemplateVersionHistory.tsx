import type { ReactElement } from 'react'
import { ArrowLeft, Copy, Eye, GitCompare, History } from 'lucide-react'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import type { ContractTemplateVersionSummary, OwnerContractTemplate } from '../../../../domain/models/ContractTemplate'
import { Badge, Button, EmptyState, Skeleton } from '../../../design/ui'
import { useContractTemplateVersionHistory } from '../../../hooks/useContractTemplateVersionHistory'
import {
  describeStandardBase,
  describeVersionCounts,
  savedByRoleLabel,
  shortContentHash,
} from '../../../utilities/contractTemplateDisplay'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface ContractTemplateVersionHistoryProps {
  readonly contractTemplateService: ContractTemplateService
  readonly template: OwnerContractTemplate
  readonly isCreatePending: boolean
  readonly onBack: () => void
  readonly onPreview: (version: ContractTemplateVersionSummary) => void
  readonly onCompare: (version: ContractTemplateVersionSummary) => void
  readonly onStartNewTemplate: (version: ContractTemplateVersionSummary) => void
}

/** Every saved version, newest first. Versions are sealed: they can be viewed or reused, never edited. */
export function ContractTemplateVersionHistory({
  contractTemplateService,
  template,
  isCreatePending,
  onBack,
  onPreview,
  onCompare,
  onStartNewTemplate,
}: ContractTemplateVersionHistoryProps): ReactElement {
  const history = useContractTemplateVersionHistory(contractTemplateService, template.templateId)
  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back to templates
      </Button>
      <header>
        <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{`Versions of ${template.name}`}</h3>
        <p className="text-xs text-[var(--color-ink-500)]">
          Each save made a new version. Earlier versions are kept unchanged. The fingerprint identifies the exact text of a version.
        </p>
      </header>
      {history.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the version history">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : history.errorMessage !== null ? (
        <LoadErrorNotice
          title="The version history could not be loaded"
          errorMessage={history.errorMessage}
          onRetry={(): void => {
            void history.reload()
          }}
        />
      ) : history.resource.length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title="No versions found" description="Template not found, or it has no saved versions." />
      ) : (
        <ol aria-label="Template versions" className="space-y-3">
          {history.resource.map((version) => (
            <li key={version.versionId} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-ink-900)]">{`Version ${String(version.versionNumber)}`}</span>
                {version.isCurrent ? <Badge tone="brand">Current</Badge> : null}
              </div>
              <dl className="grid gap-1 text-xs text-[var(--color-ink-700)] sm:grid-cols-2">
                <div>
                  <dt className="inline text-[var(--color-ink-500)]">Saved: </dt>
                  <dd className="inline">{`${formatShortDateTime(version.createdAt)} (${savedByRoleLabel[version.savedByRole]})`}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-ink-500)]">Fingerprint: </dt>
                  <dd className="inline font-mono">{shortContentHash(version.contentHash)}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-ink-500)]">Standard: </dt>
                  <dd className="inline">{describeStandardBase(version.basePlatformVersionNumber)}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-ink-500)]">Changes: </dt>
                  <dd className="inline">{describeVersionCounts(version.editedCount, version.addedCount)}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
                  aria-label={`Preview version ${String(version.versionNumber)}`}
                  onClick={(): void => {
                    onPreview(version)
                  }}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<GitCompare className="h-4 w-4" aria-hidden="true" />}
                  aria-label={`Compare version ${String(version.versionNumber)} with the standard`}
                  onClick={(): void => {
                    onCompare(version)
                  }}
                >
                  Compare with standard
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leadingIcon={<Copy className="h-4 w-4" aria-hidden="true" />}
                  aria-label={`Start a new template from version ${String(version.versionNumber)}`}
                  disabled={isCreatePending}
                  onClick={(): void => {
                    onStartNewTemplate(version)
                  }}
                >
                  Start a new template from this version
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
