import type {
  AuthChangeEvent,
  AuthError,
  Session,
  User,
} from '@supabase/supabase-js'
import { DuplicateAccountError } from '../../domain/errors/DuplicateAccountError'
import type {
  ApplicationUserRole,
  AuthenticatedUser,
  SignUpRole,
} from '../../domain/models/AuthenticatedUser'
import type {
  AuthRepository,
  ChangePasswordInput,
  SendPasswordResetEmailInput,
  SignUpInput,
  SignUpOutcome,
} from '../../domain/repositories/AuthRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

function isDuplicateAccountAuthError(authError: AuthError): boolean {
  return (
    authError.code === 'user_already_exists' ||
    authError.code === 'email_exists' ||
    /already (been )?registered/i.test(authError.message)
  )
}

function toUserFacingSignUpMessage(authError: AuthError): string {
  // GoTrue reports database failures (e.g. a signup trigger) as "Database error ...".
  if (/database error/i.test(authError.message) || authError.status === 500) {
    return 'We could not create your account right now. Please try again later.'
  }
  if (authError.code === 'weak_password') {
    return 'Choose a stronger password and try again.'
  }
  if (authError.code === 'over_email_send_rate_limit' || authError.status === 429) {
    return 'Too many attempts. Please wait a moment, then try again.'
  }
  return 'Could not create your account. Check your details and try again.'
}

function toUserFacingSignInMessage(authError: AuthError): string {
  if (authError.code === 'invalid_credentials' || /invalid login credentials/i.test(authError.message)) {
    return 'The email or password is incorrect.'
  }
  if (authError.code === 'email_not_confirmed') {
    return 'Confirm your email address before signing in.'
  }
  if (authError.status === 429) {
    return 'Too many sign-in attempts. Please wait a moment, then try again.'
  }
  return 'Could not sign in. Please try again.'
}

interface ProfileRow {
  id: string
  role: ApplicationUserRole
  full_name: string
  phone_number: string
}

export class SupabaseAuthRepository implements AuthRepository {
  public async signUp(
    signUpInput: SignUpInput,
    role: SignUpRole,
  ): Promise<SignUpOutcome> {
    // The role sent here is only a signup hint. The database whitelists it on insert
    // (customer | owner | worker) and the app reads the role from public.profiles only.
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: signUpInput.emailAddress,
      password: signUpInput.password,
      options: {
        data: {
          role,
          full_name: signUpInput.fullName,
          phone_number: signUpInput.phoneNumber,
        },
      },
    })

    if (error) {
      if (isDuplicateAccountAuthError(error)) {
        throw new DuplicateAccountError()
      }
      throw new Error(toUserFacingSignUpMessage(error))
    }
    // With email confirmation on, GoTrue hides existing accounts by returning a user
    // without identities instead of an error.
    if (data.user?.identities?.length === 0) {
      throw new DuplicateAccountError()
    }
    return data.session ? 'can_sign_in' : 'confirmation_required'
  }

  public async signIn(emailAddress: string, password: string): Promise<void> {
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: emailAddress,
      password,
    })

    if (error) {
      throw new Error(toUserFacingSignInMessage(error))
    }
  }

  public async signOut(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut()

    if (error) {
      throw toUserFacingError(error, 'Could not sign out. Please try again.')
    }
  }

  public async getCurrentSessionUserWithProfile(): Promise<AuthenticatedUser | null> {
    const {
      data: { session },
      error: sessionError,
    } = await getSupabaseClient().auth.getSession()

    if (sessionError) {
      throw toUserFacingError(sessionError, 'Could not read your session. Sign in again.')
    }
    if (!session?.user) {
      return null
    }

    return this.fetchAuthenticatedUserProfile(session.user)
  }

  public async changePassword(
    changePasswordInput: ChangePasswordInput,
  ): Promise<void> {
    const supabaseClient = getSupabaseClient()

    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession()

    if (sessionError) {
      throw toUserFacingError(sessionError, 'Could not read your session. Sign in again.')
    }
    const currentUserEmailAddress = session?.user.email ?? ''
    if (currentUserEmailAddress.length === 0) {
      throw new Error('You must be signed in to change your password.')
    }

    const { error: reauthenticationError } =
      await supabaseClient.auth.signInWithPassword({
        email: currentUserEmailAddress,
        password: changePasswordInput.currentPassword,
      })
    if (reauthenticationError) {
      throw new Error('Current password is incorrect.')
    }

    const { error: updatePasswordError } = await supabaseClient.auth.updateUser(
      { password: changePasswordInput.newPassword },
    )
    if (updatePasswordError) {
      throw toUserFacingError(updatePasswordError, 'Could not update your password. Please try again.')
    }
  }

  public async sendPasswordResetEmail(
    sendPasswordResetEmailInput: SendPasswordResetEmailInput,
  ): Promise<void> {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
      sendPasswordResetEmailInput.emailAddress,
      { redirectTo: sendPasswordResetEmailInput.redirectToUrl },
    )
    if (error) {
      throw toUserFacingError(error, 'Could not send the password reset email. Please try again.')
    }
  }

  public async completePasswordRecovery(newPassword: string): Promise<void> {
    const { error } = await getSupabaseClient().auth.updateUser({
      password: newPassword,
    })
    if (error) {
      throw toUserFacingError(error, 'Could not update your password. Please try again.')
    }
  }

  public subscribeToAuthChanges(
    onAuthStateChanged: (
      authChangeEvent: AuthChangeEvent,
      session: Session | null,
    ) => void,
  ): { unsubscribe: () => void } {
    const { data } = getSupabaseClient().auth.onAuthStateChange(onAuthStateChanged)
    return {
      unsubscribe: (): void => {
        data.subscription.unsubscribe()
      },
    }
  }

  private async fetchAuthenticatedUserProfile(user: User): Promise<AuthenticatedUser> {
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id, role, full_name, phone_number')
      .eq('id', user.id)
      .single()

    if (error) {
      throw toUserFacingError(error, 'Could not load your account profile. Please try again.')
    }

    const profileRow = data as ProfileRow

    // S5: the role always comes from the profiles row, never from user.user_metadata.role.
    return {
      userIdentifier: profileRow.id,
      emailAddress: user.email ?? '',
      role: profileRow.role,
      fullName: profileRow.full_name,
      phoneNumber: profileRow.phone_number,
    }
  }
}
