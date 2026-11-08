import type {
  AdminAccessFlag,
  AdminAuditLogEvent,
  AdminAuditLogFilters,
  AdminModerationSummary,
  RelationshipLookupInput,
  RelationshipLookupResult,
  ShopRereviewDecision,
  ShopRereviewRecord,
  UnreviewedApprovedShop,
} from '../models/AdminOversight'

/** W14 super_admin oversight: RPCs only (w14f, w14g, w14h). Lookups and log searches are audited. */
export interface AdminOversightRepository {
  /** Null when the caller is not a super_admin (the database returns no row). */
  fetchModerationSummary(): Promise<AdminModerationSummary | null>
  listUnreviewedApprovedShops(): Promise<UnreviewedApprovedShop[]>
  rereviewShop(shopId: string, decision: ShopRereviewDecision, notes: string | null): Promise<ShopRereviewRecord>
  /** Recorded with its purpose and note on every call, also for an unknown id. */
  lookupRelationships(input: RelationshipLookupInput): Promise<RelationshipLookupResult>
  /** Audited on every call. */
  searchAuditLog(filters: AdminAuditLogFilters, beforeEventId: number | null, limit: number): Promise<AdminAuditLogEvent[]>
  listAccessFlags(): Promise<AdminAccessFlag[]>
}
