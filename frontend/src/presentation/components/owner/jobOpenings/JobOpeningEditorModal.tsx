import type { ReactElement } from 'react'
import { useState } from 'react'
import { Eye, PencilLine, Save } from 'lucide-react'
import type { JobOpening, SaveJobOpeningInput } from '../../../../domain/models/JobOpening'
import type { Shop } from '../../../../domain/models/Shop'
import { Button, Modal } from '../../../design/ui'
import { useJobOpeningEditor } from '../../../hooks/useJobOpeningEditor'
import { JobOpeningApplicationSection } from './JobOpeningApplicationSection'
import { JobOpeningBasicsSection } from './JobOpeningBasicsSection'
import { JobOpeningPayAndTermsSection } from './JobOpeningPayAndTermsSection'
import { JobOpeningPreview } from './JobOpeningPreview'
import { JobOpeningRequirementsSection } from './JobOpeningRequirementsSection'
import { JobOpeningTransitionConfirmModal } from './JobOpeningTransitionConfirmModal'

const editorFormId = 'job-opening-editor-form'

interface JobOpeningEditorModalProps {
  /** null creates a new draft. */
  readonly jobOpening: JobOpening | null
  readonly initialShopId: string
  readonly ownerShopList: readonly Shop[]
  readonly onSave: (shopId: string, saveJobOpeningInput: SaveJobOpeningInput) => Promise<boolean>
  readonly onClose: () => void
}

/** Mount with a `key` per opening so each edit starts from the stored values. */
export function JobOpeningEditorModal({
  jobOpening,
  initialShopId,
  ownerShopList,
  onSave,
  onClose,
}: JobOpeningEditorModalProps): ReactElement {
  const {
    draft,
    fieldErrors,
    previewContent,
    isPreviewVisible,
    isSaving,
    updateDraftField,
    setIsPreviewVisible,
    validateDraft,
    submitDraft,
  } = useJobOpeningEditor({ jobOpening, initialShopId, onSave })
  const [isPublishedSaveConfirmationOpen, setIsPublishedSaveConfirmationOpen] =
    useState<boolean>(false)

  const isNewOpening = jobOpening === null
  const isPublishedSaveConfirmationNeeded = jobOpening?.status === 'published'
  const previewShopName =
    ownerShopList.find((ownerShop) => ownerShop.id === draft.shopId)?.name ?? 'Your shop'
  const hasFieldErrors = Object.keys(fieldErrors).length > 0

  const saveAndClose = async (): Promise<void> => {
    if (await submitDraft()) {
      setIsPublishedSaveConfirmationOpen(false)
      onClose()
    } else {
      setIsPublishedSaveConfirmationOpen(false)
    }
  }

  const handleSaveRequested = (): void => {
    if (isPublishedSaveConfirmationNeeded) {
      if (validateDraft()) {
        setIsPublishedSaveConfirmationOpen(true)
      } else {
        setIsPreviewVisible(false)
      }
      return
    }
    void saveAndClose()
  }

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={isNewOpening ? 'New job opening' : 'Edit job opening'}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              leadingIcon={
                isPreviewVisible ? <PencilLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />
              }
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
              <Button
                type="submit"
                form={editorFormId}
                isLoading={isSaving}
                leadingIcon={<Save className="h-4 w-4" />}
              >
                {isNewOpening ? 'Save draft' : 'Save changes'}
              </Button>
            </div>
          </div>
        }
      >
        <form
          id={editorFormId}
          noValidate
          aria-label={isNewOpening ? 'New job opening' : 'Edit job opening'}
          className="max-h-[65dvh] space-y-6 overflow-y-auto pr-1"
          onSubmit={(submitEvent): void => {
            submitEvent.preventDefault()
            handleSaveRequested()
          }}
        >
          {hasFieldErrors ? (
            <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--color-danger-50)] px-3 py-2 text-sm text-[var(--color-danger-600)]">
              Some fields need attention. Check the messages below.
            </p>
          ) : null}

          {isPreviewVisible ? (
            <JobOpeningPreview
              jobOpeningContent={previewContent}
              shopName={previewShopName}
              isOwnerPreview
            />
          ) : (
            <>
              <p className="text-xs text-[var(--color-ink-500)]">
                Drafts can be saved with only a title. Fields marked &quot;needed to publish&quot;
                must be filled before workers can see the opening.
              </p>
              <JobOpeningBasicsSection
                draft={draft}
                fieldErrors={fieldErrors}
                onFieldChange={updateDraftField}
                ownerShopList={ownerShopList}
                isShopSelectable={isNewOpening}
              />
              <JobOpeningRequirementsSection
                draft={draft}
                fieldErrors={fieldErrors}
                onFieldChange={updateDraftField}
              />
              <JobOpeningPayAndTermsSection
                draft={draft}
                fieldErrors={fieldErrors}
                onFieldChange={updateDraftField}
              />
              <JobOpeningApplicationSection
                draft={draft}
                fieldErrors={fieldErrors}
                onFieldChange={updateDraftField}
              />
            </>
          )}
        </form>
      </Modal>

      <JobOpeningTransitionConfirmModal
        action={isPublishedSaveConfirmationOpen ? 'save_published' : null}
        jobOpeningTitle={draft.title}
        isSubmitting={isSaving}
        onConfirm={(): void => {
          void saveAndClose()
        }}
        onCancel={(): void => {
          setIsPublishedSaveConfirmationOpen(false)
        }}
      />
    </>
  )
}
