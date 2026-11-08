import type { MyOwnerRelationship, OwnerRelationshipProgress, OwnerSideWorkerRelationship } from '../../domain/models/OwnerRelationship'
import type { OwnerRelationshipRepository } from '../../domain/repositories/OwnerRelationshipRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  mapMyOwnerRelationshipRow,
  mapOwnerRelationshipProgressRow,
  mapOwnerWorkerRelationshipRow,
  type SupabaseMyOwnerRelationshipRow,
  type SupabaseOwnerRelationshipProgressRow,
  type SupabaseOwnerWorkerRelationshipRow,
} from '../supabase/supabaseOwnerRelationshipRows'

async function callReadRpc<Row>(rpcName: string, fallbackMessage: string): Promise<Row[]> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  return (rpcResponse.data ?? []) as Row[]
}

/**
 * The three W10 read RPCs only (definer, scoped to the signed-in user by the database).
 * The relationship table is never selected or written from the client.
 */
export class SupabaseOwnerRelationshipRepository implements OwnerRelationshipRepository {
  public async fetchMyProgress(): Promise<OwnerRelationshipProgress | null> {
    const progressRows = await callReadRpc<SupabaseOwnerRelationshipProgressRow>(
      'my_owner_relationship_progress',
      'Could not load your progress.',
    )
    const progressRow = progressRows.at(0)
    return progressRow === undefined ? null : mapOwnerRelationshipProgressRow(progressRow)
  }

  public async listMyRelationships(): Promise<MyOwnerRelationship[]> {
    const relationshipRows = await callReadRpc<SupabaseMyOwnerRelationshipRow>(
      'my_owner_relationships',
      'Could not load your owner relationships.',
    )
    return relationshipRows.map(mapMyOwnerRelationshipRow)
  }

  public async listOwnerWorkerRelationships(): Promise<OwnerSideWorkerRelationship[]> {
    const relationshipRows = await callReadRpc<SupabaseOwnerWorkerRelationshipRow>(
      'owner_worker_relationships',
      'Could not load your worker relationships.',
    )
    return relationshipRows.map(mapOwnerWorkerRelationshipRow)
  }
}
