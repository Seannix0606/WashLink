import { useState, type SyntheticEvent } from 'react'
import { completeHomeLocation, emptyHomeLocationDraft, homeLocationProblem, type HomeLocationDraft } from '@washlink/shared'
import { applicationToast } from '../../presentation/design/ui'
import { useAuthenticatedUser } from '../../presentation/auth/AuthenticatedUserContext'
import { DuplicateAccountError } from '../../domain/errors/DuplicateAccountError'
import type { SignUpRole } from '../../domain/models/AuthenticatedUser'
import type {
  SignUpInput,
  SignUpOutcome,
} from '../../domain/repositories/AuthRepository'
import type { SignUpFeedback } from './SignUpFeedbackNotice'

type AuthTab = 'signIn' | 'signUp'

interface UseAuthLandingResult {
  readonly activeAuthTab: AuthTab
  readonly emailAddress: string
  readonly password: string
  readonly fullName: string
  readonly phoneNumber: string
  readonly selectedRole: SignUpRole
  readonly homeLocation: HomeLocationDraft
  readonly homeLocationError: string | null
  readonly signUpFeedback: SignUpFeedback | null
  readonly isPasswordVisible: boolean
  readonly isSubmitting: boolean
  readonly isForgotPasswordOpen: boolean
  readonly setActiveAuthTab: (nextTab: AuthTab) => void
  readonly setEmailAddress: (nextEmail: string) => void
  readonly setPassword: (nextPassword: string) => void
  readonly setFullName: (nextFullName: string) => void
  readonly setPhoneNumber: (nextPhoneNumber: string) => void
  readonly setSelectedRole: (nextRole: SignUpRole) => void
  readonly setHomeLocation: (nextHomeLocation: HomeLocationDraft) => void
  readonly togglePasswordVisibility: () => void
  readonly setIsForgotPasswordOpen: (isOpen: boolean) => void
  readonly handleSignInSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
  readonly handleSignUpSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
}

export function useAuthLanding(): UseAuthLandingResult {
  const { signIn, signUpCustomer, signUpOwner, signUpWorker } = useAuthenticatedUser()
  const [activeAuthTab, setActiveAuthTabState] = useState<AuthTab>('signIn')
  const [emailAddress, setEmailAddress] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [fullName, setFullName] = useState<string>('')
  const [phoneNumber, setPhoneNumber] = useState<string>('')
  const [selectedRole, setSelectedRole] = useState<SignUpRole>('customer')
  const [homeLocation, setHomeLocationState] = useState<HomeLocationDraft>(emptyHomeLocationDraft)
  const [homeLocationError, setHomeLocationError] = useState<string | null>(null)
  const [signUpFeedback, setSignUpFeedback] = useState<SignUpFeedback | null>(null)
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState<boolean>(false)

  const signUpByRole: Readonly<
    Record<SignUpRole, (signUpInput: SignUpInput) => Promise<SignUpOutcome>>
  > = {
    customer: signUpCustomer,
    owner: signUpOwner,
    worker: signUpWorker,
  }

  const setActiveAuthTab = (nextTab: AuthTab): void => {
    setSignUpFeedback(null)
    setActiveAuthTabState(nextTab)
  }

  const handleSignInSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      await signIn(emailAddress.trim(), password)
      applicationToast.success('Welcome back!')
    } catch (error) {
      applicationToast.error(
        error instanceof Error ? error.message : 'Unable to sign in.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignUpSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    // Customers say where they usually want their car washed, so booking can start from there.
    const isCustomer = selectedRole === 'customer'
    const homeProblem = isCustomer ? homeLocationProblem(homeLocation) : null
    setHomeLocationError(homeProblem)
    if (homeProblem !== null) {
      return
    }
    setIsSubmitting(true)
    setSignUpFeedback(null)
    const trimmedEmailAddress = emailAddress.trim()
    const completedHomeLocation = isCustomer ? completeHomeLocation(homeLocation) : null

    try {
      const signUpOutcome = await signUpByRole[selectedRole]({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        emailAddress: trimmedEmailAddress,
        password,
        ...(completedHomeLocation !== null ? { homeLocation: completedHomeLocation } : {}),
      })

      if (signUpOutcome === 'confirmation_required') {
        setSignUpFeedback({
          kind: 'confirmation_required',
          emailAddress: trimmedEmailAddress,
        })
        setPassword('')
        return
      }
      // With a session the auth listener signs the person in and routes by role.
      applicationToast.success('Account created. Welcome to WashLink!')
    } catch (error) {
      if (error instanceof DuplicateAccountError) {
        setSignUpFeedback({ kind: 'duplicate_account' })
        return
      }
      applicationToast.error(
        error instanceof Error ? error.message : 'Unable to sign up.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    activeAuthTab,
    emailAddress,
    password,
    fullName,
    phoneNumber,
    selectedRole,
    homeLocation,
    homeLocationError,
    signUpFeedback,
    isPasswordVisible,
    isSubmitting,
    isForgotPasswordOpen,
    setActiveAuthTab,
    setEmailAddress,
    setPassword,
    setFullName,
    setPhoneNumber,
    setSelectedRole,
    setHomeLocation: (nextHomeLocation: HomeLocationDraft): void => {
      setHomeLocationState(nextHomeLocation)
      setHomeLocationError(null)
    },
    togglePasswordVisibility: (): void => {
      setIsPasswordVisible((previous) => !previous)
    },
    setIsForgotPasswordOpen,
    handleSignInSubmit,
    handleSignUpSubmit,
  }
}
