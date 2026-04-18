import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type {
  ApplicationUserRole,
  AuthenticatedUser,
} from '../models/AuthenticatedUser'

export interface SignUpInput {
  readonly emailAddress: string
  readonly password: string
  readonly fullName: string
  readonly phoneNumber: string
}

export interface AuthRepository {
  signUp(signUpInput: SignUpInput, role: ApplicationUserRole): Promise<void>
  signIn(emailAddress: string, password: string): Promise<void>
  signOut(): Promise<void>
  getCurrentSessionUserWithProfile(): Promise<AuthenticatedUser | null>
  subscribeToAuthChanges(
    onAuthStateChanged: (
      authChangeEvent: AuthChangeEvent,
      session: Session | null,
    ) => void,
  ): { unsubscribe: () => void }
}
