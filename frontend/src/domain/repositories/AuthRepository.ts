import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type {
  AuthenticatedUser,
  SignUpRole,
} from '../models/AuthenticatedUser'

export interface SignUpInput {
  readonly emailAddress: string
  readonly password: string
  readonly fullName: string
  readonly phoneNumber: string
}

/** 'confirmation_required' when the project requires email confirmation (no session yet). */
export type SignUpOutcome = 'can_sign_in' | 'confirmation_required'

export interface ChangePasswordInput {
  readonly currentPassword: string
  readonly newPassword: string
}

export interface SendPasswordResetEmailInput {
  readonly emailAddress: string
  readonly redirectToUrl: string
}

export interface AuthRepository {
  /** Throws DuplicateAccountError when the email already has an account. */
  signUp(signUpInput: SignUpInput, role: SignUpRole): Promise<SignUpOutcome>
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
