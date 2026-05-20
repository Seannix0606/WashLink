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

export interface ChangePasswordInput {
  readonly currentPassword: string
  readonly newPassword: string
}

export interface SendPasswordResetEmailInput {
  readonly emailAddress: string
  readonly redirectToUrl: string
}

export interface AuthRepository {
  signUp(signUpInput: SignUpInput, role: ApplicationUserRole): Promise<void>
  signIn(emailAddress: string, password: string): Promise<void>
  signOut(): Promise<void>
  getCurrentSessionUserWithProfile(): Promise<AuthenticatedUser | null>
  changePassword(changePasswordInput: ChangePasswordInput): Promise<void>
  sendPasswordResetEmail(
    sendPasswordResetEmailInput: SendPasswordResetEmailInput,
  ): Promise<void>
  completePasswordRecovery(newPassword: string): Promise<void>
  subscribeToAuthChanges(
    onAuthStateChanged: (
      authChangeEvent: AuthChangeEvent,
      session: Session | null,
    ) => void,
  ): { unsubscribe: () => void }
}
