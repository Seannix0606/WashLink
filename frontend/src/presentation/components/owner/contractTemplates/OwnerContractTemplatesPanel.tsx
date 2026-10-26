import type { ReactElement } from 'react'
import { useState } from 'react'
import { ArrowLeft, Eye, FileSignature, Plus } from 'lucide-react'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import type {
  ContractTemplateStatus,
  ContractTemplateVersionSummary,
  OwnerContractTemplate,
} from '../../../../domain/models/ContractTemplate'
import { Button, Card, EmptyState, Skeleton, Tabs } from '../../../design/ui'
import { useContractTemplateActions } from '../../../hooks/useContractTemplateActions'
import { useOwnerContractTemplates } from '../../../hooks/useOwnerContractTemplates'
import {
  archiveConfirmMessage,
  archivedTemplatesEmptyDescription,
  contractTemplatesIntroText,
  standardUnavailableText,
  templateNotFoundText,
  templatesEmptyDescription,
  templatesEmptyTitle,
} from '../../../utilities/contractTemplateCopy'
import { DraftLegalReviewBanner } from '../../contracts/DraftLegalReviewBanner'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { ContractTemplateDiffView } from './ContractTemplateDiffView'
import { ContractTemplateEditor } from './ContractTemplateEditor'
import { ContractTemplateListItem } from './ContractTemplateListItem'
import { ContractTemplateNameModal, type ContractTemplateNameRequest } from './ContractTemplateNameModal'
import { ContractTemplatePreview } from './ContractTemplatePreview'
import { ContractTemplateVersionHistory } from './ContractTemplateVersionHistory'

type PanelView =
  | { readonly kind: 'list' }
  | { readonly kind: 'editor' | 'history'; readonly templateId: string }
  | { readonly kind: 'preview' | 'diff'; readonly versionId: string; readonly title: string; readonly returnTo: PanelView }

type NameAction =
  | { readonly kind: 'from-standard' }
  | { readonly kind: 'from-version'; readonly version: ContractTemplateVersionSummary; readonly sourceName: string }
  | { readonly kind: 'rename'; readonly template: OwnerContractTemplate }

const listView: PanelView = { kind: 'list' }

function toNameRequest(nameAction: NameAction | null, standardName: string | null): ContractTemplateNameRequest | null {
  if (nameAction === null) {
    return null
  }
  if (nameAction.kind === 'from-standard') {
    return {
      title: 'New template from the standard',
      description: `Starts as a copy of ${standardName ?? 'the WashLink standard template'}. It is a draft; you then edit the clauses marked Editable.`,
      initialName: '',
      confirmButtonLabel: 'Create template',
    }
  }
  if (nameAction.kind === 'from-version') {
    return {
      title: 'Start a new template from this version',
      description: `Copies your edits and shop-specific terms from version ${String(nameAction.version.versionNumber)} of ${nameAction.sourceName}. Platform safeguards are copied again from the standard.`,
      initialName: '',
      confirmButtonLabel: 'Create template',
    }
  }
  return { title: 'Rename template', description: 'The name is only for your shop.', initialName: nameAction.template.name, confirmButtonLabel: 'Rename' }
}

interface OwnerContractTemplatesPanelProps {
  readonly contractTemplateService: ContractTemplateService
}

/** Owner "Contract templates" tab: list, editor, versions, preview and comparison with the standard. */
export function OwnerContractTemplatesPanel({ contractTemplateService }: OwnerContractTemplatesPanelProps): ReactElement {
  const templates = useOwnerContractTemplates(contractTemplateService)
  const actions = useContractTemplateActions(contractTemplateService, templates.refresh)
  const [view, setView] = useState<PanelView>(listView)
  const [nameAction, setNameAction] = useState<NameAction | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<OwnerContractTemplate | null>(null)
  const standard = templates.standard
  const findTemplate = (templateId: string): OwnerContractTemplate | undefined =>
    templates.allTemplates.find((template) => template.templateId === templateId)

  const confirmName = async (name: string): Promise<boolean> => {
    if (nameAction === null) {
      return false
    }
    if (nameAction.kind === 'rename') {
      return actions.rename(nameAction.template, name)
    }
    const createdRecord =
      nameAction.kind === 'from-standard'
        ? await actions.createFromStandard(name)
        : await actions.createFromVersion(name, nameAction.version.versionId)
    if (createdRecord !== null) {
      setView({ kind: 'editor', templateId: createdRecord.templateId })
    }
    return createdRecord !== null
  }

  const renderTemplateView = (templateId: string, kind: 'editor' | 'history'): ReactElement => {
    const template = findTemplate(templateId)
    if (template === undefined) {
      return templates.isLoading ? (
        <Skeleton heightClassName="h-40" />
      ) : (
        <div className="space-y-3">
          <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={(): void => { setView(listView) }}>
            Back to templates
          </Button>
          <p role="status" className="text-sm text-[var(--color-ink-700)]">{templateNotFoundText}</p>
        </div>
      )
    }
    if (kind === 'editor') {
      return (
        <ContractTemplateEditor
          key={template.templateId}
          contractTemplateService={contractTemplateService}
          template={template}
          onBack={(): void => { setView(listView) }}
          onTemplateChanged={templates.refresh}
        />
      )
    }
    const versionTitle = (version: ContractTemplateVersionSummary): string => `${template.name}, version ${String(version.versionNumber)}`
    return (
      <ContractTemplateVersionHistory
        contractTemplateService={contractTemplateService}
        template={template}
        isCreatePending={actions.pendingSubjectId !== null}
        onBack={(): void => { setView(listView) }}
        onPreview={(version): void => { setView({ kind: 'preview', versionId: version.versionId, title: versionTitle(version), returnTo: view }) }}
        onCompare={(version): void => { setView({ kind: 'diff', versionId: version.versionId, title: versionTitle(version), returnTo: view }) }}
        onStartNewTemplate={(version): void => { setNameAction({ kind: 'from-version', version, sourceName: template.name }) }}
      />
    )
  }

  const renderList = (): ReactElement => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs<ContractTemplateStatus>
          accessibleLabel="Template status"
          tabItems={[
            { value: 'active', label: 'Active', badgeContent: templates.activeCount },
            { value: 'archived', label: 'Archived', badgeContent: templates.archivedCount },
          ]}
          activeTabValue={templates.statusFilter}
          onTabChange={templates.setStatusFilter}
        />
        <div className="flex flex-wrap gap-2">
          {standard !== null ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
              onClick={(): void => {
                setView({ kind: 'preview', versionId: standard.versionId, title: `${standard.name}, version ${String(standard.versionNumber)}`, returnTo: listView })
              }}
            >
              Preview the standard
            </Button>
          ) : null}
          <Button
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            disabled={templates.isLoading || standard === null || actions.pendingSubjectId !== null}
            onClick={(): void => { setNameAction({ kind: 'from-standard' }) }}
          >
            New from standard
          </Button>
        </div>
      </div>
      {!templates.isLoading && templates.errorMessage === null && standard === null ? (
        <p role="status" className="text-sm text-[var(--color-ink-500)]">{standardUnavailableText}</p>
      ) : null}
      {templates.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your contract templates">
          <Skeleton heightClassName="h-20" />
          <Skeleton heightClassName="h-20" />
        </div>
      ) : templates.errorMessage !== null ? (
        <LoadErrorNotice
          title="Your contract templates could not be loaded"
          errorMessage={templates.errorMessage}
          onRetry={(): void => { void templates.reload() }}
        />
      ) : templates.isEmpty ? (
        <EmptyState
          icon={<FileSignature className="h-5 w-5" />}
          title={templates.statusFilter === 'archived' ? 'No archived templates' : templates.allTemplates.length === 0 ? templatesEmptyTitle : 'No active templates'}
          description={templates.statusFilter === 'active' ? templatesEmptyDescription : archivedTemplatesEmptyDescription}
        />
      ) : (
        <ul aria-label="Contract templates" className="space-y-3">
          {templates.visibleTemplates.map((template) => (
            <ContractTemplateListItem
              key={template.templateId}
              template={template}
              isPending={actions.pendingSubjectId === template.templateId}
              onOpen={(openedTemplate): void => { setView({ kind: 'editor', templateId: openedTemplate.templateId }) }}
              onHistory={(openedTemplate): void => { setView({ kind: 'history', templateId: openedTemplate.templateId }) }}
              onRename={(renamedTemplate): void => { setNameAction({ kind: 'rename', template: renamedTemplate }) }}
              onArchive={setArchiveTarget}
              onRestore={(restoredTemplate): void => { void actions.restore(restoredTemplate) }}
            />
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Card elevation="raised" className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink-900)]">
          <FileSignature className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
          Contract templates
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">{contractTemplatesIntroText}</p>
      </header>
      {view.kind === 'list' || view.kind === 'editor' || view.kind === 'history' ? <DraftLegalReviewBanner /> : null}

      {view.kind === 'list' ? renderList() : null}
      {view.kind === 'editor' || view.kind === 'history' ? renderTemplateView(view.templateId, view.kind) : null}
      {view.kind === 'preview' ? (
        <ContractTemplatePreview
          contractTemplateService={contractTemplateService}
          versionId={view.versionId}
          title={view.title}
          onBack={(): void => { setView(view.returnTo) }}
        />
      ) : null}
      {view.kind === 'diff' ? (
        <ContractTemplateDiffView
          contractTemplateService={contractTemplateService}
          versionId={view.versionId}
          title={view.title}
          onBack={(): void => { setView(view.returnTo) }}
        />
      ) : null}

      <ContractTemplateNameModal
        request={toNameRequest(nameAction, standard?.name ?? null)}
        isSubmitting={actions.pendingSubjectId !== null}
        onConfirm={confirmName}
        onClose={(): void => { setNameAction(null) }}
      />
      <TrainingConfirmModal
        isOpen={archiveTarget !== null}
        title="Archive this template?"
        subjectText={archiveTarget?.name ?? ''}
        message={<p>{archiveConfirmMessage}</p>}
        confirmButtonLabel="Archive template"
        isDestructive
        isSubmitting={archiveTarget !== null && actions.pendingSubjectId === archiveTarget.templateId}
        onConfirm={(): void => {
          if (archiveTarget !== null) {
            void actions.archive(archiveTarget).then((): void => { setArchiveTarget(null) })
          }
        }}
        onCancel={(): void => { setArchiveTarget(null) }}
      />
    </Card>
  )
}
