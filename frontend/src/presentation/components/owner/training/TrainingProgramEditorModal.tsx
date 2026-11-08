import type { ReactElement } from 'react'
import { useState } from 'react'
import { Eye, PencilLine, Save } from 'lucide-react'
import type { SaveTrainingProgramInput, TrainingProgram } from '../../../../domain/models/TrainingProgram'
import type { Shop } from '../../../../domain/models/Shop'
import { Button, Modal } from '../../../design/ui'
import { useTrainingProgramEditor } from '../../../hooks/useTrainingProgramEditor'
import { TrainingProgramBasicsSection } from './TrainingProgramBasicsSection'
import { TrainingProgramPayAndTermsSection } from './TrainingProgramPayAndTermsSection'
import { TrainingProgramDetailsView } from '../../training/TrainingProgramDetailsView'

const editorFormId = 'training-program-editor-form'

interface TrainingProgramEditorModalProps {
  /** null creates a new draft. */
  readonly program: TrainingProgram | null
  readonly initialShopId: string
  readonly ownerShopList: readonly Shop[]
  readonly onSave: (shopId: string, saveInput: SaveTrainingProgramInput) => Promise<boolean>
  readonly onClose: () => void
}

/** Only drafts are edited. Mount with a `key` per program so each edit starts from stored values. */
export function TrainingProgramEditorModal({
  program,
  initialShopId,
  ownerShopList,
  onSave,
  onClose,
}: TrainingProgramEditorModalProps): ReactElement {
  const { draft, fieldErrors, previewContent, isSaving, updateDraftField, submitDraft } = useTrainingProgramEditor({
    program,
    initialShopId,
    onSave,
  })
  const [isPreviewVisible, setIsPreviewVisible] = useState<boolean>(false)
  const isNewProgram = program === null
  const hasFieldErrors = Object.keys(fieldErrors).length > 0
  const previewShopName = ownerShopList.find((ownerShop) => ownerShop.id === draft.shopId)?.name ?? 'Your shop'
  const formLabel = isNewProgram ? 'New training program' : 'Edit training program'

  const saveAndClose = async (): Promise<void> => {
    if (await submitDraft()) {
      onClose()
    } else {
      setIsPreviewVisible(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={formLabel}
      maxWidthClassName="max-w-2xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            leadingIcon={isPreviewVisible ? <PencilLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            onClick={(): void => {
              setIsPreviewVisible(!isPreviewVisible)
            }}
          >
            {isPreviewVisible ? 'Back to editing' : 'Preview'}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" form={editorFormId} isLoading={isSaving} leadingIcon={<Save className="h-4 w-4" />}>
              Save draft
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={editorFormId}
        noValidate
        aria-label={formLabel}
        className="max-h-[65dvh] space-y-6 overflow-y-auto pr-1"
        onSubmit={(submitEvent): void => {
          submitEvent.preventDefault()
          void saveAndClose()
        }}
      >
        {hasFieldErrors ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--color-danger-50)] px-3 py-2 text-sm text-[var(--color-danger-600)]">
            Some fields need attention. Check the messages below.
          </p>
        ) : null}
        {isPreviewVisible ? (
          <TrainingProgramDetailsView content={previewContent} shopName={previewShopName} audience="shop" />
        ) : (
          <>
            <p className="text-xs text-[var(--color-ink-500)]">
              Drafts are visible only to you. Once you open the program its content is frozen; schedule the training days
              after saving.
            </p>
            <TrainingProgramBasicsSection
              draft={draft}
              fieldErrors={fieldErrors}
              onFieldChange={updateDraftField}
              ownerShopList={ownerShopList}
              isShopSelectable={isNewProgram}
            />
            <TrainingProgramPayAndTermsSection draft={draft} fieldErrors={fieldErrors} onFieldChange={updateDraftField} />
          </>
        )}
      </form>
    </Modal>
  )
}
