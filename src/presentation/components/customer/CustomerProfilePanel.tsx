import type { ReactElement } from 'react'
import { User } from 'lucide-react'
import type { AuthenticatedUser } from '../../../domain/models/AuthenticatedUser'
import { Card, EmptyState } from '../../design/ui'
import { CustomerProfileRow } from './CustomerProfileRow'

interface CustomerProfilePanelProps {
  readonly authenticatedUser: AuthenticatedUser | null
}

export function CustomerProfilePanel({
  authenticatedUser,
}: CustomerProfilePanelProps): ReactElement {
  if (!authenticatedUser) {
    return <EmptyState icon={<User className="h-5 w-5" />} title="Not signed in" />
  }
  return (
    <Card elevation="flat" className="space-y-3 p-5">
      <h2 className="text-lg font-bold text-[var(--color-ink-900)]">Profile</h2>
      <dl className="divide-y divide-[var(--color-ink-200)]">
        <CustomerProfileRow label="Full name" value={authenticatedUser.fullName} />
        <CustomerProfileRow label="Email" value={authenticatedUser.emailAddress} />
        <CustomerProfileRow
          label="Phone"
          value={authenticatedUser.phoneNumber || '—'}
        />
        <CustomerProfileRow label="Role" value="Customer" />
      </dl>
    </Card>
  )
}
