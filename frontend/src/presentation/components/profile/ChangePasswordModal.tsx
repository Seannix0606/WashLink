import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react'
import { Button, Input, Modal } from '../../design/ui'
import { useChangePasswordForm } from '../../hooks/useChangePasswordForm'

interface ChangePasswordModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

export function ChangePasswordModal({
  isOpen,
  onClose,
}: ChangePasswordModalProps): ReactElement {
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false)
  const {
    currentPassword,
    newPassword,
    confirmedNewPassword,
    setCurrentPassword,
    setNewPassword,
    setConfirmedNewPassword,
    isChangingPassword,
    validationErrorMessage,
    isSubmitEnabled,
    submitPasswordChange,
    resetChangePasswordForm,
  } = useChangePasswordForm({
    onPasswordChangedSuccessfully: onClose,
  })

  useEffect(() => {
    if (!isOpen) {
      resetChangePasswordForm()
      setIsPasswordVisible(false)
    }
  }, [isOpen, resetChangePasswordForm])

  const passwordInputType = isPasswordVisible ? 'text' : 'password'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change password">
      <form
        className="space-y-4"
        onSubmit={(formSubmitEvent) => {
          formSubmitEvent.preventDefault()
          void submitPasswordChange()
        }}
      >
        <p className="text-xs text-[var(--color-ink-500)]">
          For your security, please re-enter your current password to confirm
          it’s really you.
        </p>

        <Input
          label="Current password"
          name="currentPassword"
          type={passwordInputType}
          value={currentPassword}
          onChange={(changeEvent) =>
            setCurrentPassword(changeEvent.target.value)
          }
          leadingIcon={<Lock className="h-4 w-4" />}
          autoComplete="current-password"
          required
        />

        <Input
          label="New password"
          name="newPassword"
          type={passwordInputType}
          value={newPassword}
          onChange={(changeEvent) => setNewPassword(changeEvent.target.value)}
          leadingIcon={<KeyRound className="h-4 w-4" />}
          helperText="At least 8 characters. Mix letters, numbers, and symbols for extra safety."
          autoComplete="new-password"
          required
          trailingAccessory={
            <button
              type="button"
              aria-label={
                isPasswordVisible ? 'Hide passwords' : 'Show passwords'
              }
              onClick={() => setIsPasswordVisible((previous) => !previous)}
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-ink-500)] transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              {isPasswordVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
        />

        <Input
          label="Confirm new password"
          name="confirmedNewPassword"
          type={passwordInputType}
          value={confirmedNewPassword}
          onChange={(changeEvent) =>
            setConfirmedNewPassword(changeEvent.target.value)
          }
          leadingIcon={<KeyRound className="h-4 w-4" />}
          errorText={validationErrorMessage ?? undefined}
          autoComplete="new-password"
          required
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isChangingPassword}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isChangingPassword}
            disabled={!isSubmitEnabled}
          >
            {isChangingPassword ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
