import type { AuthenticatedUser } from '../../domain/models/AuthenticatedUser'
import type {
  ProfileRepository,
  UpdateProfileInput,
} from '../../domain/repositories/ProfileRepository'

export class ProfileService {
  public constructor(private readonly profileRepository: ProfileRepository) {}

  public async updateProfile(
    userIdentifier: string,
    updateProfileInput: UpdateProfileInput,
  ): Promise<AuthenticatedUser> {
    return this.profileRepository.updateProfile(
      userIdentifier,
      updateProfileInput,
    )
  }
}
