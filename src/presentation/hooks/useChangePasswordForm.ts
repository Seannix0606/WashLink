import { useCallback, useMemo, useState } from 'react'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseChangePasswordFormOptions {
  readonly onPasswordChangedSuccessfully?: () => void
}

interface UseChangePasswordFormResult {
  readonly currentPassword: string
  readonly newPassword: string
  readonly confirmedNewPassword: string
  readonly setCurrentPassword: (nextCurrentPassword: string) => void
  readonly setNewPassword: (nextNewPassword: string) => void
  readonly setConfirmedNewPassword: (nextConfirmedNewPassword: string) => void
  readonly isChangingPassword: boolean
  readonly validationErrorMessage: string | null
  readonly isSubmitEnabled: boolean
  readonly submitPasswordChange: () => Promise<void>
  readonly resetChangePasswordForm: () => void
}

const minimumPasswordLength = 8

export function useChangePasswordForm(
  options?: UseChangePasswordFormOptions,
): UseChangePasswordFormResult {
  const { authService } = useAuthenticatedUser()
  const [currentPassword, setCurrentPassword] = useState<string>('')
  const [newPassword, setNewPassword] = useState<string>('')
  const [confirmedNewPassword, setConfirmedNewPassword] = useState<string>('')
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false)

  const validationErrorMessage = useMemo<string | null>(() => {
    if (newPassword.length === 0 || currentPassword.length === 0) {
      return null
    }
    if (newPassword.length < minimumPasswordLength) {
      return `New password must be at least ${minimumPasswordLength} characters.`
    }
    if (newPassword === currentPassword) {
      return 'New password must be different from your current password.'
    }
    if (
      confirmedNewPassword.length > 0 &&
      confirmedNewPassword !== newPassword
    ) {
      return 'New password and confirmation do not match.'
    }
    return null
  }, [confirmedNewPassword, currentPassword, newPassword])

  const isSubmitEnabled =
    currentPassword.length > 0 &&
    newPassword.length >= minimumPasswordLength &&
    confirmedNewPassword === newPassword &&
    newPassword !== currentPassword &&
    !isChangingPassword

  const resetChangePasswordForm = useCallback((): void => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmedNewPassword('')
  }, [])

  const submitPasswordChange = useCallback(async (): Promise<void> => {
    if (!isSubmitEnabled) {
      return
    }
    setIsChangingPassword(true)
    const submissionOutcome = await runServiceActionWithToast(
      () =>
        authService.changePassword({
          currentPassword,
          newPassword,
        }),
      {
        successMessage: 'Password updated.',
        fallbackErrorMessage: 'Could not update your password.',
      },
    )
    setIsChangingPassword(false)

    if (submissionOutcome !== null) {
      resetChangePasswordForm()
      if (options?.onPasswordChangedSuccessfully) {
        options.onPasswordChangedSuccessfully()
      }
    }
  }, [
    authService,
    currentPassword,
    isSubmitEnabled,
    newPassword,
    options,
    resetChangePasswordForm,
  ])

  return {
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
  }
}
