import type { ReactElement } from 'react'
import { Trash2 } from 'lucide-react'
import type {
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerPrivateContact,
  WorkerProfile,
} from '../../../domain/models/WorkerProfile'
import { Button, Modal } from '../../design/ui'
import { WorkerProfileOnboardingFlow } from './WorkerProfileOnboardingFlow'

interface WorkerProfileEditorModalProps {
  readonly isOpen: boolean
  readonly workerProfile: WorkerProfile | null
  readonly workerPrivateContact: WorkerPrivateContact | null
  readonly isDeletingWorkerProfile: boolean
  readonly onClose: () => void
  readonly onSaveWorkerProfile: (
    workerProfileInput: SaveWorkerProfileInput,
    workerPrivateContactInput: SaveWorkerPrivateContactInput,
  ) => Promise<boolean>
  readonly onDeleteWorkerProfile: () => Promise<boolean>
}

export function WorkerProfileEditorModal({
  isOpen,
  workerProfile,
  workerPrivateContact,
  isDeletingWorkerProfile,
  onClose,
  onSaveWorkerProfile,
  onDeleteWorkerProfile,
}: WorkerProfileEditorModalProps): ReactElement {
  const isCreatingWorkerProfile = workerProfile === null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isCreatingWorkerProfile ? 'Complete your worker profile' : 'Edit worker profile'}
      maxWidthClassName="max-w-lg"
      footer={
        isCreatingWorkerProfile ? undefined : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-ink-500)]">
              Deleting removes your profile and private contact details.
            </p>
            <Button
              size="sm"
              variant="ghost"
              isLoading={isDeletingWorkerProfile}
              leadingIcon={<Trash2 className="h-4 w-4" />}
              className="text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)]"
              onClick={(): void => {
                if (!window.confirm('Delete your worker profile? This cannot be undone.')) {
                  return
                }
                void (async (): Promise<void> => {
                  if (await onDeleteWorkerProfile()) {
                    onClose()
                  }
                })()
              }}
            >
              Delete profile
            </Button>
          </div>
        )
      }
    >
      <div className="max-h-[70dvh] overflow-y-auto">
        <WorkerProfileOnboardingFlow
          initialWorkerProfile={workerProfile}
          initialWorkerPrivateContact={workerPrivateContact}
          submitLabel={isCreatingWorkerProfile ? 'Create profile' : 'Save changes'}
          onSubmitWorkerProfile={onSaveWorkerProfile}
          onWorkerProfileSaved={onClose}
        />
      </div>
    </Modal>
  )
}
