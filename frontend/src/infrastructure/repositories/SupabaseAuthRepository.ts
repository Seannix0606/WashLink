import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type {
  ApplicationUserRole,
  AuthenticatedUser,
} from '../../domain/models/AuthenticatedUser'
import type {
  AuthRepository,
  ChangePasswordInput,
  SendPasswordResetEmailInput,
  SignUpInput,
} from '../../domain/repositories/AuthRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'

interface ProfileRow {
  id: string
  role: ApplicationUserRole
  full_name: string
  phone_number: string
}

export class SupabaseAuthRepository implements AuthRepository {
  public async signUp(signUpInput: SignUpInput, role: ApplicationUserRole): Promise<void> {
    const { error } = await getSupabaseClient().auth.signUp({
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
      throw new Error(`Failed to sign up: ${error.message}`)
    }
  }

  public async signIn(emailAddress: string, password: string): Promise<void> {
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: emailAddress,
      password,
    })

    if (error) {
      throw new Error(`Failed to sign in: ${error.message}`)
    }
  }

  public async signOut(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut()

    if (error) {
      throw new Error(`Failed to sign out: ${error.message}`)
    }
  }

  public async getCurrentSessionUserWithProfile(): Promise<AuthenticatedUser | null> {
    const {
      data: { session },
      error: sessionError,
    } = await getSupabaseClient().auth.getSession()

    if (sessionError) {
      throw new Error(`Failed to read session: ${sessionError.message}`)
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
      throw new Error(`Failed to read session: ${sessionError.message}`)
    }
    const currentUserEmailAddress = session?.user?.email ?? ''
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
      throw new Error(
        `Failed to update password: ${updatePasswordError.message}`,
      )
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
      throw new Error(
        `Failed to send password reset email: ${error.message}`,
      )
    }
  }

  public async completePasswordRecovery(newPassword: string): Promise<void> {
    const { error } = await getSupabaseClient().auth.updateUser({
      password: newPassword,
    })
    if (error) {
      throw new Error(`Failed to update password: ${error.message}`)
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
      throw new Error(`Failed to load user profile: ${error.message}`)
    }

    const profileRow = data as ProfileRow

    return {
      userIdentifier: profileRow.id,
      emailAddress: user.email ?? '',
      role: profileRow.role,
      fullName: profileRow.full_name,
      phoneNumber: profileRow.phone_number,
    }
  }
}
