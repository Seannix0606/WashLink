import type { WorkforceActivityEvent } from '../../domain/models/WorkforceActivity'
import type { WorkforceActivityRepository } from '../../domain/repositories/WorkforceActivityRepository'
import { mapWorkforceActivityRow, type SupabaseWorkforceActivityRow } from '../supabase/supabaseWorkforceActivityRows'
import { callRpcRows } from './supabaseRpcCalls'

/** W14 "Your activity": the redacted `my_workforce_activity` RPC only (w14h). */
export class SupabaseWorkforceActivityRepository implements WorkforceActivityRepository {
  public async listMyActivity(beforeEventId: number | null, limit: number): Promise<WorkforceActivityEvent[]> {
    const activityRows = await callRpcRows<SupabaseWorkforceActivityRow>(
      'my_workforce_activity',
      { p_before_id: beforeEventId, p_limit: limit },
      'Could not load your activity.',
    )
    return activityRows.map(mapWorkforceActivityRow)
  }
}
