import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when both URL and anon key are non-empty (does not create a client). */
export const isSupabaseConfigured = Boolean(
  supabaseUrl?.trim() && supabaseAnonKey?.trim(),
)

let cachedClient: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!cachedClient) {
    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      throw new Error(
        'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      )
    }
    cachedClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return cachedClient
}
