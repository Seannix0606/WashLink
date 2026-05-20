import type { ReactElement } from 'react'
import { LogOut } from 'lucide-react'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { Button } from '../design/ui'

interface SignOutButtonProps {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  readonly size?: 'sm' | 'md' | 'lg'
  readonly className?: string
}

export function SignOutButton({
  variant = 'secondary',
  size = 'sm',
  className,
}: SignOutButtonProps): ReactElement {
  const { signOut, isSignOutInProgress } = useAuthenticatedUser()

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      isLoading={isSignOutInProgress}
      leadingIcon={<LogOut className="h-4 w-4" />}
      onClick={() => {
        void signOut()
      }}
      className={className}
    >
      {isSignOutInProgress ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
