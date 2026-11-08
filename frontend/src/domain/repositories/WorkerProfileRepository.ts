import type {
  OwnWorkerProfile,
  SaveWorkerPrivateContactInput,
  SaveWorkerProfileInput,
  WorkerPrivateContact,
  WorkerProfile,
} from '../models/WorkerProfile'

/**
 * Reads and writes only the signed-in worker's own profile. Implementations take
 * the profile identifier from the session, never from caller input.
 */
export interface WorkerProfileRepository {
  fetchOwnWorkerProfile(): Promise<OwnWorkerProfile>
  upsertOwnWorkerProfile(
    saveWorkerProfileInput: SaveWorkerProfileInput,
  ): Promise<WorkerProfile>
  upsertOwnWorkerPrivateContact(
    saveWorkerPrivateContactInput: SaveWorkerPrivateContactInput,
  ): Promise<WorkerPrivateContact>
  deleteOwnWorkerPrivateContact(): Promise<void>
  deleteOwnWorkerProfile(): Promise<void>
}
