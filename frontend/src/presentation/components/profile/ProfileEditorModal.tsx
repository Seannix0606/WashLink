import type { ReactElement } from 'react'
import type { AuthenticatedUser } from '../../../domain/models/AuthenticatedUser'
import { Modal } from '../../design/ui'
import { ProfileEditorCard } from './ProfileEditorCard'

interface ProfileEditorModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly authenticatedUser: AuthenticatedUser
}

export function ProfileEditorModal({
  isOpen,
  onClose,
  authenticatedUser,
}: ProfileEditorModalProps): ReactElement {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit profile">
      <ProfileEditorCard
        authenticatedUser={authenticatedUser}
        isEmbeddedInModal
        onProfileSavedSuccessfully={onClose}
      />
    </Modal>
  )
}
