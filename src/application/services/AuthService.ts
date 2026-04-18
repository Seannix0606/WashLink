import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { AuthenticatedUser } from '../../domain/models/AuthenticatedUser'
import type {
  AuthRepository,
  SignUpInput,
} from '../../domain/repositories/AuthRepository'

export class AuthService {
  public constructor(private readonly authRepository: AuthRepository) {}

  public async signUpCustomer(signUpInput: SignUpInput): Promise<void> {
    await this.authRepository.signUp(signUpInput, 'customer')
  }

  public async signUpOwner(signUpInput: SignUpInput): Promise<void> {
    await this.authRepository.signUp(signUpInput, 'owner')
  }

  public async signIn(emailAddress: string, password: string): Promise<void> {
    await this.authRepository.signIn(emailAddress, password)
  }

  public async signOut(): Promise<void> {
    await this.authRepository.signOut()
  }

  public async getCurrentSessionUserWithProfile(): Promise<AuthenticatedUser | null> {
    return this.authRepository.getCurrentSessionUserWithProfile()
  }

  public subscribeToAuthChanges(
    onAuthStateChanged: (
      authChangeEvent: AuthChangeEvent,
      session: Session | null,
    ) => void,
  ): { unsubscribe: () => void } {
    return this.authRepository.subscribeToAuthChanges(onAuthStateChanged)
  }
}
