import type { ReactElement } from 'react'
import { Archive, ArchiveRestore, Eye, History, Pencil } from 'lucide-react'
import type { OwnerContractTemplate } from '../../../../domain/models/ContractTemplate'
import { Badge, Button } from '../../../design/ui'
import { newerStandardBadgeLabel } from '../../../utilities/contractTemplateCopy'
import { describeStandardBase, templateStatusDisplay } from '../../../utilities/contractTemplateDisplay'
import { formatShortDateTime } from '../../../utilities/datetimeFormatting'

interface ContractTemplateListItemProps {
  readonly template: OwnerContractTemplate
  readonly isPending: boolean
  readonly onOpen: (template: OwnerContractTemplate) => void
  readonly onHistory: (template: OwnerContractTemplate) => void
  readonly onRename: (template: OwnerContractTemplate) => void
  readonly onArchive: (template: OwnerContractTemplate) => void
  readonly onRestore: (template: OwnerContractTemplate) => void
}

/** One owner template; archived templates offer view, versions and restore only. */
export function ContractTemplateListItem({
  template,
  isPending,
  onOpen,
  onHistory,
  onRename,
  onArchive,
  onRestore,
}: ContractTemplateListItemProps): ReactElement {
  const statusDisplay = templateStatusDisplay[template.status]
  const isActive = template.status === 'active'
  return (
    <li aria-label={template.name} className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-card-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{template.name}</span>
        <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
        {isActive && template.newerStandardAvailable ? <Badge tone="warning">{newerStandardBadgeLabel}</Badge> : null}
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">
        {`Version ${String(template.currentVersionNumber)} · saved ${formatShortDateTime(template.lastSavedAt)} · ${describeStandardBase(template.basePlatformVersionNumber)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={isActive ? 'primary' : 'secondary'}
          leadingIcon={isActive ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          aria-label={`${isActive ? 'Edit' : 'View'} ${template.name}`}
          onClick={(): void => {
            onOpen(template)
          }}
        >
          {isActive ? 'Edit' : 'View'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<History className="h-4 w-4" aria-hidden="true" />}
          aria-label={`Versions of ${template.name}`}
          onClick={(): void => {
            onHistory(template)
          }}
        >
          Versions
        </Button>
        {isActive ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Rename ${template.name}`}
              disabled={isPending}
              onClick={(): void => {
                onRename(template)
              }}
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Archive className="h-4 w-4" aria-hidden="true" />}
              aria-label={`Archive ${template.name}`}
              disabled={isPending}
              onClick={(): void => {
                onArchive(template)
              }}
            >
              Archive
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
            aria-label={`Restore ${template.name}`}
            isLoading={isPending}
            onClick={(): void => {
              onRestore(template)
            }}
          >
            Restore
          </Button>
        )}
      </div>
    </li>
  )
}
