import { useState } from 'react'
import { applicationToast } from '../../presentation/design/ui'
import { useAuthenticatedUser } from '../../presentation/auth/AuthenticatedUserContext'
import type { ApplicationUserRole } from '../../domain/models/AuthenticatedUser'

interface UseAuthLandingResult {
  readonly activeAuthTab: 'signIn' | 'signUp'
  readonly emailAddress: string
  readonly password: string
  readonly fullName: string
  readonly phoneNumber: string
  readonly selectedRole: ApplicationUserRole
  readonly isPasswordVisible: boolean
  readonly isSubmitting: boolean
  readonly isForgotPasswordOpen: boolean
  readonly setActiveAuthTab: (nextTab: 'signIn' | 'signUp') => void
  readonly setEmailAddress: (nextEmail: string) => void
  readonly setPassword: (nextPassword: string) => void
  readonly setFullName: (nextFullName: string) => void
  readonly setPhoneNumber: (nextPhoneNumber: string) => void
  readonly setSelectedRole: (nextRole: ApplicationUserRole) => void
  readonly togglePasswordVisibility: () => void
  readonly setIsForgotPasswordOpen: (isOpen: boolean) => void
  readonly handleSignInSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  readonly handleSignUpSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}

export function useAuthLanding(): UseAuthLandingResult {
  const { signIn, signUpCustomer, signUpOwner } = useAuthenticatedUser()
  const [activeAuthTab, setActiveAuthTab] = useState<'signIn' | 'signUp'>('signIn')
  const [emailAddress, setEmailAddress] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [fullName, setFullName] = useState<string>('')
  const [phoneNumber, setPhoneNumber] = useState<string>('')
  const [selectedRole, setSelectedRole] = useState<ApplicationUserRole>('customer')
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState<boolean>(false)

  const handleSignInSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
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
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const signUpInput = {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        emailAddress: emailAddress.trim(),
        password,
      }

      if (selectedRole === 'owner') {
        await signUpOwner(signUpInput)
      } else {
        await signUpCustomer(signUpInput)
      }

      applicationToast.success('Account created. You can sign in now.')
      setActiveAuthTab('signIn')
    } catch (error) {
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
    isPasswordVisible,
    isSubmitting,
    isForgotPasswordOpen,
    setActiveAuthTab,
    setEmailAddress,
    setPassword,
    setFullName,
    setPhoneNumber,
    setSelectedRole,
    togglePasswordVisibility: () => setIsPasswordVisible((previous) => !previous),
    setIsForgotPasswordOpen,
    handleSignInSubmit,
    handleSignUpSubmit,
  }
}
