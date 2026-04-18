import type { AuthenticatedUser } from '../models/AuthenticatedUser'

export interface UpdateProfileInput {
  readonly fullName?: string
  readonly phoneNumber?: string
}

export interface ProfileRepository {
  updateProfile(
    userIdentifier: string,
    updateProfileInput: UpdateProfileInput,
  ): Promise<AuthenticatedUser>
}
