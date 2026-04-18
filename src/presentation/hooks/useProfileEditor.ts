import { useCallback, useMemo, useState } from 'react'
import type { AuthenticatedUser } from '../../domain/models/AuthenticatedUser'
import type { UpdateProfileInput } from '../../domain/repositories/ProfileRepository'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import { runServiceActionWithToast } from '../utilities/runServiceActionWithToast'

interface UseProfileEditorOptions {
  readonly onProfileSavedSuccessfully?: (
    updatedAuthenticatedUser: AuthenticatedUser,
  ) => void
}

interface UseProfileEditorResult {
  readonly draftFullName: string
  readonly draftPhoneNumber: string
  readonly setDraftFullName: (nextDraftFullName: string) => void
  readonly setDraftPhoneNumber: (nextDraftPhoneNumber: string) => void
  readonly hasUnsavedProfileChanges: boolean
  readonly isSavingProfile: boolean
  readonly saveDraftProfile: () => Promise<void>
  readonly resetDraftProfile: () => void
  readonly draftValidationErrorMessage: string | null
}

export function useProfileEditor(
  options?: UseProfileEditorOptions,
): UseProfileEditorResult {
  const { authenticatedUser, updateAuthenticatedUserProfile } =
    useAuthenticatedUser()

  const persistedFullName = authenticatedUser?.fullName ?? ''
  const persistedPhoneNumber = authenticatedUser?.phoneNumber ?? ''

  const [draftFullName, setDraftFullName] = useState<string>(persistedFullName)
  const [draftPhoneNumber, setDraftPhoneNumber] =
    useState<string>(persistedPhoneNumber)
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false)

  const hasUnsavedProfileChanges = useMemo<boolean>(
    () =>
      draftFullName.trim() !== persistedFullName.trim() ||
      draftPhoneNumber.trim() !== persistedPhoneNumber.trim(),
    [draftFullName, draftPhoneNumber, persistedFullName, persistedPhoneNumber],
  )

  const draftValidationErrorMessage = useMemo<string | null>(() => {
    if (draftFullName.trim().length === 0) {
      return 'Please enter your full name.'
    }
    if (draftFullName.trim().length < 2) {
      return 'Full name must be at least 2 characters.'
    }
    return null
  }, [draftFullName])

  const resetDraftProfile = useCallback((): void => {
    setDraftFullName(persistedFullName)
    setDraftPhoneNumber(persistedPhoneNumber)
  }, [persistedFullName, persistedPhoneNumber])

  const saveDraftProfile = useCallback(async (): Promise<void> => {
    if (draftValidationErrorMessage !== null) {
      return
    }
    if (!hasUnsavedProfileChanges) {
      return
    }

    const nextUpdateProfileInput: UpdateProfileInput = {
      ...(draftFullName.trim() !== persistedFullName.trim()
        ? { fullName: draftFullName.trim() }
        : {}),
      ...(draftPhoneNumber.trim() !== persistedPhoneNumber.trim()
        ? { phoneNumber: draftPhoneNumber.trim() }
        : {}),
    }

    setIsSavingProfile(true)
    const updatedUser = await runServiceActionWithToast(
      () => updateAuthenticatedUserProfile(nextUpdateProfileInput),
      {
        successMessage: 'Profile updated.',
        fallbackErrorMessage: 'Could not update your profile.',
      },
    )
    setIsSavingProfile(false)

    if (updatedUser !== null && options?.onProfileSavedSuccessfully) {
      options.onProfileSavedSuccessfully(updatedUser)
    }
  }, [
    draftFullName,
    draftPhoneNumber,
    draftValidationErrorMessage,
    hasUnsavedProfileChanges,
    options,
    persistedFullName,
    persistedPhoneNumber,
    updateAuthenticatedUserProfile,
  ])

  return {
    draftFullName,
    draftPhoneNumber,
    setDraftFullName,
    setDraftPhoneNumber,
    hasUnsavedProfileChanges,
    isSavingProfile,
    saveDraftProfile,
    resetDraftProfile,
    draftValidationErrorMessage,
  }
}
