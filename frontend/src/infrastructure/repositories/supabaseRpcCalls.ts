import { getSupabaseClient } from '../supabase/supabaseClient'
import { toUserFacingError } from '../supabase/supabaseErrorMessages'

/** W11 helpers: every oversight read and write is one RPC; tables are never selected or written. */

export async function callRpcRows<Row>(rpcName: string, rpcArguments: Record<string, unknown> | undefined, fallbackMessage: string): Promise<Row[]> {
  const rpcResponse = rpcArguments === undefined ? await getSupabaseClient().rpc(rpcName) : await getSupabaseClient().rpc(rpcName, rpcArguments)
  if (rpcResponse.error) {
    throw toUserFacingError(rpcResponse.error, fallbackMessage)
  }
  const responseData: unknown = rpcResponse.data
  if (responseData === null || responseData === undefined) {
    return []
  }
  return (Array.isArray(responseData) ? responseData : [responseData]) as Row[]
}

/** A function returning one composite row (or jsonb): exactly one value, else the fallback error. */
export async function callRpcSingle<Row>(rpcName: string, rpcArguments: Record<string, unknown>, fallbackMessage: string): Promise<Row> {
  const rows = await callRpcRows<Row>(rpcName, rpcArguments, fallbackMessage)
  const firstRow = rows.at(0)
  if (firstRow === undefined) {
    throw new Error(fallbackMessage)
  }
  return firstRow
}
