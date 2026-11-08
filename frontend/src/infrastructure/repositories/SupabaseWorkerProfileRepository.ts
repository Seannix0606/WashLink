import type {
  OwnWorkerProfile,
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerAvailabilityStatus,
  WorkerPreferredContactMethod,
  WorkerPrivateContact,
  WorkerProfile,
} from '../../domain/models/WorkerProfile'
import type { WorkerProfileRepository } from '../../domain/repositories/WorkerProfileRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

const workerProfileSelectColumns =
  'profile_id, headline, experience_summary, years_of_experience, skills, preferred_locations, availability_status, availability_notes, created_at, updated_at'

const workerPrivateContactSelectColumns =
  'contact_phone, contact_email, preferred_contact_method'

interface SupabaseWorkerProfileRow {
  profile_id: string
  headline: string | null
  experience_summary: string | null
  years_of_experience: number | null
  skills: string[] | null
  preferred_locations: string[] | null
  availability_status: WorkerAvailabilityStatus
  availability_notes: string | null
  created_at: string
  updated_at: string
}

interface SupabaseWorkerPrivateContactRow {
  contact_phone: string | null
  contact_email: string | null
  preferred_contact_method: WorkerPreferredContactMethod | null
}

export class SupabaseWorkerProfileRepository implements WorkerProfileRepository {
  public async fetchOwnWorkerProfile(): Promise<OwnWorkerProfile> {
    const sessionProfileIdentifier = await readSessionProfileIdentifier()
    const supabaseClient = getSupabaseClient()

    const { data: profileData, error: profileError } = await supabaseClient
      .from('worker_profiles')
      .select(workerProfileSelectColumns)
      .eq('profile_id', sessionProfileIdentifier)
      .maybeSingle()
    if (profileError) {
      throw toUserFacingError(profileError, 'Could not load your worker profile.')
    }
    if (profileData === null) {
      return { workerProfile: null, workerPrivateContact: null }
    }

    const { data: contactData, error: contactError } = await supabaseClient
      .from('worker_private_contacts')
      .select(workerPrivateContactSelectColumns)
      .eq('profile_id', sessionProfileIdentifier)
      .maybeSingle()
    if (contactError) {
      throw toUserFacingError(contactError, 'Could not load your private contact details.')
    }

    return {
      workerProfile: mapWorkerProfileRow(profileData as SupabaseWorkerProfileRow),
      workerPrivateContact:
        contactData === null
          ? null
          : mapWorkerPrivateContactRow(contactData as SupabaseWorkerPrivateContactRow),
    }
  }

  public async upsertOwnWorkerProfile(
    saveWorkerProfileInput: SaveWorkerProfileInput,
  ): Promise<WorkerProfile> {
    const sessionProfileIdentifier = await readSessionProfileIdentifier()
    const { data, error } = await getSupabaseClient()
      .from('worker_profiles')
      .upsert(
        {
          profile_id: sessionProfileIdentifier,
          headline: saveWorkerProfileInput.headline,
          experience_summary: saveWorkerProfileInput.experienceSummary,
          years_of_experience: saveWorkerProfileInput.yearsOfExperience,
          skills: saveWorkerProfileInput.skills,
          preferred_locations: saveWorkerProfileInput.preferredLocations,
          availability_status: saveWorkerProfileInput.availabilityStatus,
          availability_notes: saveWorkerProfileInput.availabilityNotes,
        },
        { onConflict: 'profile_id' },
      )
      .select(workerProfileSelectColumns)
      .single()

    if (error) {
      throw toUserFacingError(error, 'Could not save your worker profile.')
    }
    return mapWorkerProfileRow(data as SupabaseWorkerProfileRow)
  }

  public async upsertOwnWorkerPrivateContact(
    saveWorkerPrivateContactInput: SaveWorkerPrivateContactInput,
  ): Promise<WorkerPrivateContact> {
    const sessionProfileIdentifier = await readSessionProfileIdentifier()
    const { data, error } = await getSupabaseClient()
      .from('worker_private_contacts')
      .upsert(
        {
          profile_id: sessionProfileIdentifier,
          contact_phone: saveWorkerPrivateContactInput.contactPhone,
          contact_email: saveWorkerPrivateContactInput.contactEmail,
          preferred_contact_method:
            saveWorkerPrivateContactInput.preferredContactMethod,
        },
        { onConflict: 'profile_id' },
      )
      .select(workerPrivateContactSelectColumns)
      .single()

    if (error) {
      throw toUserFacingError(error, 'Could not save your private contact details.')
    }
    return mapWorkerPrivateContactRow(data as SupabaseWorkerPrivateContactRow)
  }

  public async deleteOwnWorkerPrivateContact(): Promise<void> {
    const sessionProfileIdentifier = await readSessionProfileIdentifier()
    const { error } = await getSupabaseClient()
      .from('worker_private_contacts')
      .delete()
      .eq('profile_id', sessionProfileIdentifier)
    if (error) {
      throw toUserFacingError(error, 'Could not remove your private contact details.')
    }
  }

  public async deleteOwnWorkerProfile(): Promise<void> {
    const sessionProfileIdentifier = await readSessionProfileIdentifier()
    // Deleting the profile cascades to worker_private_contacts in the database.
    const { error } = await getSupabaseClient()
      .from('worker_profiles')
      .delete()
      .eq('profile_id', sessionProfileIdentifier)
    if (error) {
      throw toUserFacingError(error, 'Could not delete your worker profile.')
    }
  }
}

async function readSessionProfileIdentifier(): Promise<string> {
  const {
    data: { session },
    error,
  } = await getSupabaseClient().auth.getSession()
  if (error || !session?.user) {
    throw new Error('Sign in again to manage your worker profile.')
  }
  return session.user.id
}

function mapWorkerProfileRow(workerProfileRow: SupabaseWorkerProfileRow): WorkerProfile {
  return {
    profileIdentifier: workerProfileRow.profile_id,
    headline: workerProfileRow.headline,
    experienceSummary: workerProfileRow.experience_summary,
    yearsOfExperience: workerProfileRow.years_of_experience,
    skills: workerProfileRow.skills ?? [],
    preferredLocations: workerProfileRow.preferred_locations ?? [],
    availabilityStatus: workerProfileRow.availability_status,
    availabilityNotes: workerProfileRow.availability_notes,
    createdAt: workerProfileRow.created_at,
    updatedAt: workerProfileRow.updated_at,
  }
}

function mapWorkerPrivateContactRow(
  workerPrivateContactRow: SupabaseWorkerPrivateContactRow,
): WorkerPrivateContact {
  return {
    contactPhone: workerPrivateContactRow.contact_phone,
    contactEmail: workerPrivateContactRow.contact_email,
    preferredContactMethod: workerPrivateContactRow.preferred_contact_method,
  }
}
