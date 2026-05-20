import type { ReactElement } from 'react'
import { useState } from 'react'
import { KeyRound, Mail, Phone, User } from 'lucide-react'
import type {
  ApplicationUserRole,
  AuthenticatedUser,
} from '../../../domain/models/AuthenticatedUser'
import { Button, Card, Input } from '../../design/ui'
import { useProfileEditor } from '../../hooks/useProfileEditor'
import { ChangePasswordModal } from './ChangePasswordModal'

const roleDisplayLabelByRoleKey: Record<ApplicationUserRole, string> = {
  customer: 'Customer',
  owner: 'Shop owner',
  worker: 'Worker',
  super_admin: 'Super admin',
}

interface ProfileEditorCardProps {
  readonly authenticatedUser: AuthenticatedUser
  readonly isEmbeddedInModal?: boolean
  readonly onProfileSavedSuccessfully?: () => void
}

export function ProfileEditorCard({
  authenticatedUser,
  isEmbeddedInModal = false,
  onProfileSavedSuccessfully,
}: ProfileEditorCardProps): ReactElement {
  const [isChangePasswordOpen, setIsChangePasswordOpen] =
    useState<boolean>(false)
  const {
    draftFullName,
    draftPhoneNumber,
    setDraftFullName,
    setDraftPhoneNumber,
    hasUnsavedProfileChanges,
    isSavingProfile,
    saveDraftProfile,
    resetDraftProfile,
    draftValidationErrorMessage,
  } = useProfileEditor({
    onProfileSavedSuccessfully: (): void => {
      if (onProfileSavedSuccessfully) {
        onProfileSavedSuccessfully()
      }
    },
  })

  const formBody: ReactElement = (
    <form
      className="space-y-4"
      onSubmit={(formSubmitEvent) => {
        formSubmitEvent.preventDefault()
        void saveDraftProfile()
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-ink-900)]">
            Account details
          </h2>
          <p className="text-xs text-[var(--color-ink-500)]">
            Keep your contact details up to date.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand-800)]">
          {roleDisplayLabelByRoleKey[authenticatedUser.role]}
        </span>
      </div>

      <Input
        label="Full name"
        name="fullName"
        value={draftFullName}
        onChange={(changeEvent) => setDraftFullName(changeEvent.target.value)}
        leadingIcon={<User className="h-4 w-4" />}
        errorText={draftValidationErrorMessage ?? undefined}
        required
        autoComplete="name"
      />

      <Input
        label="Phone number"
        name="phoneNumber"
        value={draftPhoneNumber}
        onChange={(changeEvent) => setDraftPhoneNumber(changeEvent.target.value)}
        leadingIcon={<Phone className="h-4 w-4" />}
        helperText="Used so your worker can reach you on the day."
        placeholder="e.g. +63 912 345 6789"
        inputMode="tel"
        autoComplete="tel"
      />

      <Input
        label="Email"
        name="emailAddress"
        value={authenticatedUser.emailAddress}
        leadingIcon={<Mail className="h-4 w-4" />}
        helperText="Email can’t be changed here. Contact support if you need to update it."
        disabled
        readOnly
      />

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetDraftProfile}
          disabled={!hasUnsavedProfileChanges || isSavingProfile}
        >
          Reset
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          isLoading={isSavingProfile}
          disabled={
            !hasUnsavedProfileChanges ||
            draftValidationErrorMessage !== null ||
            isSavingProfile
          }
        >
          {isSavingProfile ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )

  const securitySection: ReactElement | null = isEmbeddedInModal ? null : (
    <div className="mt-5 border-t border-[var(--color-ink-200)] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">
            Security
          </h3>
          <p className="text-xs text-[var(--color-ink-500)]">
            Keep your account safe with a strong, unique password.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<KeyRound className="h-4 w-4" />}
          onClick={() => setIsChangePasswordOpen(true)}
        >
          Change password
        </Button>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  )

  if (isEmbeddedInModal) {
    return formBody
  }

  return (
    <Card elevation="flat" className="p-5">
      {formBody}
      {securitySection}
    </Card>
  )
}
