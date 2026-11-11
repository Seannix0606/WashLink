import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { ArrowLeft, Info, RefreshCw, Save } from 'lucide-react'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import type { OwnerContractTemplate } from '../../../../domain/models/ContractTemplate'
import { canAddShopTermToSection, groupBySection } from '../../../../domain/utilities/contractTemplateDraft'
import { ownerUsablePlaceholderKeys } from '../../../../domain/utilities/contractTemplatePlaceholders'
import { Badge, Button, Skeleton } from '../../../design/ui'
import { useContractTemplateEditor } from '../../../hooks/useContractTemplateEditor'
import {
  archivedTemplateReadOnlyText,
  classificationNotChosenHereText,
  lockedOnlyPlaceholdersText,
  newerStandardBadgeLabel,
  newerStandardExplanation,
  placeholderHelpText,
  unsavedChangesBlockUpdateText,
} from '../../../utilities/contractTemplateCopy'
import { describeStandardBase, templateStatusDisplay } from '../../../utilities/contractTemplateDisplay'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { ContractTemplateSectionEditor } from './ContractTemplateSectionEditor'

interface ContractTemplateEditorProps {
  readonly contractTemplateService: ContractTemplateService
  readonly template: OwnerContractTemplate
  readonly onBack: () => void
  /** Re-reads the template list after a save or a stale answer. */
  readonly onTemplateChanged: () => Promise<void>
}

/** Owner editor: one save = one new sealed version on the expected version number. */
export function ContractTemplateEditor({
  contractTemplateService,
  template: initialTemplate,
  onBack,
  onTemplateChanged,
}: ContractTemplateEditorProps): ReactElement {
  const editor = useContractTemplateEditor(contractTemplateService, initialTemplate, onTemplateChanged)
  const [isUpdateConfirmOpen, setIsUpdateConfirmOpen] = useState<boolean>(false)
  const sections = useMemo(() => groupBySection(editor.clauses), [editor.clauses])
  const { template } = editor
  const statusDisplay = templateStatusDisplay[template.status]
  const placeholderLabels = new Map(editor.placeholders.map((placeholder) => [placeholder.placeholderKey, placeholder.previewLabel]))
  const isNewerStandardOffered = template.newerStandardAvailable && !editor.isReadOnly && template.latestPlatformVersionNumber !== null

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back to templates
      </Button>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{template.name}</h3>
          <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
        </div>
        <p className="text-xs text-[var(--color-ink-500)]">
          {`Version ${String(template.currentVersionNumber)} · ${describeStandardBase(template.basePlatformVersionNumber)}`}
        </p>
      </header>

      {editor.isReadOnly ? (
        <p role="status" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-ink-100)] px-3 py-2 text-sm text-[var(--color-ink-700)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {archivedTemplateReadOnlyText}
        </p>
      ) : null}

      {isNewerStandardOffered ? (
        <div role="status" className="space-y-2 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] px-3 py-3 text-sm">
          <Badge tone="warning">{newerStandardBadgeLabel}</Badge>
          <p className="text-[var(--color-ink-700)]">{newerStandardExplanation}</p>
          {editor.isDirty ? <p className="text-xs text-[var(--color-ink-500)]">{unsavedChangesBlockUpdateText}</p> : null}
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            disabled={editor.isDirty || editor.isSaving || editor.isLoading}
            onClick={(): void => {
              setIsUpdateConfirmOpen(true)
            }}
          >
            {`Update to standard version ${String(template.latestPlatformVersionNumber)}`}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-[var(--color-ink-500)]">{classificationNotChosenHereText}</p>

      {editor.isReadOnly ? null : (
        <details className="rounded-[var(--radius-control)] border border-[var(--color-card-border)] px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--color-ink-900)]">Placeholders you can use</summary>
          <p className="mt-2 text-xs text-[var(--color-ink-500)]">{placeholderHelpText}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-500)]">{lockedOnlyPlaceholdersText}</p>
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {ownerUsablePlaceholderKeys.map((placeholderKey) => (
              <div key={placeholderKey} className="flex flex-col">
                <dt className="font-mono text-[var(--color-ink-900)]">{`{{${placeholderKey}}}`}</dt>
                <dd className="text-[var(--color-ink-500)]">{placeholderLabels.get(placeholderKey) ?? ''}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {editor.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the template">
          <Skeleton heightClassName="h-24" />
          <Skeleton heightClassName="h-24" />
        </div>
      ) : editor.errorMessage !== null ? (
        <LoadErrorNotice
          title="The template could not be loaded"
          errorMessage={editor.errorMessage}
          onRetry={(): void => {
            void editor.reload()
          }}
        />
      ) : (
        <form
          aria-label={`Edit ${template.name}`}
          className="space-y-4"
          onSubmit={(submitEvent): void => {
            submitEvent.preventDefault()
            void editor.save()
          }}
        >
          {sections.map((section) => (
            <ContractTemplateSectionEditor
              key={section.sectionNumber}
              section={section}
              draft={editor.draft}
              draftErrors={editor.visibleErrors}
              canAddShopTerm={canAddShopTermToSection(section.sectionNumber, editor.clauses)}
              isReadOnly={editor.isReadOnly}
              onEditableBodyChange={editor.setEditableBody}
              onAddShopTerm={editor.addShopTerm}
              onShopTermChange={editor.updateShopTerm}
              onRemoveShopTerm={editor.removeShopTerm}
            />
          ))}
          {editor.visibleErrors.formError !== null ? (
            <p role="alert" className="text-sm text-[var(--color-danger-600)]">
              {editor.visibleErrors.formError}
            </p>
          ) : null}
          {editor.isReadOnly ? null : (
            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[var(--color-card-border)] bg-[var(--color-card)] py-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={!editor.isDirty || editor.isSaving} onClick={editor.discardChanges}>
                Discard changes
              </Button>
              <Button
                type="submit"
                leadingIcon={<Save className="h-4 w-4" aria-hidden="true" />}
                isLoading={editor.isSaving}
                disabled={!editor.isDirty || editor.isSaving}
              >
                {`Save as version ${String(template.currentVersionNumber + 1)}`}
              </Button>
            </div>
          )}
        </form>
      )}

      <TrainingConfirmModal
        isOpen={isUpdateConfirmOpen}
        title="Update to the newer standard"
        subjectText={template.name}
        message={<p>{`${newerStandardExplanation} This saves version ${String(template.currentVersionNumber + 1)}.`}</p>}
        confirmButtonLabel="Update and save"
        isDestructive={false}
        isSubmitting={editor.isSaving}
        onConfirm={(): void => {
          void editor.updateToNewerStandard().then((): void => {
            setIsUpdateConfirmOpen(false)
          })
        }}
        onCancel={(): void => {
          setIsUpdateConfirmOpen(false)
        }}
      />
    </div>
  )
}
