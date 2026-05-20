import type { ReactElement, ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AuthService } from '../../application/services/AuthService'
import { ProfileService } from '../../application/services/ProfileService'
import type { AuthenticatedUser } from '../../domain/models/AuthenticatedUser'
import type { SignUpInput } from '../../domain/repositories/AuthRepository'
import type { UpdateProfileInput } from '../../domain/repositories/ProfileRepository'
import { SupabaseAuthRepository } from '../../infrastructure/repositories/SupabaseAuthRepository'
import { SupabaseProfileRepository } from '../../infrastructure/repositories/SupabaseProfileRepository'

interface AuthenticatedUserContextValue {
  readonly authService: AuthService
  readonly profileService: ProfileService
  readonly authenticatedUser: AuthenticatedUser | null
  readonly isInitializingAuthState: boolean
  readonly isSignOutInProgress: boolean
  readonly isPasswordRecoveryInProgress: boolean
  signIn: (emailAddress: string, password: string) => Promise<void>
  signUpCustomer: (signUpInput: SignUpInput) => Promise<void>
  signUpOwner: (signUpInput: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
  updateAuthenticatedUserProfile: (
    updateProfileInput: UpdateProfileInput,
  ) => Promise<AuthenticatedUser>
  completePasswordRecovery: (newPassword: string) => Promise<void>
  dismissPasswordRecovery: () => Promise<void>
}

const authenticatedUserContext = createContext<AuthenticatedUserContextValue | null>(null)

interface AuthenticatedUserProviderProps {
  readonly children: ReactNode
}

export function AuthenticatedUserProvider({
  children,
}: AuthenticatedUserProviderProps): ReactElement {
  const authService = useMemo(() => new AuthService(new SupabaseAuthRepository()), [])
  const profileService = useMemo(
    () => new ProfileService(new SupabaseProfileRepository()),
    [],
  )
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null)
  const [isInitializingAuthState, setIsInitializingAuthState] = useState<boolean>(true)
  const [isSignOutInProgress, setIsSignOutInProgress] = useState<boolean>(false)
  const [isPasswordRecoveryInProgress, setIsPasswordRecoveryInProgress] =
    useState<boolean>(false)

  useEffect(() => {
    let isMounted = true

    const loadCurrentSessionUser = async (): Promise<void> => {
      try {
        const currentSessionUser = await authService.getCurrentSessionUserWithProfile()
        if (isMounted) {
          setAuthenticatedUser(currentSessionUser)
        }
      } catch (error) {
        console.error('Failed to initialize authenticated user state.', error)
      } finally {
        if (isMounted) {
          setIsInitializingAuthState(false)
        }
      }
    }

    void loadCurrentSessionUser()

    const authSubscription = authService.subscribeToAuthChanges(
      (authChangeEvent) => {
        if (authChangeEvent === 'PASSWORD_RECOVERY') {
          if (isMounted) {
            setIsPasswordRecoveryInProgress(true)
          }
          return
        }
        void loadCurrentSessionUser()
      },
    )

    return (): void => {
      isMounted = false
      authSubscription.unsubscribe()
    }
  }, [authService])

  const contextValue: AuthenticatedUserContextValue = {
    authService,
    profileService,
    authenticatedUser,
    isInitializingAuthState,
    isSignOutInProgress,
    isPasswordRecoveryInProgress,
    signIn: async (emailAddress: string, password: string): Promise<void> => {
      await authService.signIn(emailAddress, password)
      const refreshedUser = await authService.getCurrentSessionUserWithProfile()
      setAuthenticatedUser(refreshedUser)
    },
    signUpCustomer: async (signUpInput: SignUpInput): Promise<void> => {
      await authService.signUpCustomer(signUpInput)
    },
    signUpOwner: async (signUpInput: SignUpInput): Promise<void> => {
      await authService.signUpOwner(signUpInput)
    },
    signOut: async (): Promise<void> => {
      setIsSignOutInProgress(true)
      try {
        await authService.signOut()
        setAuthenticatedUser(null)
      } finally {
        setIsSignOutInProgress(false)
      }
    },
    updateAuthenticatedUserProfile: async (
      updateProfileInput: UpdateProfileInput,
    ): Promise<AuthenticatedUser> => {
      if (!authenticatedUser) {
        throw new Error('Cannot update profile while signed out.')
      }
      const updatedAuthenticatedUser = await profileService.updateProfile(
        authenticatedUser.userIdentifier,
        updateProfileInput,
      )
      setAuthenticatedUser(updatedAuthenticatedUser)
      return updatedAuthenticatedUser
    },
    completePasswordRecovery: async (newPassword: string): Promise<void> => {
      await authService.completePasswordRecovery(newPassword)
      await authService.signOut()
      setAuthenticatedUser(null)
      setIsPasswordRecoveryInProgress(false)
    },
    dismissPasswordRecovery: async (): Promise<void> => {
      await authService.signOut()
      setAuthenticatedUser(null)
      setIsPasswordRecoveryInProgress(false)
    },
  }

  return (
    <authenticatedUserContext.Provider value={contextValue}>
      {children}
    </authenticatedUserContext.Provider>
  )
}

export function useAuthenticatedUser(): AuthenticatedUserContextValue {
  const contextValue = useContext(authenticatedUserContext)
  if (!contextValue) {
    throw new Error('useAuthenticatedUser must be used within AuthenticatedUserProvider')
  }
  return contextValue
}
