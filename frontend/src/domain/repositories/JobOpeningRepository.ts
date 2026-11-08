import type { JobOpening, JobOpeningStatus, SaveJobOpeningInput } from '../models/JobOpening'

/**
 * The signed-in owner's job openings. Implementations never send owner, status or
 * server-stamp columns; the database forces them. Status changes go only through
 * transition(), which the database checks against the expected current status.
 */
export interface JobOpeningRepository {
  listOwnJobOpenings(): Promise<JobOpening[]>
  createDraft(shopId: string, saveJobOpeningInput: SaveJobOpeningInput): Promise<JobOpening>
  /**
   * Saves content only if the row still has `expectedUpdatedAt`; a row that changed,
   * is gone, or is not the caller's makes the call fail instead of silently doing nothing.
   */
  updateJobOpening(
    jobOpeningId: string,
    saveJobOpeningInput: SaveJobOpeningInput,
    expectedUpdatedAt: string,
  ): Promise<JobOpening>
  /** Fails when no draft row was deleted. */
  deleteDraft(jobOpeningId: string): Promise<void>
  transition(
    jobOpeningId: string,
    fromStatus: JobOpeningStatus,
    toStatus: JobOpeningStatus,
  ): Promise<JobOpening>
  isShopVerifiedForPublishing(shopId: string): Promise<boolean>
}
