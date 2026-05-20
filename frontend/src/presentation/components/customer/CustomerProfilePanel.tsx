import type { ReactElement } from 'react'
import { User } from 'lucide-react'
import type { AuthenticatedUser } from '../../../domain/models/AuthenticatedUser'
import { EmptyState } from '../../design/ui'
import { ProfileEditorCard } from '../profile/ProfileEditorCard'

interface CustomerProfilePanelProps {
  readonly authenticatedUser: AuthenticatedUser | null
}

export function CustomerProfilePanel({
  authenticatedUser,
}: CustomerProfilePanelProps): ReactElement {
  if (!authenticatedUser) {
    return <EmptyState icon={<User className="h-5 w-5" />} title="Not signed in" />
  }
  return <ProfileEditorCard authenticatedUser={authenticatedUser} />
}
