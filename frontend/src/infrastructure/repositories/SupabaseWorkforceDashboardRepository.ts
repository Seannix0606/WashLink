import type { AdminDashboardSummary, OwnerDashboardSummary, WorkerDashboardSummary } from '../../domain/models/WorkforceDashboardSummary'
import type { WorkforceDashboardRepository } from '../../domain/repositories/WorkforceDashboardRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'
import {
  mapAdminDashboardSummaryRow,
  mapOwnerDashboardSummaryRow,
  mapWorkerDashboardSummaryRow,
  type SupabaseAdminDashboardSummaryRow,
  type SupabaseOwnerDashboardSummaryRow,
  type SupabaseWorkerDashboardSummaryRow,
} from '../supabase/supabaseWorkforceDashboardRows'

async function callSummaryRpc<Row>(rpcName: string, fallbackMessage: string): Promise<Row | null> {
  const rpcResponse = await getSupabaseClient().rpc(rpcName)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  const rows = (rpcResponse.data ?? []) as Row[]
  return rows.at(0) ?? null
}

/**
 * The three W11 summary RPCs (definer, scoped to the signed-in user and role by the database).
 * They take no arguments: the client never says whose counts it wants.
 */
export class SupabaseWorkforceDashboardRepository implements WorkforceDashboardRepository {
  public async fetchWorkerSummary(): Promise<WorkerDashboardSummary | null> {
    const summaryRow = await callSummaryRpc<SupabaseWorkerDashboardSummaryRow>('my_worker_dashboard_summary', 'Could not load your overview.')
    return summaryRow === null ? null : mapWorkerDashboardSummaryRow(summaryRow)
  }

  public async fetchOwnerSummary(): Promise<OwnerDashboardSummary | null> {
    const summaryRow = await callSummaryRpc<SupabaseOwnerDashboardSummaryRow>('owner_dashboard_summary', 'Could not load your workforce overview.')
    return summaryRow === null ? null : mapOwnerDashboardSummaryRow(summaryRow)
  }

  public async fetchAdminSummary(): Promise<AdminDashboardSummary | null> {
    const summaryRow = await callSummaryRpc<SupabaseAdminDashboardSummaryRow>('admin_dashboard_summary', 'Could not load the overview.')
    return summaryRow === null ? null : mapAdminDashboardSummaryRow(summaryRow)
  }
}
