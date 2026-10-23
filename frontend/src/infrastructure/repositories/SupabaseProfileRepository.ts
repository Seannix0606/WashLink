import type {
  ApplicationUserRole,
  AuthenticatedUser,
} from '../../domain/models/AuthenticatedUser'
import type {
  ProfileRepository,
  UpdateProfileInput,
} from '../../domain/repositories/ProfileRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

interface ProfileRow {
  id: string
  role: ApplicationUserRole
  full_name: string
  phone_number: string
}

const supabaseProfileSelectColumns = 'id, role, full_name, phone_number'

export class SupabaseProfileRepository implements ProfileRepository {
  public async updateProfile(
    userIdentifier: string,
    updateProfileInput: UpdateProfileInput,
  ): Promise<AuthenticatedUser> {
    const updatePayload: Record<string, unknown> = {}
    if (updateProfileInput.fullName !== undefined) {
      updatePayload.full_name = updateProfileInput.fullName
    }
    if (updateProfileInput.phoneNumber !== undefined) {
      updatePayload.phone_number = updateProfileInput.phoneNumber
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error('No profile changes were provided.')
    }

    const supabaseClient = getSupabaseClient()

    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', userIdentifier)
      .select(supabaseProfileSelectColumns)
      .single()

    if (profileError) {
      throw toUserFacingError(profileError, 'Could not update your profile. Please try again.')
    }

    const profileRow = profileData as ProfileRow

    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession()

    if (sessionError) {
      throw toUserFacingError(sessionError, 'Could not read your session. Sign in again.')
    }

    return {
      userIdentifier: profileRow.id,
      emailAddress: session?.user.email ?? '',
      role: profileRow.role,
      fullName: profileRow.full_name,
      phoneNumber: profileRow.phone_number,
    }
  }
}
