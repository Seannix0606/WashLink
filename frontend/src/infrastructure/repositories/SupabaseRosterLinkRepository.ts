import type {
  IssuedRosterLinkCode,
  RosterLinkCodePreview,
  RosterLinkEntry,
  RosterLinkPreviewResult,
  RosterLinkResult,
} from '../../domain/models/RosterLink'
import type { RosterLinkRepository } from '../../domain/repositories/RosterLinkRepository'
import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

interface SupabaseRosterLinkRow {
  worker_row_id: string
  roster_display_name: string
  is_available: boolean
  owner_shop_names: string[] | null
}

interface SupabaseIssuedLinkCodeRow {
  link_code: string
  expires_at: string
}

interface SupabaseLinkCodePreviewRow {
  result: RosterLinkPreviewResult
  roster_display_name: string | null
  owner_shop_names: string[] | null
}

interface SupabaseLinkCodeAcceptRow {
  result: RosterLinkResult
}

/** Calls an RPC and returns its data, mapping errors to user-facing text. */
async function callRosterLinkRpc(
  functionName: string,
  functionArguments: Record<string, string> | undefined,
  fallbackMessage: string,
): Promise<unknown> {
  const rpcResponse = await getSupabaseClient().rpc(functionName, functionArguments)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  const rpcData: unknown = rpcResponse.data
  return rpcData
}

/** RPCs returning a table come back as an array; these return exactly one row. */
function readFirstRow(rpcData: unknown, fallbackMessage: string): unknown {
  const firstRow: unknown = Array.isArray(rpcData) ? rpcData.at(0) : rpcData
  if (firstRow === undefined || firstRow === null) {
    throw new Error(fallbackMessage)
  }
  return firstRow
}

export class SupabaseRosterLinkRepository implements RosterLinkRepository {
  public async listMyRosterLinks(): Promise<RosterLinkEntry[]> {
    const rpcData = await callRosterLinkRpc(
      'list_my_roster_links',
      undefined,
      'Could not load your shop rosters.',
    )
    const rosterLinkRows = (Array.isArray(rpcData) ? rpcData : []) as SupabaseRosterLinkRow[]
    return rosterLinkRows.map((rosterLinkRow) => ({
      workerRowIdentifier: rosterLinkRow.worker_row_id,
      rosterDisplayName: rosterLinkRow.roster_display_name,
      isAvailable: rosterLinkRow.is_available,
      ownerShopNames: rosterLinkRow.owner_shop_names ?? [],
    }))
  }

  public async createRosterLinkCode(
    workerRowIdentifier: string,
  ): Promise<IssuedRosterLinkCode> {
    const fallbackMessage = 'Could not create a link code for this worker.'
    const rpcData = await callRosterLinkRpc(
      'create_roster_link_code',
      { p_worker_row_id: workerRowIdentifier },
      fallbackMessage,
    )
    const issuedCodeRow = readFirstRow(rpcData, fallbackMessage) as SupabaseIssuedLinkCodeRow
    return { linkCode: issuedCodeRow.link_code, expiresAt: issuedCodeRow.expires_at }
  }

  public async previewRosterLinkCode(
    normalizedLinkCode: string,
  ): Promise<RosterLinkCodePreview> {
    const fallbackMessage = 'Could not check this link code.'
    const rpcData = await callRosterLinkRpc(
      'preview_roster_link_code',
      { p_code: normalizedLinkCode },
      fallbackMessage,
    )
    const previewRow = readFirstRow(rpcData, fallbackMessage) as SupabaseLinkCodePreviewRow
    return {
      result: previewRow.result,
      rosterDisplayName: previewRow.roster_display_name,
      ownerShopNames: previewRow.owner_shop_names ?? [],
    }
  }

  public async acceptRosterLinkCode(
    normalizedLinkCode: string,
  ): Promise<RosterLinkResult> {
    const fallbackMessage = 'Could not link your account.'
    const rpcData = await callRosterLinkRpc(
      'accept_roster_link_code',
      { p_code: normalizedLinkCode },
      fallbackMessage,
    )
    return (readFirstRow(rpcData, fallbackMessage) as SupabaseLinkCodeAcceptRow).result
  }

  public async unlinkMyRosterEntry(workerRowIdentifier: string): Promise<void> {
    await callRosterLinkRpc(
      'unlink_my_roster_entry',
      { p_worker_row_id: workerRowIdentifier },
      'Could not unlink this shop roster.',
    )
  }
}
