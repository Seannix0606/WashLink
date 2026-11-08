import type { MyOwnerRelationship, OwnerRelationshipProgress, OwnerSideWorkerRelationship } from '../models/OwnerRelationship'

/** Read-only: relationships are derived by WashLink from contracts; there is no client write. */
export interface OwnerRelationshipRepository {
  /** The signed-in worker's progress; null when the server returns no row. */
  fetchMyProgress(): Promise<OwnerRelationshipProgress | null>
  listMyRelationships(): Promise<MyOwnerRelationship[]>
  /** The signed-in owner's own rows only. */
  listOwnerWorkerRelationships(): Promise<OwnerSideWorkerRelationship[]>
}
