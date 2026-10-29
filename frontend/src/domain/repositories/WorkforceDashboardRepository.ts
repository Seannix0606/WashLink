import type { AdminDashboardSummary, OwnerDashboardSummary, WorkerDashboardSummary } from '../models/WorkforceDashboardSummary'

/** Read-only W11 summaries. Each returns null when the database returns no row (wrong role or signed out). */
export interface WorkforceDashboardRepository {
  fetchWorkerSummary(): Promise<WorkerDashboardSummary | null>
  fetchOwnerSummary(): Promise<OwnerDashboardSummary | null>
  fetchAdminSummary(): Promise<AdminDashboardSummary | null>
}
