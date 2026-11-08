import type { MyOwnerRelationshipOverview, OwnerSideWorkerRelationship } from '../../domain/models/OwnerRelationship'
import type { OwnerRelationshipRepository } from '../../domain/repositories/OwnerRelationshipRepository'

/**
 * W10 reads. The distinct-owner count is informational only (D-3): nothing in this service
 * (or anywhere in the client) uses it to allow or refuse an action.
 */
export class OwnerRelationshipService {
  public constructor(private readonly ownerRelationshipRepository: OwnerRelationshipRepository) {}

  /** Worker: own progress and own relationships, read together so they describe the same moment. */
  public async loadMyOverview(): Promise<MyOwnerRelationshipOverview> {
    const [progress, relationships] = await Promise.all([
      this.ownerRelationshipRepository.fetchMyProgress(),
      this.ownerRelationshipRepository.listMyRelationships(),
    ])
    if (progress === null) {
      return { progress: null, relationships }
    }
    // The server already clamps at 0 (greatest(minimum - count, 0)); the client never shows a negative number.
    return { progress: { ...progress, remainingOwnerCount: Math.max(progress.remainingOwnerCount, 0) }, relationships }
  }

  /** Owner: only the owner's own rows (worker name, status, contracts with this owner). */
  public async loadOwnerWorkerRelationships(): Promise<OwnerSideWorkerRelationship[]> {
    return this.ownerRelationshipRepository.listOwnerWorkerRelationships()
  }
}
