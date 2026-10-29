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
} from '../../domain/models/AdminOversight'
import type { AdminOversightRepository } from '../../domain/repositories/AdminOversightRepository'
import {
  mapAdminAccessFlagRow,
  mapAdminAuditLogRow,
  mapAdminModerationSummaryRow,
  mapRelationshipLookup,
  mapShopRereviewRecordRow,
  mapUnreviewedApprovedShopRow,
  type SupabaseAdminAccessFlagRow,
  type SupabaseAdminAuditLogRow,
  type SupabaseAdminModerationSummaryRow,
  type SupabaseShopRereviewRecordRow,
  type SupabaseUnreviewedApprovedShopRow,
} from '../supabase/supabaseAdminOversightRows'
import { callRpcRows, callRpcSingle } from './supabaseRpcCalls'

/** W14 super_admin oversight RPCs only (w14f, w14g, w14h). The database checks the role on every call. */
export class SupabaseAdminOversightRepository implements AdminOversightRepository {
  public async fetchModerationSummary(): Promise<AdminModerationSummary | null> {
    const summaryRows = await callRpcRows<SupabaseAdminModerationSummaryRow>('admin_moderation_summary', undefined, 'Could not load the moderation counts.')
    const summaryRow = summaryRows.at(0)
    return summaryRow === undefined ? null : mapAdminModerationSummaryRow(summaryRow)
  }

  public async listUnreviewedApprovedShops(): Promise<UnreviewedApprovedShop[]> {
    const shopRows = await callRpcRows<SupabaseUnreviewedApprovedShopRow>(
      'admin_unreviewed_approved_shops',
      undefined,
      'Could not load the approved shops without a recorded review.',
    )
    return shopRows.map(mapUnreviewedApprovedShopRow)
  }

  public async rereviewShop(shopId: string, decision: ShopRereviewDecision, notes: string | null): Promise<ShopRereviewRecord> {
    const recordRow = await callRpcSingle<SupabaseShopRereviewRecordRow>(
      'rereview_approved_shop',
      { p_shop_id: shopId, p_decision: decision, p_notes: notes },
      'Could not record the review.',
    )
    return mapShopRereviewRecordRow(recordRow)
  }

  public async lookupRelationships(input: RelationshipLookupInput): Promise<RelationshipLookupResult> {
    const lookupJson =
      input.kind === 'worker'
        ? await callRpcSingle<unknown>(
            'admin_worker_relationships',
            { p_worker_id: input.profileId, p_purpose: input.purpose, p_note: input.note },
            'Could not look up the relationships.',
          )
        : await callRpcSingle<unknown>(
            'admin_owner_relationships',
            { p_owner_id: input.profileId, p_purpose: input.purpose, p_note: input.note },
            'Could not look up the relationships.',
          )
    return mapRelationshipLookup(input.kind, lookupJson)
  }

  public async searchAuditLog(filters: AdminAuditLogFilters, beforeEventId: number | null, limit: number): Promise<AdminAuditLogEvent[]> {
    const eventRows = await callRpcRows<SupabaseAdminAuditLogRow>(
      'admin_workforce_audit_log',
      {
        p_action_prefix: filters.actionPrefix,
        p_subject_type: filters.subjectType,
        p_subject_id: filters.subjectId,
        p_profile_id: filters.profileId,
        p_actor_id: filters.actorId,
        p_from: filters.from,
        p_to: filters.to,
        p_before_id: beforeEventId,
        p_limit: limit,
      },
      'Could not search the audit log.',
    )
    return eventRows.map(mapAdminAuditLogRow)
  }

  public async listAccessFlags(): Promise<AdminAccessFlag[]> {
    const flagRows = await callRpcRows<SupabaseAdminAccessFlagRow>('admin_oversight_access_flags', undefined, 'Could not load the flagged disputes.')
    return flagRows.map(mapAdminAccessFlagRow)
  }
}
