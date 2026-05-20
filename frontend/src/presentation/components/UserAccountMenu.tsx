import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { KeyRound, LogOut, UserCog } from 'lucide-react'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { Avatar } from '../design/ui'
import { joinClassNames } from '../design/classNames'
import { ChangePasswordModal } from './profile/ChangePasswordModal'
import { ProfileEditorModal } from './profile/ProfileEditorModal'
import type { ApplicationUserRole } from '../../domain/models/AuthenticatedUser'

const roleDisplayLabelByRoleKey: Record<ApplicationUserRole, string> = {
  customer: 'Customer',
  owner: 'Shop owner',
  worker: 'Worker',
  super_admin: 'Super admin',
}

export function UserAccountMenu(): ReactElement | null {
  const { authenticatedUser, signOut, isSignOutInProgress } =
    useAuthenticatedUser()
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState<boolean>(false)
  const [isChangePasswordOpen, setIsChangePasswordOpen] =
    useState<boolean>(false)
  const menuContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }
    const handleOutsideClick = (pointerEvent: MouseEvent): void => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(pointerEvent.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }
    const handleEscapeKey = (keyboardEvent: KeyboardEvent): void => {
      if (keyboardEvent.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscapeKey)
    return (): void => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isMenuOpen])

  if (!authenticatedUser) {
    return null
  }

  const handleSignOutClicked = async (): Promise<void> => {
    setIsMenuOpen(false)
    await signOut()
  }

  const handleEditProfileClicked = (): void => {
    setIsMenuOpen(false)
    setIsProfileEditorOpen(true)
  }

  const handleChangePasswordClicked = (): void => {
    setIsMenuOpen(false)
    setIsChangePasswordOpen(true)
  }

  return (
    <div ref={menuContainerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsMenuOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-[var(--color-surface-muted)]"
      >
        <Avatar fullName={authenticatedUser.fullName} size="sm" />
        <span className="hidden text-sm font-medium text-[var(--color-ink-900)] sm:inline">
          {authenticatedUser.fullName.split(' ')[0]}
        </span>
      </button>

      {isMenuOpen ? (
        <div
          role="menu"
          className={joinClassNames(
            'absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white shadow-[var(--shadow-popover)]',
            'wl-animate-in',
          )}
        >
          <div className="border-b border-[var(--color-ink-200)] p-4">
            <div className="flex items-center gap-3">
              <Avatar fullName={authenticatedUser.fullName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
                  {authenticatedUser.fullName}
                </p>
                <p className="truncate text-xs text-[var(--color-ink-500)]">
                  {authenticatedUser.emailAddress}
                </p>
              </div>
            </div>
            <p className="mt-2 inline-flex items-center rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand-800)]">
              {roleDisplayLabelByRoleKey[authenticatedUser.role]}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleEditProfileClicked}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-ink-900)] transition-colors hover:bg-[var(--color-surface-muted)]"
          >
            <UserCog className="h-4 w-4 text-[var(--color-ink-500)]" />
            Edit profile
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleChangePasswordClicked}
            className="flex w-full items-center gap-2 border-b border-[var(--color-ink-200)] px-4 py-3 text-left text-sm font-medium text-[var(--color-ink-900)] transition-colors hover:bg-[var(--color-surface-muted)]"
          >
            <KeyRound className="h-4 w-4 text-[var(--color-ink-500)]" />
            Change password
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isSignOutInProgress}
            onClick={() => {
              void handleSignOutClicked()
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-ink-900)] transition-colors hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 text-[var(--color-ink-500)]" />
            {isSignOutInProgress ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}

      <ProfileEditorModal
        isOpen={isProfileEditorOpen}
        onClose={() => setIsProfileEditorOpen(false)}
        authenticatedUser={authenticatedUser}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  )
}
