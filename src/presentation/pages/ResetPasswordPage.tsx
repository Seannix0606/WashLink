import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { BrandMark, Button, Card, Input } from '../design/ui'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

const minimumPasswordLength = 8

export function ResetPasswordPage(): ReactElement {
  const { completePasswordRecovery, dismissPasswordRecovery } =
    useAuthenticatedUser()
  const [newPassword, setNewPassword] = useState<string>('')
  const [confirmedNewPassword, setConfirmedNewPassword] = useState<string>('')
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false)
  const [isSubmittingNewPassword, setIsSubmittingNewPassword] =
    useState<boolean>(false)
  const [isDismissingRecovery, setIsDismissingRecovery] =
    useState<boolean>(false)

  const validationErrorMessage = useMemo<string | null>(() => {
    if (newPassword.length === 0) {
      return null
    }
    if (newPassword.length < minimumPasswordLength) {
      return `Password must be at least ${minimumPasswordLength} characters.`
    }
    if (
      confirmedNewPassword.length > 0 &&
      confirmedNewPassword !== newPassword
    ) {
      return 'New password and confirmation do not match.'
    }
    return null
  }, [confirmedNewPassword, newPassword])

  const isSubmitEnabled =
    newPassword.length >= minimumPasswordLength &&
    confirmedNewPassword === newPassword &&
    !isSubmittingNewPassword

  const handleSubmitNewPassword = async (): Promise<void> => {
    if (!isSubmitEnabled) {
      return
    }
    setIsSubmittingNewPassword(true)
    await runServiceActionWithToast(
      () => completePasswordRecovery(newPassword),
      {
        successMessage: 'Password updated. Please sign in with your new password.',
        fallbackErrorMessage: 'Could not update your password.',
      },
    )
    setIsSubmittingNewPassword(false)
  }

  const handleCancelRecovery = async (): Promise<void> => {
    setIsDismissingRecovery(true)
    try {
      await dismissPasswordRecovery()
    } finally {
      setIsDismissingRecovery(false)
    }
  }

  const passwordInputType = isPasswordVisible ? 'text' : 'password'

  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface-sunken)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-8 sm:px-6">
        <div className="mb-6">
          <BrandMark size="md" />
        </div>

        <Card elevation="flat" className="space-y-4 p-6">
          <header className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-[var(--color-ink-900)]">
                Set a new password
              </h1>
              <p className="text-sm text-[var(--color-ink-500)]">
                Create a strong new password to secure your WashLink account.
              </p>
            </div>
          </header>

          <form
            className="space-y-4"
            onSubmit={(formSubmitEvent) => {
              formSubmitEvent.preventDefault()
              void handleSubmitNewPassword()
            }}
          >
            <Input
              label="New password"
              name="newPassword"
              type={passwordInputType}
              value={newPassword}
              onChange={(changeEvent) =>
                setNewPassword(changeEvent.target.value)
              }
              leadingIcon={<KeyRound className="h-4 w-4" />}
              helperText={`At least ${minimumPasswordLength} characters.`}
              autoComplete="new-password"
              required
              trailingAccessory={
                <button
                  type="button"
                  aria-label={
                    isPasswordVisible ? 'Hide passwords' : 'Show passwords'
                  }
                  onClick={() =>
                    setIsPasswordVisible((previous) => !previous)
                  }
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

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isFullWidth
              isLoading={isSubmittingNewPassword}
              disabled={!isSubmitEnabled}
            >
              {isSubmittingNewPassword ? 'Updating…' : 'Update password'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              isFullWidth
              onClick={() => {
                void handleCancelRecovery()
              }}
              isLoading={isDismissingRecovery}
              disabled={isSubmittingNewPassword || isDismissingRecovery}
            >
              Cancel and sign in again
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
