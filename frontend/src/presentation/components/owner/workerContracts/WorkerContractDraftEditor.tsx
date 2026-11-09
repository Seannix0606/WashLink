import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { ArrowLeft, Save, Send, Trash2 } from 'lucide-react'
import type { WorkerContractService } from '../../../../application/services/WorkerContractService'
import { findClassificationOption } from '../../../../application/services/WorkerContractService'
import { contractStatementKeys, type OwnerWorkerContract } from '../../../../domain/models/WorkerContract'
import { canAddShopTermToSection, groupBySection } from '../../../../domain/utilities/contractTemplateDraft'
import { Button, Skeleton } from '../../../design/ui'
import type { UseWorkerContractActionsResult } from '../../../hooks/useWorkerContractActions'
import { useWorkerContractDraftEditor } from '../../../hooks/useWorkerContractDraftEditor'
import {
  amendIntroText,
  discardDraftText,
  unsavedBeforeSendText,
} from '../../../utilities/workerContractCopy'
import { describeUnfilledItem, describeVersion } from '../../../utilities/workerContractDisplay'
import { ContractDiffWithStandard } from '../../contracts/ContractDiffWithStandard'
import { ContractProblemTermFlags } from '../../contracts/ContractProblemTermFlags'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'
import { ContractTemplateSectionEditor } from '../contractTemplates/ContractTemplateSectionEditor'
import { SendContractModal } from './SendContractModal'
import { WorkerContractDetailsFields } from './WorkerContractDetailsFields'

interface WorkerContractDraftEditorProps {
  readonly workerContractService: WorkerContractService
  readonly contract: OwnerWorkerContract
  readonly actions: UseWorkerContractActionsResult
  readonly onBack: () => void
  /** After a discard (an initial draft removes the whole contract). */
  readonly onDiscarded: () => void
  readonly onContractChanged: () => Promise<void>
}

/**
 * Owner editor for the open draft (offer or change): details, editable clauses and shop terms;
 * locked safeguards read-only. The preview below (unfilled items, live keyword check, comparison
 * with the standard) reflects the last saved draft.
 */
export function WorkerContractDraftEditor({ workerContractService, contract, actions, onBack, onDiscarded, onContractChanged }: WorkerContractDraftEditorProps): ReactElement {
  const editor = useWorkerContractDraftEditor(workerContractService, contract, onContractChanged)
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false)
  const [isDiscardOpen, setIsDiscardOpen] = useState<boolean>(false)
  const sections = useMemo(() => groupBySection(editor.templateClauses), [editor.templateClauses])
  const preview = editor.preview
  const editorData = editor.editorData
  const isAmendment = editorData?.draftVersion.kind === 'amendment'
  const statementText = (ackKey: string): string | null =>
    editorData?.acknowledgementTexts.find((text) => text.ackKey === ackKey)?.statementText ?? null
  const savedClassification = findClassificationOption(editorData?.classificationOptions ?? [], editorData?.draftVersion.classificationKey ?? null)
  const sendKey = `send:${contract.contractId}`
  const discardKey = `discard:${contract.contractId}`
  const title =
    editorData === null ? 'Contract draft' : describeVersion(editorData.draftVersion.versionNumber, editorData.draftVersion.kind)

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back to the contract
      </Button>
      <header className="space-y-0.5">
        <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{`${title}: ${contract.workerName ?? 'Worker'}`}</h3>
        <p className="text-xs text-[var(--color-ink-500)]">{contract.shopName ?? 'Shop'}</p>
        {isAmendment ? <p className="text-sm text-[var(--color-ink-700)]">{amendIntroText}</p> : null}
      </header>

      {editor.isLoading && editorData === null ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the contract draft">
          <Skeleton heightClassName="h-24" />
          <Skeleton heightClassName="h-24" />
        </div>
      ) : editor.errorMessage !== null || editorData === null ? (
        <LoadErrorNotice
          title="The contract draft could not be loaded"
          errorMessage={editor.errorMessage ?? 'Could not load the contract draft.'}
          onRetry={(): void => {
            void editor.reload()
          }}
        />
      ) : (
        <>
          <form
            aria-label="Edit the contract draft"
            className="space-y-4"
            noValidate
            onSubmit={(submitEvent): void => {
              submitEvent.preventDefault()
              void editor.save()
            }}
          >
            <WorkerContractDetailsFields
              details={editor.details}
              errors={editor.visibleDetailsErrors}
              classificationOptions={editorData.classificationOptions}
              onClassificationChange={editor.setClassificationKey}
              onDateChange={editor.setDate}
              onOwnerValueChange={editor.setOwnerValue}
            />
            {sections.map((section) => (
              <ContractTemplateSectionEditor
                key={section.sectionNumber}
                section={section}
                draft={editor.draft}
                draftErrors={editor.visibleDraftErrors}
                canAddShopTerm={canAddShopTermToSection(section.sectionNumber, editor.templateClauses)}
                isReadOnly={false}
                onEditableBodyChange={editor.setEditableBody}
                onAddShopTerm={editor.addShopTerm}
                onShopTermChange={editor.updateShopTerm}
                onRemoveShopTerm={editor.removeShopTerm}
              />
            ))}
            {editor.visibleDraftErrors.formError !== null ? (
              <p role="alert" className="text-sm text-[var(--color-danger-600)]">{editor.visibleDraftErrors.formError}</p>
            ) : null}
            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[var(--color-ink-200)] bg-[var(--color-card)] py-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                variant="ghost"
                leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                disabled={editor.isSaving || actions.pendingActionKey !== null}
                onClick={(): void => {
                  setIsDiscardOpen(true)
                }}
              >
                Discard draft
              </Button>
              <Button variant="secondary" disabled={!editor.isDirty || editor.isSaving} onClick={editor.discardChanges}>
                Undo changes
              </Button>
              <Button type="submit" variant="secondary" leadingIcon={<Save className="h-4 w-4" aria-hidden="true" />} isLoading={editor.isSaving} disabled={!editor.isDirty || editor.isSaving}>
                Save draft
              </Button>
              <Button
                leadingIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                disabled={editor.isDirty || editor.isSaving || preview === null || actions.pendingActionKey !== null}
                onClick={(): void => {
                  setIsSendOpen(true)
                }}
              >
                Review and send
              </Button>
            </div>
            {editor.isDirty ? <p className="text-right text-xs text-[var(--color-ink-500)]">{unsavedBeforeSendText}</p> : null}
          </form>

          {preview !== null ? (
            <section aria-label="Saved draft check" className="space-y-4 border-t border-[var(--color-ink-200)] pt-4">
              <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">Saved draft check</h4>
              {preview.unfilled.length > 0 ? (
                <div role="status" className="space-y-1 rounded-[var(--radius-control)] bg-[var(--color-warning-50)] p-3 text-sm">
                  <p className="font-medium text-[var(--color-ink-900)]">Still to fill in before sending:</p>
                  <ul className="list-disc pl-5 text-[var(--color-ink-700)]">
                    {preview.unfilled.map((unfilledItem) => (
                      <li key={unfilledItem}>{describeUnfilledItem(unfilledItem, preview.clauses)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p role="status" className="text-sm text-[var(--color-ink-700)]">Every clause and contract detail is filled in.</p>
              )}
              <ContractProblemTermFlags flags={preview.flags} notices={editorData.flagNotices} />
              <ContractDiffWithStandard clauses={preview.clauses} />
            </section>
          ) : null}

          {isSendOpen && preview !== null ? (
            <SendContractModal
              preview={preview}
              classification={savedClassification}
              offerStatementText={statementText(contractStatementKeys.ownerSend)}
              contractorStatementText={statementText(contractStatementKeys.contractorOwner)}
              flagNotices={editorData.flagNotices}
              isSubmitting={actions.pendingActionKey === sendKey}
              onConfirm={(confirmations): void => {
                void actions
                  .runAction(
                    sendKey,
                    async () => workerContractService.sendVersion(contract, preview, savedClassification, confirmations),
                    'Sent to the worker. This version can no longer change.',
                    'Could not send the contract.',
                  )
                  .then((sentVersion): void => {
                    setIsSendOpen(false)
                    if (sentVersion === null) {
                      void editor.reload()
                    } else {
                      onBack()
                    }
                  })
              }}
              onCancel={(): void => {
                setIsSendOpen(false)
              }}
            />
          ) : null}
        </>
      )}

      <TrainingConfirmModal
        isOpen={isDiscardOpen}
        title="Discard this draft?"
        subjectText={title}
        message={<p>{discardDraftText}</p>}
        confirmButtonLabel="Discard draft"
        isDestructive
        isSubmitting={actions.pendingActionKey === discardKey}
        onConfirm={(): void => {
          void actions
            .runAction(discardKey, async () => workerContractService.discardDraft(contract), 'Draft discarded.', 'Could not discard the draft.')
            .then((isDiscarded): void => {
              setIsDiscardOpen(false)
              if (isDiscarded === true) {
                onDiscarded()
              }
            })
        }}
        onCancel={(): void => {
          setIsDiscardOpen(false)
        }}
      />
    </div>
  )
}
