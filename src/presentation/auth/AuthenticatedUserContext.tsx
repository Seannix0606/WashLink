import type { ReactElement, ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AuthService } from '../../application/services/AuthService'
import type { AuthenticatedUser } from '../../domain/models/AuthenticatedUser'
import type { SignUpInput } from '../../domain/repositories/AuthRepository'
import { SupabaseAuthRepository } from '../../infrastructure/repositories/SupabaseAuthRepository'

interface AuthenticatedUserContextValue {
  readonly authService: AuthService
  readonly authenticatedUser: AuthenticatedUser | null
  readonly isInitializingAuthState: boolean
  readonly isSignOutInProgress: boolean
  signIn: (emailAddress: string, password: string) => Promise<void>
  signUpCustomer: (signUpInput: SignUpInput) => Promise<void>
  signUpOwner: (signUpInput: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
}

const authenticatedUserContext = createContext<AuthenticatedUserContextValue | null>(null)

interface AuthenticatedUserProviderProps {
  readonly children: ReactNode
}

export function AuthenticatedUserProvider({
  children,
}: AuthenticatedUserProviderProps): ReactElement {
  const authService = useMemo(() => new AuthService(new SupabaseAuthRepository()), [])
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null)
  const [isInitializingAuthState, setIsInitializingAuthState] = useState<boolean>(true)
  const [isSignOutInProgress, setIsSignOutInProgress] = useState<boolean>(false)

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

    const authSubscription = authService.subscribeToAuthChanges(() => {
      void loadCurrentSessionUser()
    })

    return (): void => {
      isMounted = false
      authSubscription.unsubscribe()
    }
  }, [authService])

  const contextValue: AuthenticatedUserContextValue = {
    authService,
    authenticatedUser,
    isInitializingAuthState,
    isSignOutInProgress,
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
